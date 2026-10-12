import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import Delivery from "../models/Delivery.js";
import StockTransaction from "../models/StockTransaction.js";
import CashMovement from "../models/CashMovement.js";
import deliveryRoutes from "../routes/deliveryRoutes.js";
import { managementDeliveryQuery } from "../services/deliveryQueryService.js";
import { buildDeliveryTimeline, readDeliveryTimeline } from "../services/deliveryTimelineService.js";
import { enrollDelivery, actOnDelivery, getWorkflowDelivery } from "../services/deliveryWorkflowService.js";
import { listWorkflowDeliveries } from "../services/deliveryReadService.js";

test("Riyadh management date boundaries, leap day, year rollover and validated combinations", () => {
  const actor = { role: "manager" }, now = new Date("2026-12-31T21:00:00Z");
  const today = managementDeliveryQuery(actor, { datePeriod: "today" }, now);
  assert.equal(today.applied.start.toISOString(), "2026-12-31T21:00:00.000Z");
  assert.equal(today.applied.endExclusive.toISOString(), "2027-01-01T21:00:00.000Z");
  const yesterday = managementDeliveryQuery(actor, { datePeriod: "yesterday", dateBasis: "delivered" }, now);
  assert.equal(yesterday.match.deliveredAt.$gte.toISOString(), "2026-12-30T21:00:00.000Z");
  const custom = managementDeliveryQuery(actor, { datePeriod: "custom", from: "2028-02-29", to: "2028-03-01" });
  assert.equal(custom.match.createdAt.$lt.toISOString(), "2028-03-01T21:00:00.000Z");
  for (const query of [{ datePeriod: "bad" }, { dateBasis: "bad" }, { sort: "updatedAt" }, { riderId: "bad" }, { datePeriod: "custom" }, { from: "2026-01-01" },
    { datePeriod: "custom", from: "2026-02-29", to: "2026-03-01" }, { datePeriod: "custom", from: "2026-03-02", to: "2026-03-01" }]) assert.throws(() => managementDeliveryQuery(actor, query));
  assert.throws(() => managementDeliveryQuery({ role: "cashier" }, { riderId: "all" }), error => error.status === 403);
});

test("timeline never invents missing history or equates shortage acknowledgment with payment", () => {
  const timeline = buildDeliveryTimeline({ status: "delivered", rider: "rider", cashReport: { status: "discrepancy", amountHalala: 3000,
    reportedAt: "2026-01-01T10:00:00Z", acknowledgedAt: "2026-01-01T10:01:00Z" } }, { paymentStatus: "pending", totalAmount: 40 });
  assert.ok(timeline.limitations.some(text => /Picked up.*no historical/.test(text)));
  assert.equal(timeline.events.find(row => row.action === "enrolled").at, null);
  assert.ok(timeline.events.every(row => !row.actor)); assert.equal(timeline.events.some(row => row.action === "confirm_cash"), false);
  assert.ok(timeline.pending.some(text => /acknowledgment does not confirm payment/.test(text)));
  const confirmed = buildDeliveryTimeline({ status: "delivered", cashReport: { status: "confirmed", confirmedAt: "2026-01-02T12:00:00Z", amountHalala: 4000 } }, {});
  assert.equal(confirmed.events.filter(row => row.action === "confirm_cash").length, 1);
  assert.equal(confirmed.pending.length, 0);
});

test("partial historical assignment data matches the nearest audit without hiding earlier assignment", () => {
  const time = "2026-01-01T10:00:01Z";
  const timeline = buildDeliveryTimeline({ status: "assigned", assignedAt: time, assignedBy: "manager", rider: "B" }, {}, [
    { _id: "audit1", action: "DELIVERY_ASSIGN", actor: "manager", actorName: "Original manager", createdAt: "2026-01-01T10:00:00Z", before: { status: "unassigned" }, after: { status: "assigned", revision: 1 } },
    { _id: "audit2", action: "DELIVERY_ASSIGN", actor: "manager", actorName: "Original manager", createdAt: time, before: { status: "assigned" }, after: { status: "assigned", revision: 2 } },
  ]);
  const assignments = timeline.events.filter(row => row.action === "assign");
  assert.equal(assignments.length, 2); assert.equal(assignments[0].label, "Assigned"); assert.equal(assignments[1].label, "Reassigned");
  assert.equal(assignments[1].source, "delivery"); assert.equal(assignments[0].timestampBasis, "Audit recorded time");
});

