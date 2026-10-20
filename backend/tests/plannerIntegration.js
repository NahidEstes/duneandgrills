import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import plannerRoutes from "../routes/plannerRoutes.js";
import authRoutes from "../routes/authRoutes.js";
import { csrfProtection } from "../middleware/security.js";
import PlannerTask from "../models/PlannerTask.js";
import PlannerSeries from "../models/PlannerSeries.js";
import User from "../models/User.js";
import InventoryItem from "../models/InventoryItem.js";
import Supplier from "../models/Supplier.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import { plannerDay, shiftPlannerDay } from "../services/plannerRules.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "planner-owned-tests-do-not-use-in-production";
const plannerCollections = new Set([PlannerTask.collection.collectionName, PlannerSeries.collection.collectionName]);
async function businessSnapshot() {
  const snapshot = {};
  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const { name } of collections) {
    if (plannerCollections.has(name) || name.startsWith("system.")) continue;
    snapshot[name] = JSON.stringify(await mongoose.connection.db.collection(name).find({}).sort({ _id: 1 }).toArray());
  }
  return snapshot;
}

test("Planner reminders, recurrence and references never mutate business data (owned replica set)", { timeout: 240000 }, async t => withIsolatedMongo(async () => {
  const actors = {};
  for (const role of ["admin", "manager", "customer", "cashier", "kitchen", "inventory", "accountant", "rider"]) actors[role] = await User.create({ name: `Planner ${role}`, email: `${role}@planner-owned.test`, password: "TestPassword123!", role, phone: "0500000000", pointsBalance: 120 });
  const tokens = Object.fromEntries(Object.entries(actors).map(([role, user]) => [role, jwt.sign({ id: String(user._id), sv: 0 }, process.env.JWT_SECRET)]));
  const inventoryId = new mongoose.Types.ObjectId(), supplierId = new mongoose.Types.ObjectId(), invoiceId = new mongoose.Types.ObjectId(), purchaseId = new mongoose.Types.ObjectId();
  // Minimal raw fixtures are safe: every collection belongs to the temporary DB.
  await InventoryItem.collection.insertOne({ _id: inventoryId, name: "Planner fixture chicken", sku: "PLAN-001", currentStock: 100, unitCost: 12, isActive: true });
  await Supplier.collection.insertOne({ _id: supplierId, name: "Planner fixture supplier", code: "SUP-PLAN", isActive: true });
  await SupplierInvoice.collection.insertOne({ _id: invoiceId, internalReference: "INV-PLAN-001", supplierInvoiceNumber: "VENDOR-PLAN-001", supplier: supplierId, status: "posted", paymentStatus: "unpaid", total: 500, paidAmountHalala: 0 });
  await PurchaseOrder.collection.insertOne({ _id: purchaseId, orderNumber: "PO-PLAN-001", supplier: supplierId, status: "ordered", total: 500 });
  for (const name of ["orders", "expenses", "supplierpayments", "cashmovements", "stocktransactions", "attendances", "shifts", "refunds", "offers", "inventorybatches", "posshifts"]) await mongoose.connection.db.collection(name).insertOne({ marker: "Planner isolation fixture", status: "unchanged", amount: 250, stock: 25 });
  const app = express(); app.use(express.json(), csrfProtection);
  app.use("/api/planner", plannerRoutes); app.use("/api/auth", authRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const api = async (role, resource, body, method = body === undefined ? "GET" : "POST") => {
    const response = await fetch(origin + "/api" + resource, { method, headers: { "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const today = plannerDay();
  const reminder = (extra = {}) => ({ requestId: randomUUID(), title: "Pay supplier reminder", category: "Finance Reminder", priority: "High", dueDate: today, time: "10:00", repeat: "none", checklist: [{ text: "Review invoice", done: false }, { text: "Call supplier", done: false }], notes: "Reminder to pay SAR 500; no accounting entry", responsibleId: String(actors.manager._id), linkedRecord: { type: "invoice", id: String(invoiceId) }, ...extra });
  const findTask = async title => PlannerTask.findOne({ title, deleted: false }).lean();
  let single, daily;
  const before = await businessSnapshot();
  try {
    await t.test("existing admin-panel roles only; no public or other staff access", async () => {
      assert.equal((await api(null, "/planner")).status, 401);
      for (const role of ["customer", "cashier", "kitchen", "inventory", "accountant", "rider"]) {
        assert.equal((await api(role, "/planner/config")).status, 403);
        assert.equal((await api(role, "/planner", reminder())).status, 403);
      }
      assert.equal((await api("manager", "/planner/config")).status, 200);
      assert.equal((await api("admin", "/planner/references?type=__proto__")).status, 400);
      assert.equal((await api("admin", "/planner", reminder({ amount: 500 }))).status, 400);
      assert.equal((await api("admin", "/planner", reminder({ time: "25:00" }))).status, 400);
    });
    await t.test("idempotent create, read-only references, checklist, status, revision conflicts and deletion", async () => {
      const body = reminder();
      const replies = await Promise.all([api("admin", "/planner", body), api("admin", "/planner", body)]);
      assert.ok(replies.every(row => [200, 201].includes(row.status)), JSON.stringify(replies));
      assert.equal(await PlannerSeries.countDocuments({ requestKey: `${actors.admin._id}:${body.requestId}` }), 1);
      single = await findTask(body.title); assert.ok(single);
      assert.equal(single.linkedRecord.label, "INV-PLAN-001 · VENDOR-PLAN-001");
      assert.equal(single.responsible.name.startsWith("Planner manager"), true);
      assert.equal((await api("admin", "/planner", { ...body, title: "Different contents" })).status, 409);
      const detail = await api("admin", `/planner/${single._id}`); assert.equal(detail.body.data.linkedRecord.available, true); assert.match(detail.body.data.linkedRecord.href, /record-search\?type=invoice/);
      const progress = await api("manager", `/planner/${single._id}/progress`, { revision: single.revision, checklist: [true, false], status: "In Progress" }, "PATCH"); assert.equal(progress.status, 200, JSON.stringify(progress.body));
      assert.equal(progress.body.data.checklist[0].done, true);
      assert.equal((await api("admin", `/planner/${single._id}/progress`, { revision: single.revision, status: "Done" }, "PATCH")).status, 409);
      const complete = await api("admin", `/planner/${single._id}/progress`, { revision: progress.body.data.revision, status: "Done" }, "PATCH"); assert.equal(complete.status, 200); assert.ok(complete.body.data.completedAt);
      const list = await api("admin", "/planner?filter=completed"); assert.equal(list.body.summary.completed, 1); assert.equal(list.body.data[0].title, body.title);
      const cancelled = await api("admin", `/planner/${single._id}/progress`, { revision: complete.body.data.revision, status: "Cancelled" }, "PATCH"); assert.equal(cancelled.status, 200);
      assert.equal((await api("admin", `/planner/${single._id}`, { revision: cancelled.body.data.revision }, "DELETE")).status, 200);
      assert.equal((await api("admin", `/planner/${single._id}`)).status, 404);
      assert.ok((await PlannerTask.findById(single._id)).history.some(row => row.action === "Reminder deleted"));
    });
    await t.test("recurring reminders catch up missed days and concurrent refreshes never duplicate occurrences", async () => {
      const body = reminder({ title: "Daily fridge check", category: "Kitchen", repeat: "daily", dueDate: shiftPlannerDay(today, -3), linkedRecord: { type: "inventory", id: String(inventoryId) } });
      assert.equal((await api("admin", "/planner", body)).status, 201);
      const lists = await Promise.all([api("admin", "/planner?filter=today"), api("manager", "/planner?filter=upcoming"), api("admin", "/planner?filter=overdue")]);
      assert.ok(lists.every(row => row.status === 200), JSON.stringify(lists));
      daily = await findTask(body.title);
      const occurrences = await PlannerTask.find({ groupId: daily.groupId, deleted: false }).lean();
      assert.equal(occurrences.length, new Set(occurrences.map(row => row.scheduledOn)).size);
      assert.ok(occurrences.some(row => row.dueDate === shiftPlannerDay(today, -2)));
      assert.ok(occurrences.some(row => row.dueDate === shiftPlannerDay(today, 60)));
      assert.ok(lists[2].body.summary.overdue >= 3);
      const removed = occurrences.find(row => row.dueDate === shiftPlannerDay(today, 5));
      await api("admin", `/planner/${removed._id}`, { revision: removed.revision }, "DELETE");
      await api("admin", "/planner?filter=upcoming");
      assert.equal(await PlannerTask.countDocuments({ groupId: daily.groupId, scheduledOn: removed.scheduledOn, deleted: false }), 0);
    });
    await t.test("single-occurrence edits stay local; future changes preserve completed history and reset checklists", async () => {
      const one = await PlannerTask.findOne({ groupId: daily.groupId, dueDate: today, deleted: false }).lean();
      const body = reminder({ title: "One fridge check changed", category: "Kitchen", repeat: "daily", checklist: [{ text: "Check temperature", done: true }], linkedRecord: null, scope: "occurrence", revision: one.revision });
      assert.equal((await api("admin", `/planner/${one._id}`, body, "PATCH")).status, 200);
      assert.equal((await PlannerTask.findOne({ groupId: daily.groupId, dueDate: shiftPlannerDay(today, 1), deleted: false })).title, "Daily fridge check");
      const done = await api("admin", `/planner/${one._id}/progress`, { revision: one.revision + 1, status: "Done" }, "PATCH"); assert.equal(done.status, 200);
      const preserved = JSON.stringify(await PlannerTask.findById(one._id).lean());
      const future = reminder({ title: "New weekly fridge check", category: "Kitchen", dueDate: today, repeat: "weekly", checklist: [{ text: "Check temperature", done: true }], linkedRecord: null, scope: "future", revision: done.body.data.revision });
      const changed = await api("admin", `/planner/${one._id}`, future, "PATCH"); assert.equal(changed.status, 200, JSON.stringify(changed.body));
      assert.equal((await api("admin", `/planner/${one._id}`, future, "PATCH")).status, 200, "Future update retries are idempotent");
      await api("admin", "/planner?filter=upcoming");
      assert.equal(JSON.stringify(await PlannerTask.findById(one._id).lean()), preserved);
      const next = await PlannerTask.findOne({ groupId: daily.groupId, dueDate: shiftPlannerDay(today, 7), deleted: false }).lean();
      assert.equal(next.title, "New weekly fridge check"); assert.equal(next.checklist[0].done, false);
      assert.equal(await PlannerTask.countDocuments({ groupId: daily.groupId, dueDate: shiftPlannerDay(today, 1), deleted: false }), 0);
      const pendingFuture = reminder({ title: "Changed pending repeat", category: "Kitchen", dueDate: next.dueDate, time: next.time, repeat: "daily", linkedRecord: null, scope: "future", revision: next.revision });
      const changedPending = await api("admin", `/planner/${next._id}`, pendingFuture, "PATCH");
      assert.equal(changedPending.status, 200, JSON.stringify(changedPending.body));
      await api("admin", "/planner?filter=upcoming");
      assert.equal(await PlannerTask.countDocuments({ groupId: daily.groupId, scheduledOn: next.scheduledOn, deleted: false }), 1);
    });
    await t.test("monthly schedules and missing references remain usable without business-side writes", async () => {
      const year = Number(today.slice(0, 4));
      const body = reminder({ title: "Monthly service", dueDate: `${year}-01-31`, repeat: "monthly", linkedRecord: null, responsibleId: "" });
      const monthly = await api("admin", "/planner", body); assert.equal(monthly.status, 201, JSON.stringify(monthly.body));
      await api("admin", "/planner?filter=upcoming");
      assert.ok(await PlannerTask.exists({ title: body.title, dueDate: `${year}-03-31`, deleted: false }));
      const march = await PlannerTask.findOne({ title: body.title, dueDate: `${year}-03-31`, deleted: false }).lean();
      // Reference deletion is a fixture action, not a Planner action. Restore it before comparing snapshots.
      const supplier = await Supplier.findById(supplierId).lean();
      const linked = reminder({ title: "Call deleted supplier", linkedRecord: { type: "supplier", id: String(supplierId) } });
      await api("admin", "/planner", linked);
      const task = await findTask(linked.title);
      await Supplier.collection.deleteOne({ _id: supplierId });
      assert.equal((await api("admin", `/planner/${task._id}`)).body.data.linkedRecord.available, false);
      assert.equal((await api("admin", `/planner/${task._id}`, { ...linked, title: "Kept deleted supplier reference", scope: "occurrence", revision: task.revision }, "PATCH")).status, 200);
      await Supplier.collection.insertOne(supplier);
      assert.equal((await api("admin", `/planner/${march._id}/progress`, { revision: march.revision, paymentStatus: "paid" }, "PATCH")).status, 400);
      assert.deepEqual(await businessSnapshot(), before, "All non-Planner collections remain byte-for-byte unchanged after every Planner workflow");
    });
    if (process.env.RUN_PLANNER_BROWSER === "1") await t.test("three screens, desktop/mobile, real API and financial isolation", async () => {
      const { runPlannerBrowser } = await import("./helpers/plannerBrowser.js");
      const snapshot = await businessSnapshot();
      await runPlannerBrowser({ origin, tokens, today });
      assert.deepEqual(await businessSnapshot(), snapshot, "Browser Planner actions cannot change any business data");
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
}));
