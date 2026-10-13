import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import Delivery from "../models/Delivery.js";
import RestaurantSettings from "../models/RestaurantSettings.js";
import CashMovement from "../models/CashMovement.js";
import StockTransaction from "../models/StockTransaction.js";
import { listWorkflowDeliveries } from "../services/deliveryReadService.js";
import { getWorkflowDelivery, actOnDelivery } from "../services/deliveryWorkflowService.js";
import { riderHistoryQuery, riderTimeline, restaurantContact } from "../services/riderReadPresentation.js";
import { startOfRiyadhDay } from "../utils/adminDate.js";

test("rider history uses inclusive Riyadh delivered dates and validates unsupported filters", () => {
  const now = new Date("2026-12-31T21:00:00Z");
  assert.equal(riderHistoryQuery({ history: "true", datePeriod: "today" }, now).deliveredAt.$gte.toISOString(), "2026-12-31T21:00:00.000Z");
  assert.equal(riderHistoryQuery({ history: "true", datePeriod: "yesterday" }, now).deliveredAt.$lt.toISOString(), "2026-12-31T21:00:00.000Z");
  assert.equal(riderHistoryQuery({ history: "true", datePeriod: "custom", from: "2028-02-29", to: "2028-02-29" }).deliveredAt.$lt.toISOString(), "2028-02-29T21:00:00.000Z");
  for (const query of [{ datePeriod: "today" }, { history: "true", cashStatus: "confirmed_today" }, { history: "true", datePeriod: "custom" }, { history: "true", datePeriod: "custom", from: "2026-02-29", to: "2026-03-01" }]) assert.throws(() => riderHistoryQuery(query));
});

test("rider timeline allowlist never reveals managers or other riders' history", () => {
  const stamp = "2026-10-01T12:00:00Z";
  const own = { reportedBy: "own", reportedAt: stamp, reason: "Own obstacle", resolvedAt: stamp, resolution: "PRIVATE manager note", resolvedBy: "PRIVATE manager" };
  const timeline = riderTimeline({ status: "assigned", assignedAt: stamp, cashReport: { reportedBy: "other", reportedAt: stamp },
    issueHistory: [own, { reportedBy: "other", reportedAt: stamp, reason: "PRIVATE other issue" }], issue: own }, "own");
  assert.equal(timeline.events.length, 2); assert.equal(timeline.steps[3].at, null); assert.equal(timeline.steps[1].at, null);
  assert.doesNotMatch(JSON.stringify(timeline), /PRIVATE/);
});