test("private delivery history, server filters and stage sorting in owned disposable Mongo", async t => {
  const keys = ["NODE_ENV", "MONGO_URI", "JWT_SECRET", "RIDER_WORKFLOW_ENABLED"];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try { await withIsolatedMongo(async ({ uri }) => {
    assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:\d+\/dg_record_id_test\?/);
    Object.assign(process.env, { NODE_ENV: "test", MONGO_URI: uri, JWT_SECRET: "isolated-timeline-filters-test-only", RIDER_WORKFLOW_ENABLED: "true" });
    const actors = {};
    for (const role of ["manager", "cashier", "customer", "rider"]) actors[role] = await User.create({ role, name: `Original ${role}`, email: `${role}@timeline.invalid`, password: "LocalDummy123!", riderAvailable: true });
    actors.other = await User.create({ role: "rider", name: "Other rider", email: "other@timeline.invalid", password: "LocalDummy123!", riderAvailable: true });
    let sequence = 0;
    const fixture = async (prefix, changes = {}, orderChanges = {}) => {
      const order = await Order.create({ orderNumber: `TEST-${prefix}-${++sequence}`, source: "website", orderType: "delivery", deliveryMode: "restaurant", status: "ready", readyAt: new Date("2026-01-01T00:00:00Z"),
        paymentStatus: "pending", totalAmount: 40, subtotal: 40, customer: { name: "Isolated recipient", phone: "+0000000000", address: "Private dummy address" },
        items: [{ menuItem: new mongoose.Types.ObjectId(), name: "Dummy dish", quantity: 1, price: 40 }], inventoryStatus: "not_required", ...orderChanges });
      return Delivery.create({ order: order._id, ...changes });
    };
    const currentOrder = await Order.create({ orderNumber: "TEST-TIMELINE-WORKFLOW", source: "website", orderType: "delivery", status: "ready", paymentStatus: "pending", totalAmount: 40, subtotal: 40,
      customer: { name: "Private fixture", phone: "+0000000000", address: "Private dummy address" }, items: [{ menuItem: new mongoose.Types.ObjectId(), name: "Dummy", quantity: 1, price: 40 }], inventoryStatus: "not_required" });
    const enrolled = await enrollDelivery({ actor: actors.manager, orderId: currentOrder._id, payload: { expectedRevision: 0, reason: "Private enrollment reason", idempotencyKey: "timeline-test-enrollment" } });
    let request = 0;
    const act = async (action, actor, extra = {}) => actOnDelivery({ actor, id: enrolled.id, action, payload: { expectedRevision: (await Delivery.findById(enrolled.id)).revision, idempotencyKey: `timeline-test-action-${++request}`, ...extra } });
    await t.test("chronology, reassignment/issue history, audit deduplication and actor snapshots", async () => {
      await act("assign", actors.manager, { riderId: String(actors.rider._id) });
      await act("assign", actors.manager, { riderId: String(actors.other._id), reason: "Private reassignment explanation" });
      await act("pickup", actors.other);
      for (const index of [1, 2]) { await act("issue", actors.other, { reason: `Private issue ${index}` }); await act("resolve_issue", actors.manager, { reason: `Private resolution ${index}` }); }
      await act("deliver", actors.other); await act("report_cash", actors.other, { amount: "30", reason: "Private shortage explanation" });
      await act("acknowledge_cash", actors.manager, { reason: "Investigate shortage; no payment" });
      await User.updateOne({ _id: actors.manager._id }, { $set: { name: "Renamed manager" } });
      const detail = await getWorkflowDelivery(actors.manager, enrolled.id), events = detail.timeline.events;
      assert.equal(events.length, 11); assert.equal(events.filter(row => row.action === "assign").length, 2);
      assert.deepEqual(events.filter(row => row.action === "assign").map(row => row.label), ["Assigned", "Reassigned"]);
      assert.equal(events.filter(row => row.action === "issue").length, 2); assert.equal(events.filter(row => row.action === "resolve_issue").length, 2);
      assert.ok(events.every((row, index) => !index || new Date(row.at) >= new Date(events[index - 1].at)));
      assert.equal(events[0].actor.name, "Original manager"); assert.equal(events[0].reason, "Private enrollment reason");
      assert.equal(events.find(row => row.label === "Reassigned").reason, "Private reassignment explanation");
      assert.equal(events.find(row => row.action === "pickup").actor.name, "Other rider");
      assert.equal(events.some(row => row.action === "confirm_cash"), false); assert.equal(detail.paymentStatus, "pending");
      assert.equal(detail.customer, null); assert.equal(await CashMovement.countDocuments(), 0); assert.equal(await StockTransaction.countDocuments(), 0);
      assert.ok((await getWorkflowDelivery(actors.cashier, enrolled.id)).timeline);
      const rider = await getWorkflowDelivery(actors.other, enrolled.id);
      assert.equal(rider.timeline, undefined); assert.doesNotMatch(JSON.stringify(rider), /Private (reassignment|resolution|shortage|enrollment)/);
      await assert.rejects(getWorkflowDelivery(actors.rider, enrolled.id), error => error.status === 404);
      await assert.rejects(readDeliveryTimeline(actors.other, detail, currentOrder), error => error.status === 403);
    });
    await t.test("combined date/rider/cash/attention/status filters before pagination, stable ties and missing clocks last", async () => {
      const records = [];
      for (let index = 0; index < 25; index++) records.push(await fixture("SORT", { status: "assigned", rider: actors.rider._id, assignedAt: new Date("2026-01-01T01:00:00Z"), createdAt: new Date("2026-01-01T01:00:00Z") }));
      const missing = await fixture("SORT", { status: "assigned", rider: actors.rider._id, createdAt: new Date("2026-01-01T01:00:00Z") });
      await fixture("SORT", { status: "assigned", rider: actors.other._id, assignedAt: new Date("2026-01-01T00:00:00Z") });
      await fixture("SORT", { status: "assigned", rider: actors.rider._id, assignedAt: new Date("2026-01-01T00:00:00Z") }, { status: "cancelled" });
      await fixture("SORT", { status: "unassigned", rider: actors.rider._id });
      const query = { search: "TEST-SORT", status: "assigned", riderId: String(actors.rider._id), cashStatus: "collection_pending", sort: "assigned_longest", datePeriod: "custom", from: "2026-01-01", to: "2026-01-01", limit: 20 };
      const first = await listWorkflowDeliveries(actors.manager, query), second = await listWorkflowDeliveries(actors.manager, { ...query, page: 2 });
      assert.equal(first.pagination.total, 26); assert.equal(second.deliveries.length, 6);
      assert.deepEqual([...first.deliveries, ...second.deliveries].map(row => row.id), [...records.map(row => String(row._id)).sort(), String(missing._id)]);
      await Delivery.updateOne({ _id: records[0]._id }, { $set: { updatedAt: new Date("2030-01-01T00:00:00Z") } });
      assert.deepEqual((await listWorkflowDeliveries(actors.manager, query)).deliveries.map(row => row.id), first.deliveries.map(row => row.id));
      assert.equal((await listWorkflowDeliveries(actors.manager, { ...query, status: "delivered" })).pagination.total, 0);
      const before = await listWorkflowDeliveries(actors.manager);
      const filtered = await listWorkflowDeliveries(actors.manager, { ...query, attention: "timing_unavailable" });
      assert.equal(filtered.pagination.total, 1); assert.deepEqual(filtered.counts, before.counts); assert.deepEqual(filtered.health.attention, before.health.attention);
      assert.ok(before.riderFilters.some(row => row.id === String(actors.other._id)));
    });
    await t.test("enrolled versus delivered date, inclusive/exclusive boundaries and all stage sorts", async () => {
      const start = new Date("2026-12-31T21:00:00Z"), end = new Date("2027-01-01T21:00:00Z");
      const jobs = [];
      for (const at of [new Date(start - 1), start, new Date(end - 1), end]) jobs.push(await fixture("DATES", { status: "delivered", createdAt: new Date("2026-01-01T00:00:00Z"), deliveredAt: at }, { status: "delivered" }));
      const query = { search: "TEST-DATES", datePeriod: "custom", from: "2027-01-01", to: "2027-01-01", dateBasis: "delivered" };
      assert.deepEqual((await listWorkflowDeliveries(actors.manager, query)).deliveries.map(row => row.id).sort(), jobs.slice(1, 3).map(row => String(row._id)).sort());
      assert.equal((await listWorkflowDeliveries(actors.manager, { ...query, dateBasis: "enrolled" })).pagination.total, 0);
      const newer = await fixture("NEWEST", { createdAt: end }), older = await fixture("NEWEST", { createdAt: start });
      assert.deepEqual((await listWorkflowDeliveries(actors.manager, { search: "TEST-NEWEST" })).deliveries.map(row => row.id), [String(newer._id), String(older._id)]);
      const waiting = await fixture("WAITING", {}, { readyAt: start });
      const newerWaiting = await fixture("WAITING", {}, { readyAt: end });
      const unknownWaiting = await fixture("WAITING", {}, { readyAt: undefined });
      await fixture("WAITING", {}, { status: "preparing" });
      assert.deepEqual((await listWorkflowDeliveries(actors.manager, { search: "TEST-WAITING", sort: "oldest_waiting" })).deliveries.map(row => row.id), [waiting, newerWaiting, unknownWaiting].map(row => String(row._id)));
      const picked = await fixture("PICKED", { status: "picked_up", pickedUpAt: start }), unknownPicked = await fixture("PICKED", { status: "picked_up" });
      await fixture("PICKED", { status: "delivered", pickedUpAt: new Date(start - 1000) });
      assert.deepEqual((await listWorkflowDeliveries(actors.manager, { search: "TEST-PICKED", sort: "picked_up_longest" })).deliveries.map(row => row.id), [picked, unknownPicked].map(row => String(row._id)));
    });
    await t.test("HTTP authorization and invalid queries, private timeline never exposed in list or to other roles", async () => {
      const app = express(); app.use("/deliveries", deliveryRoutes);
      const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
      const get = async (path, actor) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/deliveries${path}`, { headers: actor ? { Authorization: `Bearer ${jwt.sign({ id: String(actor._id), sv: 0 }, process.env.JWT_SECRET)}` } : {} });
        return { status: response.status, data: await response.json() };
      };
      try {
        assert.equal((await get("", null)).status, 401); assert.equal((await get("", actors.customer)).status, 403); assert.equal((await get("", actors.other)).status, 403);
        assert.equal((await get(`/${enrolled.id}`, actors.customer)).status, 403);
        assert.equal((await get("?riderId=all", actors.cashier)).status, 403);
        assert.equal((await get("?datePeriod=custom&from=2026-02-30&to=2026-03-01", actors.manager)).status, 400);
        for (const path of ["?sort=updatedAt", "?riderId=bad", "?dateBasis=wrong", "?unexpected=1", "?sort[newest]=1"]) assert.equal((await get(path, actors.manager)).status, 400);
        const cashier = await get("?datePeriod=all&sort=newest", actors.cashier); assert.equal(cashier.status, 200); assert.equal(cashier.data.riderFilters, undefined);
        assert.doesNotMatch(JSON.stringify((await get("", actors.manager)).data), /Private (reassignment|resolution|shortage|enrollment)/);
      } finally { await new Promise(resolve => server.close(resolve)); }
    });
  }); } finally { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
});
