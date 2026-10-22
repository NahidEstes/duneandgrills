import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import plannerRoutes from "../routes/plannerRoutes.js";
import PlannerTask from "../models/PlannerTask.js";
import PlannerSeries from "../models/PlannerSeries.js";
import User from "../models/User.js";
import { plannerDay, plannerDueAt, shiftPlannerDay } from "../services/plannerRules.js";
import { plannerTransition } from "../services/plannerCompletion.js";
import { plannerInsightRange, plannerCsvCell, listPlannerInsights } from "../services/plannerInsights.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "planner-history-owned-test-only";

test("Riyadh periods, completion snapshots and CSV injection handling", () => {
  const now = new Date("2026-10-21T21:00:00Z");
  assert.deepEqual(plannerInsightRange({ period: "today" }, now), { period: "today", from: "2026-10-22", to: "2026-10-22" });
  assert.equal(plannerInsightRange({ period: "week" }, now).from, "2026-10-18");
  assert.equal(plannerInsightRange({ period: "month" }, new Date("2028-02-03")).to, "2028-02-29");
  assert.throws(() => plannerInsightRange({ period: "custom", from: "2026-10-22", to: "2026-10-21" }));
  assert.throws(() => plannerInsightRange({ period: "custom", from: "2026-02-30", to: "2026-03-01" }));
  const actor = { _id: new mongoose.Types.ObjectId(), name: "Admin A" }, assigned = { id: new mongoose.Types.ObjectId(), name: "Rahim" };
  const current = { status: "Pending", title: "Clean", category: "Kitchen", responsible: assigned, dueAt: now, checklist: [{ text: "Clean grill", done: false }] };
  const result = plannerTransition(current, { ...current, status: "Done", checklist: [{ text: "Clean grill", done: true }] }, actor, "  Done safely  ", now);
  assert.equal(result.completion.note, "Done safely"); assert.equal(result.completion.responsible.name, "Rahim"); assert.equal(result.completion.by.name, "Admin A");
  assert.equal(result.events.length, 2); assert.equal(result.events[1].action, "Marked as Done");
  const edited = plannerTransition({ ...current, status: "Done", completedAt: now, completion: result.completion }, { ...current, status: "Done", dueAt: new Date(+now + 60000), responsible: null }, actor);
  assert.deepEqual(edited.completion, result.completion, "Later edits preserve frozen facts");
  assert.throws(() => plannerTransition(current, current, actor, "not completing"));
  for (const value of ["=SUM(A1)", "+123", "-123", "@cmd", " \t=cmd", "\ncmd"]) assert.ok(plannerCsvCell(value).startsWith('"\''));
  assert.equal(plannerCsvCell('a,"b"\nc'), '"a,""b""\nc"');
});

