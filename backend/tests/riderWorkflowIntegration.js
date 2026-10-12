import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import Delivery from "../models/Delivery.js";
import DeliveryRequest from "../models/DeliveryRequest.js";
import PosShift from "../models/PosShift.js";
import CashMovement from "../models/CashMovement.js";
import AuditLog from "../models/AuditLog.js";
import deliveryRoutes from "../routes/deliveryRoutes.js";
import riderRoutes from "../routes/riderRoutes.js";
import { csrfProtection } from "../middleware/security.js";
import { riderConfiguration } from "../config/rider.js";
import { eligibleDeliveryOrder, outstandingDeliveryHalala } from "../services/deliveryContractService.js";
import { resolveOrderInput } from "../config/orderContract.js";

test("explicit own delivery and authoritative money definitions", () => {
  const order = { deliveryMode: "restaurant", orderType: "delivery", source: "website", status: "ready", paymentStatus: "pending", totalAmount: 40, paymentRecords: [] };
  assert.equal(eligibleDeliveryOrder(order), true);
  for (const changes of [{ deliveryMode: undefined }, { orderType: "takeaway" }, { source: "jahez" }, { deliveryProvider: "keeta" }, { manualEntry: true }, { paymentStatus: "voided" }, { inventoryStatus: "restored" }]) assert.equal(eligibleDeliveryOrder({ ...order, ...changes }), false);
  assert.equal(outstandingDeliveryHalala(order), 4000);
  assert.equal(outstandingDeliveryHalala({ ...order, paymentRecords: [{ amount: 10 }] }), 3000);
  for (const paymentStatus of ["paid", "partially_refunded", "refunded"]) assert.equal(outstandingDeliveryHalala({ ...order, paymentStatus, refundedAmountHalala: 500 }), 0);
  assert.equal(outstandingDeliveryHalala({ ...order, paymentStatus: "failed" }), null);
  assert.equal(riderConfiguration({ NODE_ENV: "production", RIDER_WORKFLOW_ENABLED: "true", MONGO_URI: "mongodb://127.0.0.1/dg_rider_preview" }).workflowEnabled, false);
  assert.throws(() => resolveOrderInput({ deliveryMode: "restaurant" }, "customer"), /server-controlled|Unsupported|deliveryMode/i);
});

