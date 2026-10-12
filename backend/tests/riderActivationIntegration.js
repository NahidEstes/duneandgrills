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
import RestaurantSettings from "../models/RestaurantSettings.js";
import AuditLog from "../models/AuditLog.js";
import CashMovement from "../models/CashMovement.js";
import PosShift from "../models/PosShift.js";
import StockTransaction from "../models/StockTransaction.js";
import riderRoutes from "../routes/riderRoutes.js";
import deliveryRoutes from "../routes/deliveryRoutes.js";
import settingsRoutes from "../routes/restaurantSettingsRoutes.js";
import { csrfProtection } from "../middleware/security.js";
import { assertDeliveryEnabled, setRiderDeliverySetting } from "../services/riderAccessService.js";
import { runInventoryTransaction } from "../services/inventoryStockService.js";

test("saved rider setting activates normal site workflow without rehearsal flags", async t => {
  const keys = ["NODE_ENV", "MONGO_URI", "JWT_SECRET", "RIDER_WORKFLOW_ENABLED", "RIDER_PREVIEW_ENABLED"];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try { await withIsolatedMongo(async ({ uri }) => {
    // Owned local DB only; production NODE_ENV tests the real-mode gate, not real records.
    Object.assign(process.env, { NODE_ENV: "production", MONGO_URI: uri, JWT_SECRET: "isolated-activation-secret", RIDER_WORKFLOW_ENABLED: "false", RIDER_PREVIEW_ENABLED: "false" });
    const actors = {};
    for (const role of ["admin", "manager", "cashier", "customer", "rider"]) actors[role] = await User.create({ role, name: `Local ${role}`, email: `${role}@activation.invalid`, password: "LocalDummy123!" });
    actors.other = await User.create({ role: "rider", name: "Other", email: "other@activation.invalid", password: "LocalDummy123!" });
    const app = express(); app.use(express.json(), csrfProtection);
    app.use("/api/settings", settingsRoutes); app.use("/api/rider", riderRoutes); app.use("/api/deliveries", deliveryRoutes);
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ success: false, message: error.message }));
    const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    let key = 0;
    const call = async (path, actor = actors.admin, method = "GET", body) => {
      const token = actor ? jwt.sign({ id: actor._id, sv: 0 }, process.env.JWT_SECRET) : "";
      const res = await fetch(`${base}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: res.status, body: await res.json() };
    };
    const payload = (expectedRevision, extra = {}) => ({ expectedRevision, idempotencyKey: `activation-request-${++key}`, ...extra });
    const setting = (enabled, expectedRevision, actor = actors.admin) => call("/settings/rider-delivery", actor, "PATCH", { enabled, expectedRevision });
    try {
      await t.test("missing/legacy settings fail closed; unrelated settings and public checkout stay unchanged", async () => {
        assert.equal((await call("/rider/portal", actors.rider)).body.mode, "disabled");
        assert.equal((await call("/deliveries")).status, 503);
        await RestaurantSettings.collection.insertOne({ key: "default", location: { city: "Test city" } });
        const settings = await call("/settings"); assert.deepEqual(settings.body.data.riderDelivery, { enabled: false, revision: 0 });
        const publicData = (await call("/settings/public", null)).body.data; assert.equal("riderDelivery" in publicData, false);
        assert.equal((await call("/settings", actors.admin, "PUT", { riderDelivery: { enabled: true } })).status, 400);
      });
      await t.test("only admin may toggle; strict payload validation and revision conflict", async () => {
        assert.equal((await setting(true, 0, null)).status, 401);
        for (const role of ["manager", "cashier", "rider", "customer"]) assert.equal((await setting(true, 0, actors[role])).status, 403);
        assert.equal((await call("/settings/rider-delivery", actors.admin, "PATCH", { enabled: "true", expectedRevision: 0 })).status, 400);
        assert.equal((await setting(true, 0)).status, 200);
        assert.equal((await setting(false, 0)).status, 409);
        assert.equal((await call("/deliveries/config")).body.operationalEnabled, true);
        assert.equal((await RestaurantSettings.findOne()).location.city, "Test city");
        assert.equal(await AuditLog.countDocuments({ action: "RIDER_DELIVERY_SETTING_CHANGED" }), 1);
        assert.equal((await call("/rider/preview", actors.rider)).status, 403);
      });
      const order = await Order.create({ orderNumber: "TEST-ACTIVATION-ORDER", source: "website", orderType: "delivery", status: "ready", paymentStatus: "pending", totalAmount: 40, subtotal: 40,
        customer: { name: "Synthetic recipient", phone: "+0000000000", address: "Local test address" }, items: [{ menuItem: new mongoose.Types.ObjectId(), name: "Dummy dish", quantity: 1, price: 40 }], inventoryStatus: "not_required" });
      let id;
      const action = async (name, actor, extra = {}, body) => {
        const row = await Delivery.findById(id);
        return call(`${actor.role === "rider" ? "/rider/workflow/deliveries" : "/deliveries"}/${id}/${name}`, actor, "POST", body || payload(row.revision, extra));
      };
      await t.test("normal availability, explicit enrollment, assignment, isolation and idempotency", async () => {
        assert.equal((await call("/rider/workflow/availability", actors.rider, "POST", payload(0, { available: true }))).status, 200);
        const enrolled = await call(`/deliveries/orders/${order._id}/enroll`, actors.manager, "POST", payload(0, { reason: "Isolated activation test" })); assert.equal(enrolled.status, 200, enrolled.body.message); id = enrolled.body.id;
        const body = payload(0, { riderId: String(actors.rider._id) });
        const assigned = await action("assign", actors.manager, {}, body); assert.equal(assigned.status, 200, assigned.body.message);
        assert.equal((await action("assign", actors.manager, {}, body)).body.duplicate, true);
        const list = await call("/rider/portal?status=assigned&page=1&limit=20", actors.rider); assert.equal(list.body.mode, "operational"); assert.equal(list.body.deliveries[0].id, id);
        assert.equal((await call("/rider/portal", actors.other)).body.deliveries.length, 0);
        assert.equal((await call(`/rider/workflow/deliveries/${id}`, actors.other)).status, 404);
        assert.equal((await call(`/rider/portal?riderId=${actors.rider._id}`, actors.other)).status, 400);
        assert.equal((await action("pickup", actors.rider)).status, 200);
      });
      await t.test("disable blocks all actions and retries without erasing outstanding delivery", async () => {
        const before = await Delivery.findById(id).lean(), writes = await DeliveryRequest.countDocuments();
        assert.equal((await setting(false, 1)).status, 200);
        assert.equal((await call("/rider/portal", actors.rider)).body.mode, "disabled");
        for (const [name, actor, extra] of [["deliver", actors.rider, {}], ["issue", actors.rider, { reason: "test" }], ["confirm_cash", actors.cashier, { terminal: "LOCAL" }]]) assert.equal((await action(name, actor, extra)).status, 503);
        assert.equal(await DeliveryRequest.countDocuments(), writes); assert.deepEqual(await Delivery.findById(id).lean(), before);
        assert.equal((await setting(true, 2)).status, 200);
      });
      await t.test("pickup/delivery never posts cash; cashier confirmation uses existing ledger once", async () => {
        assert.equal((await action("deliver", actors.rider)).status, 200);
        assert.equal((await Order.findById(order._id)).paymentStatus, "pending");
        assert.equal((await action("report_cash", actors.rider, { amount: "40" })).status, 200);
        assert.equal(await CashMovement.countDocuments(), 0);
        await PosShift.create({ cashier: actors.cashier._id, terminal: "LOCAL", openingCashHalala: 0, openedBy: actors.cashier._id, isOpen: true, status: "open" });
        const row = await Delivery.findById(id), body = payload(row.revision, { terminal: "LOCAL" });
        const results = await Promise.all([action("confirm_cash", actors.cashier, {}, body), action("confirm_cash", actors.cashier, {}, body)]);
        assert.ok(results.every(row => row.status === 200), JSON.stringify(results));
        assert.equal(await CashMovement.countDocuments({ order: order._id }), 1); assert.equal((await Order.findById(order._id)).paymentStatus, "paid");
        const history = await call("/rider/portal?history=true", actors.rider); assert.equal(history.body.deliveries[0].customerName, "Completed delivery");
        assert.equal(await StockTransaction.countDocuments(), 0); assert.equal(await Order.countDocuments(), 1);
      });
      await t.test("activation audit failure rolls back the toggle and preserves its revision", async () => {
        const original = AuditLog.create;
        try {
          AuditLog.create = async () => { throw new Error("Isolated audit failure"); };
          assert.equal((await setting(false, 3)).status, 500);
        } finally { AuditLog.create = original; }
        assert.equal((await RestaurantSettings.findOne()).riderDelivery.enabled, true);
        assert.equal((await RestaurantSettings.findOne()).riderDelivery.revision, 3);
      });
      await t.test("disable is serialized against in-flight writes; no post-disable partial write", async () => {
        let release, locked;
        const ready = new Promise(resolve => { locked = resolve; });
        const wait = new Promise(resolve => { release = resolve; });
        let once = true;
        const inFlight = runInventoryTransaction(async session => {
          await assertDeliveryEnabled(session, { lock: true });
          if (once) { once = false; locked(); await wait; }
          await User.updateOne({ _id: actors.rider._id }, { $inc: { riderAvailabilityRevision: 1 } }, { session });
        });
        await ready;
        const disabling = setRiderDeliverySetting(actors.admin, { enabled: false, expectedRevision: 3 });
        release(); await inFlight; await disabling;
        const before = (await User.findById(actors.rider._id)).riderAvailabilityRevision;
        await assert.rejects(runInventoryTransaction(session => assertDeliveryEnabled(session, { lock: true })), /disabled/);
        assert.equal((await User.findById(actors.rider._id)).riderAvailabilityRevision, before);
        assert.equal(await CashMovement.countDocuments(), 1);
      });
    } finally { await new Promise(resolve => server.close(resolve)); }
  }); } finally { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
});