test("Planner history and people summaries remain isolated and consistent (owned replica set)", { timeout: 180000 }, async t => withIsolatedMongo(async () => {
  const actors = {};
  for (const role of ["admin", "manager", "customer", "inventory", "accountant", "cashier", "kitchen", "rider"]) actors[role] = await User.create({ name: `History ${role}`, email: `${role}@history-owned.test`, role, password: "TestPassword123!" });
  const tokens = Object.fromEntries(Object.entries(actors).map(([role, actor]) => [role, jwt.sign({ id: String(actor._id), sv: 0 }, process.env.JWT_SECRET)]));
  for (const name of ["orders", "expenses", "supplierpayments", "stocktransactions", "inventoryitems", "supplierinvoices", "attendances", "posshifts", "cashmovements"]) await mongoose.connection.db.collection(name).insertOne({ marker: "Owned Planner history fixture", amount: 123, stock: 22, status: "unchanged" });
  const businessSnapshot = async () => {
    const snapshot = {};
    for (const { name } of await mongoose.connection.db.listCollections().toArray()) if (!name.startsWith("planner") && !name.startsWith("system.")) snapshot[name] = JSON.stringify(await mongoose.connection.db.collection(name).find({}).sort({ _id: 1 }).toArray());
    return snapshot;
  };
  const before = await businessSnapshot();
  const app = express(); app.use(express.json()); app.use("/api/planner", plannerRoutes); app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const origin = `http://127.0.0.1:${server.address().port}/api/planner`;
  const api = async (role, resource = "", body, method = body === undefined ? "GET" : "POST") => {
    const response = await fetch(origin + resource, { method, headers: { "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: response.headers.get("content-type")?.includes("text/csv") ? await response.text() : await response.json() };
  };
  const today = plannerDay(), template = extra => ({ requestId: randomUUID(), title: "History completion fixture", category: "Kitchen", priority: "Normal", dueDate: today, time: "00:00", repeat: "none", checklist: [{ text: "Clean grill", done: false }], notes: "", responsibleId: String(actors.manager._id), linkedRecord: null, ...extra });
  let task, original;
  try {
    await t.test("all new reads and exports require existing Admin permissions", async () => {
      for (const resource of ["/insights", "/insights?mode=people", "/insights/tasks?responsible=unassigned", "/insights/export"]) {
        assert.equal((await api(null, resource)).status, 401);
        for (const role of ["customer", "inventory", "accountant", "cashier", "kitchen", "rider"]) assert.equal((await api(role, resource)).status, 403);
      }
      assert.equal((await api("manager", "/insights")).status, 200);
      for (const resource of ["/insights?mode=bad", "/insights?responsible=bad", "/insights?completedBy=bad", "/insights?period=custom&from=bad&to=bad"]) assert.equal((await api("admin", resource)).status, 400);
    });
    await t.test("completion is atomic, server-attributed, frozen, and duplicate retries create no extra events", async () => {
      assert.equal((await api("admin", "", template())).status, 201);
      task = await PlannerTask.findOne({ title: "History completion fixture" }).lean();
      assert.equal((await api("admin", `/${task._id}/progress`, { revision: task.revision, status: "Done", completedBy: actors.manager._id }, "PATCH")).status, 400);
      const body = { revision: task.revision, status: "Done", checklist: [true], completionNote: "Cleaned and checked" };
      const replies = await Promise.all([api("admin", `/${task._id}/progress`, body, "PATCH"), api("manager", `/${task._id}/progress`, body, "PATCH")]);
      assert.deepEqual(replies.map(row => row.status).sort(), [200, 409]);
      task = await PlannerTask.findById(task._id).lean(); original = JSON.stringify(task.completion);
      assert.ok(["History admin", "History manager"].includes(task.completion.by.name));
      assert.match(task.completion.responsible.name, /^History manager/); assert.equal(task.completion.note, "Cleaned and checked"); assert.equal(task.completion.checklist[0].done, true);
      assert.equal(task.history.filter(row => row.action === "Marked as Done").length, 1);
      assert.equal((await api("admin", `/${task._id}/progress`, body, "PATCH")).status, 409);
      assert.equal((await api("admin", `/${task._id}`, template({ title: "Edited after completion", dueDate: shiftPlannerDay(today, 2), responsibleId: "", scope: "occurrence", revision: task.revision, status: "Done" }), "PATCH")).status, 200);
      task = await PlannerTask.findById(task._id).lean(); assert.equal(JSON.stringify(task.completion), original);
      assert.ok(task.history.some(row => row.action.startsWith("Rescheduled:"))); assert.ok(task.history.some(row => row.action.startsWith("Responsible person changed:")));
      const history = await api("admin", "/insights?period=today&search=History%20completion");
      assert.equal(history.body.pagination.total, 1); assert.equal(history.body.data[0].reportTitle, "History completion fixture");
      assert.match(history.body.data[0].reportResponsible.name, /^History manager/);
      const detail = await api("admin", `/${task._id}`); assert.equal(detail.body.data.completion.note, "Cleaned and checked");
    });
    await t.test("Cancel and Undo restore all completion metadata; reopen and recomplete retain previous event snapshots", async () => {
      const cancelled = await api("manager", `/${task._id}/progress`, { revision: task.revision, status: "Cancelled" }, "PATCH");
      assert.equal(cancelled.status, 200); assert.equal(cancelled.body.data.completion, null);
      const undo = cancelled.body.data.undo;
      assert.equal((await api("manager", `/${task._id}/undo`, { revision: undo.revision, token: undo.token })).status, 200);
      task = await PlannerTask.findById(task._id).lean(); assert.equal(JSON.stringify(task.completion), original);
      const reopened = await api("manager", `/${task._id}/progress`, { revision: task.revision, status: "In Progress" }, "PATCH");
      assert.equal(reopened.body.data.completion, null);
      const completed = await api("manager", `/${task._id}`, template({ title: "Completed from editor", scope: "occurrence", status: "Done", revision: reopened.body.data.revision, completionNote: "Second completion" }), "PATCH");
      assert.equal(completed.status, 200, JSON.stringify(completed.body));
      task = await PlannerTask.findById(task._id).lean(); assert.equal(task.completion.note, "Second completion"); assert.equal(task.completion.by.name, "History manager");
      assert.equal(task.history.filter(row => row.completion).length, 2); assert.equal(task.history.find(row => row.completion).completion.note, "Cleaned and checked");
      assert.ok(task.history.some(row => row.action === "Reopened as In Progress"));
      assert.equal((await api("admin", `/${task._id}/progress`, { revision: task.revision, completionNote: "Overwrite" }, "PATCH")).status, 400);
    });
    await t.test("legacy facts remain unknown; date boundaries, pagination, filters, totals, detail rows and CSV agree", async () => {
      const series = await PlannerSeries.findById(task.series).lean(), day = "2026-10-22", now = new Date("2026-10-22T09:00:00+03:00");
      const base = { series: series._id, groupId: new mongoose.Types.ObjectId(), scheduledOn: day, title: "Report fixture", category: "Other", priority: "Normal", dueDate: day, time: "10:00", dueAt: plannerDueAt(day, "10:00"), checklist: [], responsible: null, deleted: false };
      const docs = [];
      for (let index = 0; index < 25; index++) docs.push({ ...base, groupId: new mongoose.Types.ObjectId(), title: `Report fixture ${index}`, status: "Done", completedAt: plannerDueAt(day, "10:00"), completion: index === 0 ? null : { title: index === 1 ? "=Report fixture injection" : `Report fixture ${index}`, category: "Other", at: plannerDueAt(day, index === 2 ? "11:00" : "10:00"), dueAt: base.dueAt, responsible: null, by: { id: actors.admin._id, name: actors.admin.name }, checklist: [], note: "" } });
      docs.push({ ...base, groupId: new mongoose.Types.ObjectId(), title: "Report fixture future", status: "In Progress" });
      docs.push({ ...base, groupId: new mongoose.Types.ObjectId(), title: "Report fixture overdue", time: "08:00", dueAt: plannerDueAt(day, "08:00"), status: "Pending" });
      docs.push({ ...base, groupId: new mongoose.Types.ObjectId(), title: "Report fixture cancelled", status: "Cancelled" });
      docs.push({ ...base, groupId: new mongoose.Types.ObjectId(), title: "Boundary at start", status: "Done", completedAt: plannerDueAt(day, "00:00") });
      docs.push({ ...base, groupId: new mongoose.Types.ObjectId(), title: "Boundary next day", status: "Done", completedAt: plannerDueAt("2026-10-23", "00:00") });
      await PlannerTask.insertMany(docs);
      const query = "mode=history&period=custom&from=2026-10-22&to=2026-10-22&category=Other&search=Report%20fixture";
      const first = await api("admin", `/insights?${query}`), second = await api("admin", `/insights?${query}&page=2`);
      assert.equal(first.status, 200, JSON.stringify(first.body)); assert.equal(first.body.pagination.total, 25); assert.equal(first.body.data.length, 20); assert.equal(second.body.data.length, 5);
      assert.equal(first.body.summary.onTime, 23); assert.equal(first.body.summary.late, 1); assert.equal(first.body.summary.unavailable, 1);
      const boundaries = await api("admin", "/insights?mode=history&period=custom&from=2026-10-22&to=2026-10-22&search=Boundary");
      assert.equal(boundaries.body.data.length, 1); assert.equal(boundaries.body.data[0].title, "Boundary at start");
      const unknown = await api("admin", `/insights?${query}&completedBy=unrecorded`); assert.equal(unknown.body.pagination.total, 1); assert.equal(unknown.body.data[0].timing, "Unavailable");
      const byAdmin = await api("admin", `/insights?${query}&completedBy=${actors.admin._id}`); assert.equal(byAdmin.body.pagination.total, 24);
      const people = await listPlannerInsights({ mode: "people", period: "custom", from: day, to: day, search: "Report fixture", category: "Other" }, now);
      assert.equal(people.data.length, 1); assert.deepEqual([people.summary.assigned, people.summary.completed, people.summary.pending, people.summary.overdue], [27, 25, 1, 1]);
      assert.equal(people.data[0].assigned, people.data[0].completed + people.data[0].pending + people.data[0].overdue);
      const details = await api("admin", `/insights/tasks?mode=people&period=custom&from=${day}&to=${day}&responsible=unassigned&search=Report%20fixture&category=Other`);
      assert.equal(details.body.pagination.total, 27);
      const csv = await api("admin", `/insights/export?${query}`); assert.equal(csv.status, 200); assert.equal(csv.body.trim().split("\r\n").length, 26); assert.ok(csv.body.includes("\"'=Report fixture injection\"")); assert.ok(csv.body.includes("Not recorded"));
      const literal = await api("admin", "/insights?period=all&search=%5B.*"); assert.equal(literal.body.pagination.total, 0);
      const summaryCsv = await api("admin", `/insights/export?mode=people&period=custom&from=${day}&to=${day}&search=Report%20fixture&category=Other`); assert.equal(summaryCsv.status, 200); assert.ok(summaryCsv.body.includes('"Unassigned","27","25"'));
      assert.deepEqual(await businessSnapshot(), before, "Every non-Planner collection is unchanged");
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
}));