test("isolated delivery lifecycle, cash reconciliation and HTTP permissions", async t => {
  const keys = ["NODE_ENV", "MONGO_URI", "JWT_SECRET", "RIDER_WORKFLOW_ENABLED", "RIDER_PREVIEW_ENABLED"];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try { await withIsolatedMongo(async ({ uri }) => {
    assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:\d+\/dg_record_id_test\?/);
    Object.assign(process.env, { NODE_ENV: "test", MONGO_URI: uri, JWT_SECRET: "dummy-isolated-workflow-secret", RIDER_WORKFLOW_ENABLED: "true", RIDER_PREVIEW_ENABLED: "true" });
    const actors = {};
    for (const role of ["admin", "manager", "cashier", "customer", "rider"]) actors[role] = await User.create({ role, name: `Local ${role}`, email: `${role}@rehearsal.invalid`, password: "LocalDummy123!", riderAvailable: role === "rider" });
    actors.other = await User.create({ role: "rider", name: "Other local rider", email: "other@rehearsal.invalid", password: "LocalDummy123!", riderAvailable: true });
    let sequence = 0;
    const createOrder = changes => Order.create({ orderNumber: `TEST-DELIVERY-${++sequence}`, source: "website", orderType: "delivery", status: "ready", paymentStatus: "pending", totalAmount: 40, subtotal: 40,
      customer: { name: "Private recipient", phone: "+0000000000", address: "Synthetic private address" }, items: [{ menuItem: new mongoose.Types.ObjectId(), name: "Dummy item", quantity: 1, price: 40 }], inventoryStatus: "not_required", ...changes });
    const app = express(); app.use(express.json(), csrfProtection); app.use("/api/deliveries", deliveryRoutes); app.use("/api/rider", riderRoutes);
    const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    let counter = 0;
    const payload = (expectedRevision = 0, extra = {}) => ({ expectedRevision, idempotencyKey: `local-test-request-${++counter}`, ...extra });
    const call = async (path, actor = actors.admin, method = "GET", body) => {
      const token = actor ? jwt.sign({ id: actor._id, sv: 0 }, process.env.JWT_SECRET) : "";
      const res = await fetch(`${base}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: res.status, body: await res.json() };
    };
    const enroll = async order => { const res = await call(`/deliveries/orders/${order._id}/enroll`, actors.manager, "POST", payload(order.__v, { reason: "Isolated own-delivery trial" })); assert.equal(res.status, 200, res.body.message); return res.body.id; };
    const action = async (id, name, actor, extra = {}, revision) => {
      const job = await Delivery.findById(id).lean();
      return call(`${actor.role === "rider" ? "/rider/workflow/deliveries" : "/deliveries"}/${id}/${name}`, actor, "POST", payload(revision ?? job.revision, extra));
    };
    try {
      await t.test("default/prod gate and role rejection; no checkout field can implicitly enroll", async () => {
        assert.equal((await call("/deliveries", null)).status, 401);
        assert.equal((await call("/deliveries", actors.customer)).status, 403);
        assert.equal((await call("/deliveries", actors.rider)).status, 403);
        process.env.RIDER_WORKFLOW_ENABLED = "false";
        assert.equal((await call("/deliveries")).status, 503);
        process.env.RIDER_WORKFLOW_ENABLED = "true";
        process.env.NODE_ENV = "production"; assert.equal((await call("/deliveries")).status, 503); process.env.NODE_ENV = "test";
        for (const changes of [{ orderType: "takeaway" }, { source: "jahez", manualEntry: true, deliveryProvider: "jahez" }]) {
          const order = await createOrder(changes);
          assert.equal((await call(`/deliveries/orders/${order._id}/enroll`, actors.admin, "POST", payload(0, { reason: "trial" }))).status, 409);
        }
      });
      const order = await createOrder(); const id = await enroll(order);
      await t.test("server-wide counts, pagination and exact order-number filters", async () => {
        const another = await createOrder(); await enroll(another);
        const list = await call("/deliveries?limit=1"); assert.equal(list.body.counts.unassigned, 2); assert.equal(list.body.deliveries.length, 1); assert.equal(list.body.pagination.total, 2);
        const searched = await call(`/deliveries?search=${order.orderNumber}`); assert.equal(searched.body.deliveries[0].id, id);
        assert.equal((await call("/deliveries?riderId=forged")).status, 400);
      });
      await t.test("assignment/reassignment concurrency, availability, stale and replay safety", async () => {
        const body = payload(0, { riderId: String(actors.rider._id) });
        const first = await call(`/deliveries/${id}/assign`, actors.manager, "POST", body); assert.equal(first.status, 200);
        const replay = await call(`/deliveries/${id}/assign`, actors.manager, "POST", body); assert.equal(replay.body.duplicate, true); assert.equal(replay.body.id, id);
        assert.equal((await call(`/deliveries/${id}/assign`, actors.manager, "POST", { ...body, riderId: String(actors.other._id) })).status, 409);
        assert.equal((await action(id, "assign", actors.manager, { riderId: String(actors.other._id) })).status, 400);
        const revision = (await Delivery.findById(id)).revision;
        const results = await Promise.all([action(id, "assign", actors.manager, { riderId: String(actors.other._id), reason: "Trial reassign" }, revision), action(id, "assign", actors.manager, { riderId: String(actors.other._id), reason: "Concurrent different request" }, revision)]);
        assert.equal(results.filter(res => res.status === 200).length, 1); assert.equal(results.filter(res => res.status === 409).length, 1);
        await action(id, "assign", actors.admin, { riderId: String(actors.rider._id), reason: "Return trial delivery" });
      });
      await t.test("availability is own-rider, revisioned, idempotent and never auto-assigns", async () => {
        const rider = await User.findById(actors.other._id);
        const body = payload(rider.riderAvailabilityRevision, { available: false });
        const count = await Delivery.countDocuments({ rider: actors.other._id });
        const res = await call("/rider/workflow/availability", actors.other, "POST", body); assert.equal(res.status, 200);
        assert.equal((await call("/rider/workflow/availability", actors.other, "POST", body)).body.duplicate, true);
        assert.equal((await call("/rider/workflow/availability", actors.other, "POST", { ...body, riderId: String(actors.rider._id) })).status, 400);
        assert.equal((await call("/rider/workflow/availability", actors.cashier, "POST", body)).status, 403);
        const anotherId = (await Delivery.findOne({ status: "unassigned" }))._id;
        assert.equal((await action(anotherId, "assign", actors.admin, { riderId: String(actors.other._id) })).status, 409);
        assert.equal(await Delivery.countDocuments({ rider: actors.other._id }), count);
        assert.equal((await action(id, "assign", actors.cashier, { riderId: String(actors.other._id) })).status, 403);
      });
      await t.test("rider isolation applies to detail, list and mutations; ready required", async () => {
        assert.equal((await call(`/rider/workflow/deliveries/${id}`, actors.other)).status, 404);
        assert.equal((await action(id, "pickup", actors.other)).status, 404);
        assert.equal((await call("/rider/workflow", actors.other)).body.deliveries.length, 0);
        assert.equal((await call(`/deliveries/${id}`, actors.cashier)).status, 404);
        await Order.updateOne({ _id: order._id }, { $set: { status: "preparing" } });
        assert.equal((await action(id, "pickup", actors.rider)).status, 409);
        assert.equal((await action(id, "deliver", actors.rider)).status, 409);
        await Order.updateOne({ _id: order._id }, { $set: { status: "ready" } });
      });
      await t.test("pickup replay and issue/resolution do not cancel/refund or allow reassignment after pickup", async () => {
        const job = await Delivery.findById(id); const body = payload(job.revision);
        const pair = await Promise.all([call(`/rider/workflow/deliveries/${id}/pickup`, actors.rider, "POST", body), call(`/rider/workflow/deliveries/${id}/pickup`, actors.rider, "POST", body)]);
        assert.ok(pair.every(res => res.status === 200)); assert.equal(pair.filter(res => res.body.duplicate).length, 1);
        assert.equal((await action(id, "assign", actors.manager, { riderId: String(actors.other._id), reason: "No silent reset" })).status, 409);
        assert.equal((await action(id, "issue", actors.rider)).status, 400);
        assert.equal((await action(id, "issue", actors.rider, { reason: "Access blocked in isolated trial" })).status, 200);
        assert.equal((await Order.findById(order._id)).status, "out-for-delivery");
        assert.equal((await action(id, "deliver", actors.rider)).status, 409);
        assert.equal((await action(id, "resolve_issue", actors.rider, { reason: "not permitted" })).status, 403);
        assert.equal((await action(id, "resolve_issue", actors.manager, { reason: "Trial access resolved, same rider continues" })).status, 200);
        const resolved = await Delivery.findById(id); assert.equal(resolved.issueHistory.length, 1); assert.equal(resolved.issueHistory[0].reportedBy.toString(), actors.rider._id.toString());
      });
      await t.test("delivery, cash reporting and real cashier receipt remain separate; private history", async () => {
        assert.equal((await action(id, "deliver", actors.rider)).status, 200);
        assert.equal((await Order.findById(order._id)).paymentStatus, "pending");
        const history = await call(`/rider/workflow/deliveries/${id}`, actors.rider); assert.equal(history.body.data.customer, null); assert.equal(history.body.data.deliveryNote, "");
        assert.equal((await action(id, "report_cash", actors.rider, { amount: 41 })).status, 409);
        assert.equal((await action(id, "report_cash", actors.rider, { amount: 40 })).status, 200);
        assert.equal((await action(id, "report_cash", actors.rider, { amount: 40 })).status, 409);
        assert.equal((await Order.findById(order._id)).paymentStatus, "pending"); assert.equal(await CashMovement.countDocuments(), 0);
        assert.equal((await action(id, "confirm_cash", actors.rider, { terminal: "LOCAL" })).status, 403);
        assert.equal((await action(id, "confirm_cash", actors.cashier, { terminal: "LOCAL" })).status, 409);
      });
      await t.test("cashier confirms once through existing order payment and shift ledger, atomically", async () => {
        await PosShift.create({ cashier: actors.cashier._id, terminal: "LOCAL", openingCashHalala: 0, openedBy: actors.cashier._id, isOpen: true, status: "open" });
        const job = await Delivery.findById(id); const body = payload(job.revision, { terminal: "LOCAL" });
        const results = await Promise.all([call(`/deliveries/${id}/confirm_cash`, actors.cashier, "POST", body), call(`/deliveries/${id}/confirm_cash`, actors.cashier, "POST", body)]);
        assert.ok(results.every(res => res.status === 200), JSON.stringify(results));
        const captured = await Order.findById(order._id); assert.equal(captured.paymentStatus, "paid"); assert.equal(captured.paymentRecords.length, 1);
        assert.equal(await CashMovement.countDocuments({ order: order._id }), 1);
        assert.equal((await CashMovement.findOne({ order: order._id })).amountHalala, 4000);
        assert.equal((await call(`/rider/workflow/deliveries/${id}`, actors.rider)).body.data.amountToCollect, 0);
        assert.equal((await action(id, "confirm_cash", actors.cashier, { terminal: "LOCAL" })).status, 409);
      });
      await t.test("shortage is audited/acknowledged but never fabricated as a full payment", async () => {
        const shortOrder = await createOrder(); const shortId = await enroll(shortOrder);
        await action(shortId, "assign", actors.admin, { riderId: String(actors.rider._id) });
        await action(shortId, "pickup", actors.rider); await action(shortId, "deliver", actors.rider);
        assert.equal((await action(shortId, "report_cash", actors.rider, { amount: 20 })).status, 400);
        assert.equal((await action(shortId, "report_cash", actors.rider, { amount: 20, reason: "Shortage in dummy trial" })).status, 200);
        assert.equal((await action(shortId, "acknowledge_cash", actors.cashier, { reason: "Cannot authorize" })).status, 403);
        assert.equal((await action(shortId, "acknowledge_cash", actors.manager, { reason: "Recorded for authorized follow-up; no posting" })).status, 200);
        assert.equal((await action(shortId, "confirm_cash", actors.cashier, { terminal: "LOCAL" })).status, 409);
        assert.equal((await Order.findById(shortOrder._id)).paymentStatus, "pending"); assert.equal(await CashMovement.countDocuments({ order: shortOrder._id }), 0);
      });
      await t.test("paid orders collect zero; partial balances stay unconfirmed; voids invalidate actions", async () => {
        for (const changes of [{ paymentStatus: "paid", paymentRecords: [{ method: "cash", amount: 40, capturedBy: actors.cashier._id, capturedAt: new Date(), idempotencyKey: "dummy-prior-paid" }] }, { paymentRecords: [{ method: "cash", amount: 10, capturedBy: actors.cashier._id, capturedAt: new Date(), idempotencyKey: "dummy-prior-partial" }] }]) {
          const target = await createOrder(changes), jobId = await enroll(target);
          await action(jobId, "assign", actors.manager, { riderId: String(actors.rider._id) });
          await action(jobId, "pickup", actors.rider); await action(jobId, "deliver", actors.rider);
          const detail = (await call(`/rider/workflow/deliveries/${jobId}`, actors.rider)).body.data;
          if (changes.paymentStatus === "paid") { assert.equal(detail.amountToCollect, 0); assert.equal((await action(jobId, "report_cash", actors.rider, { amount: 1 })).status, 409); }
          else {
            assert.equal(detail.amountToCollect, 30);
            assert.equal((await action(jobId, "report_cash", actors.rider, { amount: 30 })).status, 200);
            assert.equal((await action(jobId, "confirm_cash", actors.cashier, { terminal: "LOCAL" })).status, 409);
            assert.equal((await Order.findById(target._id)).paymentRecords.length, 1);
            assert.equal(await CashMovement.countDocuments({ order: target._id }), 0);
          }
          await Order.updateOne({ _id: target._id }, { $set: { paymentStatus: "voided" } });
          assert.equal((await call(`/deliveries/${jobId}`, actors.manager)).body.data.canOperate, false);
          assert.equal((await action(jobId, "confirm_cash", actors.cashier, { terminal: "LOCAL" })).status, 409);
        }
      });
      await t.test("audit failure after payment posting rolls back everything; same request safely retries", async () => {
        const target = await createOrder(), jobId = await enroll(target);
        await action(jobId, "assign", actors.manager, { riderId: String(actors.rider._id) });
        await action(jobId, "pickup", actors.rider); await action(jobId, "deliver", actors.rider);
        await action(jobId, "report_cash", actors.rider, { amount: 40 });
        const job = await Delivery.findById(jobId), body = payload(job.revision, { terminal: "LOCAL" });
        const beforeReceipts = await DeliveryRequest.countDocuments(), originalCreate = AuditLog.create;
        AuditLog.create = function (rows, ...args) { if (rows[0]?.action === "DELIVERY_CONFIRM_CASH") throw new Error("Owned injected audit failure"); return originalCreate.call(this, rows, ...args); };
        try { assert.equal((await call(`/deliveries/${jobId}/confirm_cash`, actors.cashier, "POST", body)).status, 500); }
        finally { AuditLog.create = originalCreate; }
        assert.equal((await Delivery.findById(jobId)).revision, job.revision);
        assert.equal((await Delivery.findById(jobId)).cashReport.status, "unconfirmed");
        assert.equal((await Order.findById(target._id)).paymentStatus, "pending");
        assert.equal((await Order.findById(target._id)).paymentRecords.length, 0);
        assert.equal(await CashMovement.countDocuments({ order: target._id }), 0);
        assert.equal(await DeliveryRequest.countDocuments(), beforeReceipts);
        assert.equal((await call(`/deliveries/${jobId}/confirm_cash`, actors.cashier, "POST", body)).status, 200);
        assert.equal((await call(`/deliveries/${jobId}/confirm_cash`, actors.cashier, "POST", body)).body.duplicate, true);
        assert.equal(await CashMovement.countDocuments({ order: target._id }), 1);
      });
      await t.test("failure rolls back revisions/receipts/audits; no additional sales or stock moves", async () => {
        const before = { jobs: await Delivery.countDocuments(), orders: await Order.countDocuments(), receipts: await DeliveryRequest.countDocuments(), audits: await AuditLog.countDocuments() };
        const revision = (await Delivery.findById(id)).revision;
        assert.equal((await action(id, "issue", actors.rider, { reason: "Already terminal" })).status, 409);
        assert.equal((await Delivery.findById(id)).revision, revision);
        assert.deepEqual({ jobs: await Delivery.countDocuments(), orders: await Order.countDocuments(), receipts: await DeliveryRequest.countDocuments(), audits: await AuditLog.countDocuments() }, before);
        const inventory = mongoose.connection.db.collection("stocktransactions"); assert.equal(await inventory.countDocuments(), 0);
        const logs = JSON.stringify(await AuditLog.find({ entityType: "Delivery" }).lean()); assert.doesNotMatch(logs, /Synthetic private address|\+0000000000|Private recipient/);
      });
    } finally { await new Promise(resolve => server.close(resolve)); }
  }); } finally { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
});