test("rider-scoped pending cash, assignment signal, history and revision safety in owned Mongo", async t => {
  const keys = ["NODE_ENV", "MONGO_URI", "RIDER_WORKFLOW_ENABLED"], saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try { await withIsolatedMongo(async ({ uri }) => {
    assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:\d+\/dg_record_id_test\?/);
    Object.assign(process.env, { NODE_ENV: "test", MONGO_URI: uri, RIDER_WORKFLOW_ENABLED: "true" });
    const rider = await User.create({ role: "rider", name: "Local rider", email: "rider@accuracy.invalid", password: "LocalDummy123!" });
    const other = await User.create({ role: "rider", name: "Other", email: "other@accuracy.invalid", password: "LocalDummy123!" });
    let sequence = 0;
    const make = async (changes = {}, orderChanges = {}) => {
      const order = await Order.create({ orderNumber: `TEST-ACCURACY-${++sequence}`, source: "website", orderType: "delivery", deliveryMode: "restaurant", status: "delivered",
        paymentStatus: "pending", totalAmount: 40, subtotal: 40, customer: { name: "Private fixture", phone: "+0000000000", address: "Private address" },
        items: [{ menuItem: new mongoose.Types.ObjectId(), name: "Dummy", quantity: 1, price: 40 }], inventoryStatus: "not_required", ...orderChanges });
      return Delivery.create({ order: order._id, rider: rider._id, status: "delivered", assignedAt: new Date(), deliveredAt: new Date(),
        assignmentHistory: [{ rider: rider._id, actor: other._id, at: new Date(), reason: "PRIVATE assignment" }], ...changes });
    };
    const rows = [];
    for (let n = 0; n < 24; n++) rows.push(await make());
    const reported = await make({ cashReport: { status: "unconfirmed", amountHalala: 4000, reportedBy: rider._id, reportedAt: new Date() } });
    await make({ cashReport: { status: "discrepancy", amountHalala: 3000, reportedBy: rider._id, reportedAt: new Date(), reason: "PRIVATE shortage" } });
    const foreign = await make({ rider: other._id, assignmentHistory: [{ rider: other._id, actor: other._id, at: new Date() }] });
    const issue = await make({ status: "issue", deliveredAt: null, issue: { previousStatus: "picked_up", reportedBy: rider._id, reportedAt: new Date(), reason: "Own obstacle" } }, { status: "out-for-delivery" });
    await t.test("all-page counts/amounts and bounded direct links are isolated and cash parity holds", async () => {
      const list = await listWorkflowDeliveries(rider, { limit: "1" });
      assert.equal(list.deliveries[0].id, String(issue._id)); assert.equal(list.counts.active, 1);
      assert.deepEqual(list.pendingCash.groups.collection_pending, { count: 24, amountHalala: 96000 });
      assert.deepEqual(list.pendingCash.groups.awaiting_confirmation, { count: 1, amountHalala: 4000 });
      assert.deepEqual(list.pendingCash.groups.discrepancy, { count: 1, amountHalala: 3000 });
      assert.equal(list.pendingCash.deliveries.length, 5); assert.ok(list.pendingCash.deliveries.every(row => row.riderId === String(rider._id)));
      const detail = await getWorkflowDelivery(rider, String(reported._id));
      const history = await listWorkflowDeliveries(rider, { history: "true", cashStatus: "awaiting_confirmation" });
      assert.equal(history.deliveries.length, 1); assert.equal(detail.cashState, history.deliveries[0].cashState); assert.equal(detail.customerCollectionHalala, null);
      assert.equal(detail.reportedCashHalala, 4000); assert.equal(detail.customer, null); assert.equal(detail.timeline, undefined); assert.ok(detail.riderTimeline);
      assert.doesNotMatch(JSON.stringify(detail), /Private address|\+0000000000|PRIVATE/);
      await assert.rejects(getWorkflowDelivery(rider, String(foreign._id)), error => error.status === 404);
      await assert.rejects(listWorkflowDeliveries(rider, { riderId: String(other._id) }));
    });
    await t.test("assignment events are stable across pages/stages and increase only on actual own assignments", async () => {
      const first = await listWorkflowDeliveries(rider, { history: "true", page: "1", limit: "1" });
      assert.equal((await listWorkflowDeliveries(rider, { history: "true", page: "2", limit: "1" })).assignmentCount, first.assignmentCount);
      await Delivery.updateOne({ _id: issue._id }, { $set: { status: "picked_up" } });
      assert.equal((await listWorkflowDeliveries(rider)).assignmentCount, first.assignmentCount);
      await Delivery.updateOne({ _id: issue._id }, { $push: { assignmentHistory: { rider: rider._id, actor: other._id, at: new Date() } } });
      assert.equal((await listWorkflowDeliveries(rider)).assignmentCount, first.assignmentCount + 1);
      await Delivery.updateOne({ _id: issue._id }, { $set: { rider: other._id } });
      assert.equal((await listWorkflowDeliveries(rider)).assignmentCount, first.assignmentCount + 1);
      await Delivery.updateOne({ _id: issue._id }, { $set: { rider: rider._id, status: "issue" } });
    });
    await t.test("issues are server-filtered; history always excludes active orders", async () => {
      const list = await listWorkflowDeliveries(rider, { status: "issue" });
      assert.equal(list.pagination.total, 1); assert.equal(list.deliveries[0].issue.previousStatus, "picked_up");
      assert.equal((await listWorkflowDeliveries(rider, { history: "true", status: "assigned" })).pagination.total, 0);
    });
    await t.test("delivered-day midnight filters precede pagination and do not use entry date", async () => {
      const midnight = startOfRiyadhDay();
      await Delivery.updateOne({ _id: rows[0]._id }, { $set: { deliveredAt: new Date(midnight.getTime() - 1) } });
      const today = await listWorkflowDeliveries(rider, { history: "true", datePeriod: "today", limit: "1" });
      const yesterday = await listWorkflowDeliveries(rider, { history: "true", datePeriod: "yesterday", limit: "1" });
      assert.equal(today.pagination.total, 25); assert.equal(yesterday.pagination.total, 1); assert.equal(yesterday.deliveries[0].id, String(rows[0]._id));
      assert.equal((await listWorkflowDeliveries(rider, { history: "true", search: "TEST-ACCURACY-1" })).deliveries.every(row => row.orderNumber.includes("TEST-ACCURACY-1")), true);
    });
    await t.test("configured restaurant contact only; no implicit defaults or personal staff phones", async () => {
      assert.equal(await restaurantContact(), null);
      await RestaurantSettings.collection.insertOne({ key: "default", location: { phone: "" } }); assert.equal(await restaurantContact(), null);
      await RestaurantSettings.updateOne({ key: "default" }, { $set: { "location.phone": "+0000000000" } }); assert.equal((await restaurantContact()).phone, "+0000000000");
    });
    await t.test("order changes reject stale cash confirmation snapshots without stock/payment writes", async () => {
      const target = await make(); const order = await Order.findById(target.order);
      await Order.updateOne({ _id: order._id }, { $inc: { __v: 1 } });
      await assert.rejects(actOnDelivery({ actor: rider, id: String(target._id), action: "report_cash", payload: { expectedRevision: 0, expectedOrderRevision: 0, amount: "40", idempotencyKey: "rider-accuracy-stale-test" } }), error => error.status === 409);
      assert.equal((await Delivery.findById(target._id)).cashReport.status, "none");
      assert.equal(await CashMovement.countDocuments(), 0); assert.equal(await StockTransaction.countDocuments(), 0);
    });
  }); } finally { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
});
