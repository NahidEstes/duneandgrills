import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import orderRoutes from "../routes/orderRoutes.js";
import kitchenRoutes from "../routes/kitchenRoutes.js";
import posRoutes from "../routes/posRoutes.js";
import deliveryRoutes from "../routes/deliveryOrderRoutes.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import AuditLog from "../models/AuditLog.js";
import StockTransaction from "../models/StockTransaction.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import AddOnInventoryRecipe from "../models/AddOnInventoryRecipe.js";
import MenuItem from "../models/MenuItem.js";
import MenuAddOn from "../models/MenuAddOn.js";
import Offer from "../models/Offer.js";
import Reward from "../models/Reward.js";
import PosHeldSale from "../models/PosHeldSale.js";
import PosShift from "../models/PosShift.js";
import CashMovement from "../models/CashMovement.js";
import { performStockMovement } from "../services/inventoryStockService.js";
import { reserveReward, restoreRedemption, creditOrderPoints, getRewardAccount } from "../services/rewardService.js";
import { transitionOrder } from "../services/orderEngineService.js";
import { buildSalesReport } from "../services/salesReportingService.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "phase2-owned-order-engine-test-only";
process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "false";

test("unified Customer/POS/Admin order engine (owned replica set only)", { timeout: 180000 }, async t => withIsolatedMongo(async () => {
  const actors = {};
  for (const role of ["admin", "manager", "cashier", "kitchen", "customer", "inventory"]) actors[role] = await User.create({ name: role, email: `${role}@order-engine.test`, password: "TestPassword123!", role, pointsBalance: 500 });
  const category = await InventoryCategory.create({ name: "Engine fixture", skuPrefix: "ENG" });
  const ingredient = await InventoryItem.create({ name: "Fixture ingredient", sku: "INV-ENG-001", category: category._id, unit: "kg", unitCost: 2 });
  await performStockMovement({ itemId: ingredient._id, movementType: "STOCK_IN", quantity: 100, lotNumber: "ENGINE", expiryDate: "2099-01-01", reason: "Owned fixture", userId: actors.admin._id, unitCost: 2 });
  const dish = await MenuItem.create({ name: "Engine dish", description: "Fixture", image: "/fixture.jpg", category: "Food", price: 20,
    customization: { enabled: true, spice: { enabled: true, options: ["medium", "hot"], default: "medium" } } });
  const addOn = await MenuAddOn.create({ name: "Extra", price: 2, menuItems: [dish._id] });
  await InventoryRecipe.create({ menuItem: dish._id, ingredients: [{ inventoryItem: ingredient._id, quantityPerSale: 1, unit: "kg" }], updatedBy: actors.admin._id });
  await AddOnInventoryRecipe.create({ addOn: addOn._id, ingredients: [{ inventoryItem: ingredient._id, quantityPerAddOn: 0.5, unit: "kg" }], updatedBy: actors.admin._id });
  const items = [{ productId: String(dish._id), quantity: 1, customization: { selectedAddOns: [{ addOn: String(addOn._id), quantity: 1 }], spiceLevel: "hot", note: "No onion" } }];
  const customerBody = () => ({ idempotencyKey: randomUUID(), fulfillmentType: "pickup", customer: { name: "Fixture", phone: "+966500000000" }, kitchenNotes: "Separate sauces", items });
  const stock = async () => (await InventoryItem.findById(ingredient._id)).currentStock;
  const app = express(); app.use(express.json());
  for (const [path, router] of [["orders", orderRoutes], ["kitchen", kitchenRoutes], ["pos", posRoutes], ["delivery-orders", deliveryRoutes]]) app.use("/api/" + path, router);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ success: false, message: error.message }));
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const api = async (role, path, body, method = body ? "POST" : "GET", headers = {}) => {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${jwt.sign({ id: String(actors[role]._id), sv: 0 }, process.env.JWT_SECRET)}` } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const status = (role, order, value, extra = {}) => api(role, `/orders/${order._id}/status`, { fulfillmentStatus: value, ...extra }, "PATCH");
  const kitchen = (order, value) => api("kitchen", `/kitchen/orders/${order._id}/status`, { fulfillmentStatus: value }, "PATCH");
  try {
    await t.test("concurrent customer creation/replay deducts once and preserves snapshots/secret tracking", async () => {
      const before = await stock(); const body = customerBody();
      const replies = await Promise.all(Array.from({ length: 4 }, () => api("customer", "/orders", body)));
      assert.deepEqual(replies.map(row => row.status).sort(), [200, 200, 200, 201]);
      const order = replies[0].body.data;
      assert.equal(new Set(replies.map(row => row.body.data._id)).size, 1);
      assert.equal(new Set(replies.map(row => row.body.trackingToken)).size, 1);
      assert.equal(order.sourceChannel, "customer"); assert.equal(order.fulfillmentType, "pickup"); assert.equal(order.fulfillmentStatus, "pending");
      assert.equal(order.totalAmount, 22); assert.equal(order.items[0].itemNote, "No onion");
      assert.match(order.orderNumber, /^DG-\d{8}-\d{4}$/);
      assert.equal(await stock(), before - 1.5);
      assert.equal(await StockTransaction.countDocuments({ order: order._id, movementType: "STOCK_OUT" }), 1);
      assert.equal(await AuditLog.countDocuments({ entityId: order._id, action: "ORDER_CREATED" }), 1);
      assert.equal((await api("customer", "/orders", { ...body, items: [{ productId: String(dish._id), quantity: 2 }] })).status, 409);
      assert.equal((await api(null, `/orders/track/${order.orderNumber}`)).status, 404);
      const tracked = await api(null, `/orders/track/${order.orderNumber}`, undefined, "GET", { "X-Order-Tracking-Token": replies[0].body.trackingToken });
      assert.equal(tracked.status, 200); assert.equal("customer" in tracked.body.data, false); assert.equal("creationRequestHash" in tracked.body.data, false);
      const queue = await api("kitchen", "/kitchen/orders"); const ticket = queue.body.data.find(row => row._id === order._id);
      assert.equal(ticket.kitchenNotes, "Separate sauces"); assert.match(ticket.notes, /Separate sauces/); assert.equal(ticket.items[0].itemNote, "No onion"); assert.equal("paymentStatus" in ticket, false);
    });
    await t.test("unknown request abandonment serializes with creation and recovers committed Customer/POS orders", async () => {
      for (const channel of ["customer", "pos"]) {
        const role = channel === "customer" ? null : "cashier";
        const createPath = channel === "customer" ? "/orders" : "/pos/sales";
        const cancelPath = channel === "customer" ? "/orders/requests/cancel" : "/pos/sale-requests/cancel";
        const payload = channel === "customer" ? customerBody() : { idempotencyKey: randomUUID(), terminal: "MAIN", items, paymentMethod: "card", fulfillmentType: "pickup" };
        const before = await stock();
        assert.equal((await api(role, cancelPath, payload)).body.cancelled, true);
        assert.equal((await api(role, createPath, payload)).status, 410);
        assert.equal((await api(role, cancelPath, payload)).body.cancelled, true);
        assert.equal(await stock(), before);
        if (channel === "pos") assert.equal((await api("manager", cancelPath, payload)).status, 403);
        const racing = { ...payload, idempotencyKey: randomUUID() };
        const [creation, cancellation] = await Promise.all([api(role, createPath, racing), api(role, cancelPath, racing)]);
        assert.equal(cancellation.status, 200);
        if (cancellation.body.cancelled) {
          assert.equal(creation.status, 410); assert.equal(await stock(), before);
        } else {
          assert.ok([200, 201].includes(creation.status)); assert.equal(creation.body.data._id, cancellation.body.data._id);
          assert.equal(await stock(), before - 1.5);
          assert.equal((await api(role, cancelPath, racing)).body.data._id, creation.body.data._id);
        }
        // Explicitly exercise the creation-wins case, including tracking recovery.
        const winning = { ...payload, idempotencyKey: randomUUID() };
        const created = await api(role, createPath, winning);
        assert.equal(created.status, 201);
        const recovered = await api(role, cancelPath, winning);
        assert.equal(recovered.body.cancelled, false); assert.equal(recovered.body.data._id, created.body.data._id);
        if (channel === "customer") assert.equal(recovered.body.trackingToken, created.body.trackingToken);
      }
    });
    await t.test("authorization, channel/status spoofing and canonical/legacy input validation", async () => {
      assert.equal((await api("customer", "/orders/admin", customerBody())).status, 403);
      assert.equal((await api("cashier", "/orders/admin", customerBody())).status, 403);
      assert.equal((await api(null, "/orders/admin", customerBody())).status, 401);
      for (const override of [{ sourceChannel: "admin" }, { paymentStatus: "paid" }, { fulfillmentStatus: "delivered" }, { fulfillmentType: "bad" }, { fulfillmentType: "pickup", orderType: "delivery" }, { kitchenNotes: "x".repeat(501) }]) {
        assert.equal((await api("customer", "/orders", { ...customerBody(), ...override })).status, 400);
      }
      const legacy = await api("customer", "/orders", { ...customerBody(), fulfillmentType: undefined, idempotencyKey: undefined, orderType: "dine-in" });
      assert.equal(legacy.status, 201); assert.equal(legacy.body.data.fulfillmentType, "dine_in");
      assert.equal((await status("customer", legacy.body.data, "confirmed")).status, 403);
      assert.equal((await status("cashier", legacy.body.data, "confirmed")).status, 403);
      assert.equal((await api("customer", `/kitchen/orders/${legacy.body.data._id}/status`, { status: "confirmed" }, "PATCH")).status, 403);
      assert.equal((await status("manager", legacy.body.data, "confirmed", { paymentStatus: "paid" })).status, 400);
      await assert.rejects(transitionOrder({ actor: actors.inventory, orderId: legacy.body.data._id, nextStatus: "confirmed" }), { status: 403 });
    });
    await t.test("one shared preparation/handoff lifecycle, stale writes and payment separation", async () => {
      const order = (await api("customer", "/orders", customerBody())).body.data;
      assert.equal((await status("manager", order, "ready")).status, 409);
      assert.equal((await status("manager", order, "confirmed", { expectedStatus: "ready" })).status, 409);
      const accepted = await status("manager", order, "confirmed"); assert.equal(accepted.status, 200); assert.ok(accepted.body.data.preparationDueAt);
      const [one, two] = await Promise.all([kitchen(order, "preparing"), kitchen(order, "preparing")]); assert.equal(one.status, 200); assert.equal(two.status, 200);
      assert.equal((await Order.findById(order._id)).statusHistory.filter(row => row.status === "preparing").length, 1);
      assert.equal((await kitchen(order, "ready")).status, 200);
      assert.equal((await status("manager", order, "out-for-delivery")).status, 409);
      const completed = await status("manager", order, "delivered"); assert.equal(completed.status, 200); assert.equal(completed.body.data.paymentStatus, "pending");
      assert.equal((await status("manager", order, "confirmed")).status, 409);
      assert.equal((await status("manager", order, "delivered")).body.duplicate, true);
      assert.equal((await Order.findById(order._id)).statusHistory.filter(row => row.status === "delivered").length, 1);
      const delivery = (await api("customer", "/orders", { ...customerBody(), fulfillmentType: "delivery", customer: { name: "Fixture", phone: "0500000000", address: "Fixture address" } })).body.data;
      for (const value of ["confirmed", "preparing", "ready"]) assert.equal((await kitchen(delivery, value)).status, 200);
      assert.equal((await status("manager", delivery, "delivered")).status, 409);
      assert.equal((await kitchen(delivery, "out-for-delivery")).status, 400);
      assert.equal((await status("manager", delivery, "out-for-delivery")).status, 200);
      assert.equal((await status("manager", delivery, "delivered")).status, 200);
    });
    await t.test("concurrent cancellation restores once; prepared cancellation never restores", async () => {
      const order = (await api("customer", "/orders", customerBody())).body.data; const before = await stock();
      const results = await Promise.all([1, 2].map(() => status("manager", order, "cancelled", { reason: "Fixture cancelled" })));
      assert.ok(results.every(row => row.status === 200)); assert.equal(await stock(), before + 1.5);
      assert.equal(await StockTransaction.countDocuments({ order: order._id, movementType: "STOCK_IN" }), 1);
      assert.equal(await AuditLog.countDocuments({ entityId: order._id, action: "ORDER_STATUS_CHANGED" }), 1);
      assert.equal((await status("manager", order, "confirmed")).status, 409);
      const prepared = (await api("customer", "/orders", customerBody())).body.data;
      await kitchen(prepared, "confirmed"); await kitchen(prepared, "preparing"); const afterPrep = await stock();
      assert.equal((await status("manager", prepared, "cancelled", { reason: "Prepared cancellation" })).status, 200); assert.equal(await stock(), afterPrep);
    });
    await t.test("bulk transitions roll back every write/side effect when one order conflicts", async () => {
      const pending = (await api("customer", "/orders", customerBody())).body.data;
      const terminal = (await api("customer", "/orders", customerBody())).body.data;
      await status("manager", terminal, "failed", { reason: "Fixture failed" });
      const before = await stock(); const audits = await AuditLog.countDocuments({ entityId: pending._id });
      const response = await api("manager", "/orders/bulk-status", { orderIds: [pending._id, terminal._id], status: "cancelled", reason: "Bulk cancel" }, "PATCH");
      assert.equal(response.status, 409); assert.equal((await Order.findById(pending._id)).status, "pending"); assert.equal(await stock(), before); assert.equal(await AuditLog.countDocuments({ entityId: pending._id }), audits);
    });
    await t.test("POS/admin share creation/inventory helper while historical imports stay outside kitchen", async () => {
      const body = { idempotencyKey: randomUUID(), fulfillmentType: "pickup", sourceChannel: "pos", terminal: "MAIN", items, paymentMethod: "card", kitchenNotes: "POS note" };
      const before = await stock(); const responses = await Promise.all([1, 2].map(() => api("cashier", "/pos/sales", body)));
      assert.deepEqual(responses.map(row => row.status).sort(), [200, 201]); const pos = responses[0].body.data;
      assert.equal(pos.sourceChannel, "pos"); assert.equal(pos.orderType, "takeaway"); assert.equal(pos.paymentStatus, "paid"); assert.equal(pos.fulfillmentStatus, "pending"); assert.equal(await stock(), before - 1.5);
      assert.equal((await api("manager", "/pos/sales", body)).status, 403);
      assert.equal((await api("cashier", "/pos/sales", { ...body, items: [{ productId: String(dish._id), quantity: 2 }] })).status, 409);
      for (const value of ["confirmed", "preparing", "ready"]) await kitchen(pos, value);
      assert.equal((await status("manager", pos, "delivered")).body.data.paymentStatus, "paid");
      const draft = await PosHeldSale.create({ cashier: actors.cashier._id, terminal: "MAIN", status: "held", items, expiresAt: new Date("2099-01-01") });
      const heldBody = { ...body, idempotencyKey: randomUUID(), heldSaleId: String(draft._id), heldSaleRevision: draft.revision };
      const beforeHeld = await stock();
      const heldReplies = await Promise.all([1, 2, 3].map(() => api("cashier", "/pos/sales", heldBody)));
      assert.deepEqual(heldReplies.map(row => row.status).sort(), [200, 200, 201]);
      assert.equal(new Set(heldReplies.map(row => row.body.data._id)).size, 1); assert.equal(await stock(), beforeHeld - 1.5);
      assert.equal((await PosHeldSale.findById(draft._id)).status, "consumed");
      const adminBody = { ...customerBody(), sourceChannel: "admin" }; const entered = await api("manager", "/orders/admin", adminBody);
      assert.equal(entered.status, 201); assert.equal(entered.body.data.source, "phone"); assert.equal(entered.body.data.sourceChannel, "admin"); assert.equal((await api("manager", "/orders/admin", adminBody)).status, 200);
      const historicalBody = { idempotencyKey: randomUUID(), provider: "jahez", externalOrderId: "ENGINE-001", orderOccurredAt: new Date().toISOString(), entryStatus: "completed", platformTotal: 22, branch: "Fixture", items };
      const imported = await api("cashier", "/delivery-orders/orders", historicalBody); assert.equal(imported.status, 201); assert.equal(imported.body.data.sourceChannel, "admin");
      const afterImport = await stock(); const retry = await api("cashier", "/delivery-orders/orders", historicalBody); assert.equal(retry.status, 200); assert.equal(retry.body.duplicate, true); assert.equal(await stock(), afterImport);
      assert.equal((await api("cashier", "/delivery-orders/orders", { ...historicalBody, idempotencyKey: undefined })).status, 409);
      const queue = await api("kitchen", "/kitchen/orders"); assert.equal(queue.body.data.some(row => row._id === imported.body.data._id), false);
    });
    await t.test("stock failure rolls back coupon usage, reward application and order creation", async () => {
      const offer = await Offer.create({ title: "Fixture coupon", description: "Fixture", image: "/fixture.jpg", promoCode: "ENGINE", discountType: "fixed", discountValue: 1, expiresAt: new Date(Date.now() + 86400000) });
      const reward = await Reward.create({ title: "Fixture reward", description: "Fixture", image: "/fixture.jpg", menuItem: dish._id, pointsRequired: 10 });
      const reserved = await reserveReward(actors.customer._id, reward);
      const redemptionId = reserved.redemption._id;
      const beforeCount = await Order.countDocuments(); const before = await stock();
      const body = { ...customerBody(), items: [{ productId: String(dish._id), quantity: 99 }], couponCode: "ENGINE", rewardRedemptionId: String(redemptionId) };
      assert.equal((await api("customer", "/orders", body)).status, 409);
      assert.equal(await Order.countDocuments(), beforeCount); assert.equal(await stock(), before); assert.equal((await Offer.findById(offer._id)).usageCount, 0);
      assert.equal((await User.findById(actors.customer._id)).rewardRedemptions.find(row => String(row._id) === String(redemptionId)).status, "reserved");
    });
    await t.test("legacy data derives aliases and can advance without rewriting old identifiers", async () => {
      const legacy = { orderNumber: "LEGACY-UNCHANGED", customer: { name: "Fixture", phone: "Not provided" }, items: [{ menuItem: dish._id, name: "Legacy", price: 20, quantity: 1 }], orderType: "dine-in", status: "ready", paymentStatus: "unpaid", totalAmount: 20 };
      const inserted = await Order.collection.insertOne(legacy);
      const result = await status("manager", { _id: String(inserted.insertedId) }, "delivered");
      assert.equal(result.status, 200); assert.equal(result.body.data.fulfillmentType, "dine_in"); assert.equal(result.body.data.sourceChannel, "customer"); assert.equal(result.body.data.orderNumber, "LEGACY-UNCHANGED"); assert.equal(result.body.data.paymentStatus, "unpaid");
    });
    await t.test("successful coupon/reward retries and cancellation apply every reservation/restoration once", async () => {
      const offer = await Offer.create({ title: "Retry coupon", description: "Fixture", image: "/fixture.jpg", promoCode: "RETRY", discountType: "fixed", discountValue: 1, usageLimit: 1, expiresAt: new Date(Date.now() + 86400000) });
      const customer = await User.findById(actors.customer._id);
      const redemption = customer.rewardRedemptions.find(row => row.status === "reserved");
      const pointsBefore = customer.pointsBalance; const before = await stock();
      const body = { ...customerBody(), couponCode: "RETRY", rewardRedemptionId: String(redemption._id) };
      const results = await Promise.all([1, 2, 3].map(() => api("customer", "/orders", body)));
      assert.deepEqual(results.map(row => row.status).sort(), [200, 200, 201]); const order = results[0].body.data;
      assert.equal(order.items.filter(row => row.price === 0).length, 1); assert.equal(await stock(), before - 2.5);
      assert.equal((await Offer.findById(offer._id)).usageCount, 1);
      assert.equal((await api("customer", "/orders", body)).status, 200);
      const cancellations = await Promise.all([1, 2].map(() => status("manager", order, "cancelled", { reason: "Unused reward cancelled" })));
      assert.ok(cancellations.every(row => row.status === 200)); assert.equal(await stock(), before);
      const restored = await User.findById(actors.customer._id);
      assert.equal(restored.pointsBalance, pointsBefore + redemption.pointsSpent);
      assert.equal(restored.rewardRedemptions.id(redemption._id).status, "restored");
    });
    await t.test("refund/void APIs preserve separate fulfillment and immutable audit histories", async () => {
      const body = { idempotencyKey: randomUUID(), terminal: "MAIN", orderType: "dine-in", items, paymentMethod: "card", customerId: String(actors.customer._id) };
      const order = (await api("cashier", "/pos/sales", body)).body.data;
      assert.equal((await status("manager", order, "cancelled", { reason: "Must refund first" })).status, 400);
      assert.equal((await status("manager", order, "refunded")).status, 400);
      assert.equal((await api("cashier", `/pos/sales/${order._id}/refunds`, { idempotencyKey: randomUUID(), amount: 22, reason: "Fixture return" })).status, 403);
      const pointsBefore = (await User.findById(actors.customer._id)).pointsBalance;
      const request = { idempotencyKey: randomUUID(), items: [{ index: 0, quantity: 1 }], restock: true, reason: "Unused fixture returned", method: "card" };
      const requested = await api("manager", `/pos/sales/${order._id}/refunds`, request); assert.equal(requested.status, 201);
      const refund = requested.body.refund;
      assert.equal((await api("manager", `/pos/refunds/${refund._id}/approve`, {})).status, 200);
      const before = await stock();
      const completions = await Promise.all([1, 2].map(() => api("manager", `/pos/refunds/${refund._id}/complete`, {})));
      assert.ok(completions.every(row => row.status === 200)); assert.equal(await stock(), before + 1.5);
      const refunded = await Order.findById(order._id); assert.equal(refunded.status, "pending"); assert.equal(refunded.paymentStatus, "refunded");
      assert.equal(await AuditLog.countDocuments({ entityId: refund._id, action: "REFUND_COMPLETED" }), 1);
      assert.equal((await kitchen(order, "confirmed")).status, 409);
      const pointsAfter = (await User.findById(actors.customer._id)).pointsBalance; assert.equal(pointsAfter, pointsBefore, "Uncompleted POS sales earn no points to reverse");
      assert.equal((await status("manager", order, "cancelled", { reason: "Refunded order cancelled" })).status, 200);
      assert.equal(await stock(), before + 1.5); assert.equal((await User.findById(actors.customer._id)).pointsBalance, pointsAfter);
      const voidedOrder = (await api("cashier", "/pos/sales", { ...body, idempotencyKey: randomUUID() })).body.data;
      const beforeVoid = await stock(); const voidBody = { idempotencyKey: randomUUID(), reason: "Unused fixture voided", restock: true };
      assert.equal((await api("manager", `/pos/sales/${voidedOrder._id}/void`, voidBody)).status, 200);
      assert.equal((await api("manager", `/pos/sales/${voidedOrder._id}/void`, voidBody)).body.duplicate, true);
      assert.equal(await stock(), beforeVoid + 1.5); assert.equal((await kitchen(voidedOrder, "confirmed")).status, 409);
      assert.equal(await AuditLog.countDocuments({ entityId: voidedOrder._id, action: "POS_SALE_VOIDED" }), 1);
    });
    await t.test("audit failure rolls back creation/stock and a cancellation, then the same request safely retries", async () => {
      const body = customerBody(); const before = await stock(); const count = await Order.countDocuments();
      const originalCreate = AuditLog.create;
      try {
        AuditLog.create = async () => { throw new Error("Fixture audit unavailable"); };
        assert.equal((await api("customer", "/orders", body)).status, 500);
        assert.equal(await stock(), before); assert.equal(await Order.countDocuments(), count);
      } finally { AuditLog.create = originalCreate; }
      const response = await api("customer", "/orders", body); assert.equal(response.status, 201);
      const order = response.body.data; const after = await stock();
      try {
        AuditLog.create = async () => { throw new Error("Fixture audit unavailable"); };
        assert.equal((await status("manager", order, "cancelled", { reason: "Audit rollback" })).status, 500);
        assert.equal(await stock(), after); assert.equal((await Order.findById(order._id)).status, "pending");
      } finally { AuditLog.create = originalCreate; }
      assert.equal((await status("manager", order, "cancelled", { reason: "Audit restored" })).status, 200); assert.equal(await stock(), before);
    });
    await t.test("customer COD -> kitchen -> handover -> points -> channel report, including concurrent collection", async () => {
      const before = (await User.findById(actors.customer._id)).pointsBalance;
      const created = await api("customer", "/orders", { ...customerBody(), paymentOption: "cod" });
      assert.equal(created.status, 201); const order = created.body.data;
      for (const value of ["confirmed", "preparing", "ready"]) assert.equal((await kitchen(order, value)).status, 200);
      assert.equal((await api("customer", `/orders/${order._id}/handoff`, { status: "delivered" }, "PATCH")).status, 403);
      assert.equal((await api("kitchen", `/kitchen/orders/${order._id}/handoff`, { status: "delivered", expectedStatus: "ready" }, "PATCH")).status, 200);
      assert.equal((await User.findById(actors.customer._id)).pointsBalance, before);
      const payment = { idempotencyKey: randomUUID(), method: "cash", amount: 22 };
      assert.equal((await api("kitchen", `/orders/${order._id}/payment`, payment)).status, 403);
      const shifts = await PosShift.create(["COD-A", "COD-B"].map(terminal => ({ cashier: actors.cashier._id, openedBy: actors.cashier._id, openingCashHalala: 0, terminal })));
      assert.equal((await api("cashier", `/orders/${order._id}/payment`, payment)).status, 400);
      payment.terminal = "COD-B";
      const collections = await Promise.all([1, 2, 3].map(() => api("cashier", `/orders/${order._id}/payment`, payment)));
      assert.ok(collections.every(row => row.status === 200), JSON.stringify(collections));
      assert.equal((await Order.findById(order._id)).paymentRecords.length, 1);
      assert.equal(String((await Order.findById(order._id)).posShift), String(shifts[1]._id));
      assert.equal(await CashMovement.countDocuments({ order: order._id, shift: shifts[1]._id, type: "cash_sale" }), 1);
      await PosShift.updateMany({ _id: { $in: shifts.map(row => row._id) } }, { isOpen: false, status: "closed" });
      const customer = await User.findById(actors.customer._id);
      assert.equal(customer.pointsBalance, before + 220); assert.equal(customer.pointTransactions.filter(row => row.sourceKey === `ORDER_EARN:${order._id}`).length, 1);
      assert.equal(await AuditLog.countDocuments({ entityId: order._id, action: "ORDER_PAYMENT_COLLECTED" }), 1);
      assert.equal((await api("cashier", `/orders/${order._id}/payment`, { ...payment, amount: 1 })).status, 409);
      const report = await buildSalesReport({ orderFilter: { _id: (await Order.findById(order._id))._id } });
      assert.equal(report.summary.netSales, 22); assert.equal(report.cashActivity.cashCollected, 22); assert.equal(report.sourceBreakdown[0].source, "website"); assert.equal(report.orderTypeBreakdown[0].orderType, "pickup");
      const repeated = await api("customer", `/orders/${order._id}/repeat`, {});
      assert.equal(repeated.status, 200); assert.equal(repeated.body.data[0].price, 22); assert.equal(repeated.body.data[0].note, "No onion");
      assert.equal((await api("manager", `/orders/${order._id}/repeat`, {})).status, 404);
      assert.equal((await api(null, "/orders", { ...customerBody(), paymentOption: "card" })).status, 503);
      const freeCoupon = await Offer.create({ title: "Zero-due fixture", description: "Fixture", image: "/fixture.jpg", promoCode: "ZERODUE", discountType: "percentage", discountValue: 100, expiresAt: new Date(Date.now() + 86400000) });
      const freeOrder = (await api("customer", "/orders", { ...customerBody(), couponCode: freeCoupon.promoCode })).body.data;
      assert.equal(freeOrder.totalAmount, 0);
      for (const value of ["confirmed", "preparing", "ready"]) await kitchen(freeOrder, value);
      await api("kitchen", `/kitchen/orders/${freeOrder._id}/handoff`, { status: "delivered" }, "PATCH");
      const freeShift = await PosShift.create({ cashier: actors.cashier._id, openedBy: actors.cashier._id, openingCashHalala: 0, terminal: "ZERO" });
      const balanceBeforeFree = (await User.findById(actors.customer._id)).pointsBalance;
      assert.equal((await api("cashier", `/orders/${freeOrder._id}/payment`, { idempotencyKey: randomUUID(), method: "cash", amount: 0, terminal: "ZERO" })).status, 200);
      assert.equal(await CashMovement.countDocuments({ order: freeOrder._id }), 0);
      assert.equal((await User.findById(actors.customer._id)).pointsBalance, balanceBeforeFree);
      await PosShift.updateOne({ _id: freeShift._id }, { isOpen: false, status: "closed" });
    });
    await t.test("POS phone/delivery, coupon and reward share account, hold options, stock and completion accrual", async () => {
      assert.equal((await api("cashier", "/pos/sales", { idempotencyKey: randomUUID(), terminal: "MAIN", items, orderOrigin: "phone", paymentMethod: "card" })).status, 400);
      await User.updateOne({ _id: actors.customer._id }, { phone: "0500000000" });
      const offer = await Offer.create({ title: "POS coupon", description: "Fixture", image: "/fixture.jpg", promoCode: "POSNEW", discountType: "fixed", discountValue: 2, expiresAt: new Date(Date.now() + 86400000), membersOnly: true });
      const reward = await Reward.create({ title: "POS reward", description: "Fixture", image: "/fixture.jpg", menuItem: dish._id, pointsRequired: 10 });
      assert.equal((await api("cashier", "/pos/coupons/validate", { code: offer.promoCode, items })).status, 403);
      assert.equal((await api("cashier", "/pos/coupons/validate", { code: offer.promoCode, items, customerId: String(actors.customer._id) })).body.data.discountAmount, 2);
      const before = (await User.findById(actors.customer._id)).pointsBalance; const stockBefore = await stock();
      const body = { idempotencyKey: randomUUID(), terminal: "MAIN", fulfillmentType: "delivery", orderOrigin: "phone", items, customerId: String(actors.customer._id), customer: { address: "Owned delivery address" }, couponCode: offer.promoCode, rewardId: String(reward._id), paymentMethod: "card" };
      const responses = await Promise.all([1, 2].map(() => api("cashier", "/pos/sales", body))); assert.deepEqual(responses.map(row => row.status).sort(), [200, 201]); const order = responses[0].body.data;
      assert.equal(order.orderOrigin, "phone"); assert.equal(order.items.length, 2); assert.equal(order.totalAmount, 30); assert.equal(order.discountAmount, 2); assert.equal(await stock(), stockBefore - 2.5);
      assert.equal((await User.findById(actors.customer._id)).pointsBalance, before - 10); assert.equal((await Offer.findById(offer._id)).usageCount, 1);
      for (const value of ["confirmed", "preparing", "ready"]) await kitchen(order, value);
      for (const value of ["out-for-delivery", "delivered"]) assert.equal((await api("cashier", `/orders/${order._id}/handoff`, { status: value }, "PATCH")).status, 200);
      assert.equal((await User.findById(actors.customer._id)).pointsBalance, before - 10 + 200);
      const queue = await api("kitchen", "/kitchen/orders"); assert.ok(queue.body.data.some(row => row._id === order._id && row.status === "delivered"));
      const held = await api("cashier", "/pos/held-sales", { items, orderType: "delivery", customer: { name: "Held", phone: "0500000000", address: "Held address" }, checkoutOptions: { orderOrigin: "phone", couponCode: "POSNEW", rewardId: String(reward._id) } });
      assert.equal(held.status, 201); assert.equal(held.body.data.orderType, "delivery"); assert.equal(held.body.data.customer.address, "Held address"); assert.equal(held.body.data.checkoutOptions.couponCode, "POSNEW");
      const catalog = await api("cashier", `/pos/customers/${actors.customer._id}/rewards`); assert.equal(catalog.status, 200); assert.ok(catalog.body.data.membership.tier);
      const customerBody = { name: "Counter account", phone: "0501234567", email: "counter@order-engine.test", password: "OwnPassword123!", role: "admin", pointsBalance: 99999 };
      const customer = await api("cashier", "/pos/customers", customerBody); assert.equal(customer.status, 201); assert.equal("password" in customer.body.data, false);
      const stored = await User.findById(customer.body.data._id).select("+password"); assert.equal(stored.role, "customer"); assert.notEqual(stored.password, customerBody.password); assert.equal(stored.pointsBalance || 0, 0);
      assert.equal((await api("cashier", "/pos/customers", customerBody)).status, 409);
    });
    await t.test("completed POS partial refund reverses earned points once, eligibility and station filters", async () => {
      const order = (await api("cashier", "/pos/sales", { idempotencyKey: randomUUID(), terminal: "MAIN", items, paymentMethod: "card", customerId: String(actors.customer._id) })).body.data;
      for (const value of ["confirmed", "preparing", "ready"]) await kitchen(order, value);
      await api("cashier", `/orders/${order._id}/handoff`, { status: "delivered" }, "PATCH");
      const before = (await User.findById(actors.customer._id)).pointsBalance;
      const result = await api("manager", `/pos/sales/${order._id}/refunds`, { idempotencyKey: randomUUID(), amount: 11, reason: "Partial completed refund", method: "card" }); assert.equal(result.status, 201);
      await api("manager", `/pos/refunds/${result.body.refund._id}/approve`, {});
      const replies = await Promise.all([1, 2].map(() => api("manager", `/pos/refunds/${result.body.refund._id}/complete`, {}))); assert.ok(replies.every(row => row.status === 200));
      assert.equal((await User.findById(actors.customer._id)).pointsBalance, before - 110);
      const gold = await Offer.create({ title: "Gold only", description: "Fixture", image: "/fixture.jpg", promoCode: "GOLDNEW", discountType: "fixed", discountValue: 1, expiresAt: new Date(Date.now() + 86400000), minimumTier: "Gold" });
      assert.equal((await api("customer", "/orders", { ...customerBody(), couponCode: gold.promoCode })).status, 403);
      const expired = await Reward.create({ title: "Expired", description: "Fixture", image: "/fixture.jpg", menuItem: dish._id, pointsRequired: 1, expiresAt: new Date(Date.now() - 1000) });
      await assert.rejects(reserveReward(actors.customer._id, expired), /expired/);
      await MenuItem.updateOne({ _id: dish._id }, { kitchenStation: "Grill" });
      const fresh = (await api("customer", "/orders", customerBody())).body.data;
      const stations = await api("kitchen", "/kitchen/orders?station=Grill&category=Food"); assert.ok(stations.body.data.some(row => row._id === fresh._id)); assert.equal(stations.body.data.find(row => row._id === fresh._id).items[0].kitchenStation, "Grill");
      assert.equal((await api(null, "/kitchen/events")).status, 401);
    });
    await t.test("refund after points were spent records debt; future credits and reservation returns settle it once", async () => {
      const customer = await User.create({ name: "Debt fixture", email: "debt@order-engine.test", password: "TestPassword123!", role: "customer", pointsBalance: 0 });
      const order = (await api("cashier", "/pos/sales", { idempotencyKey: randomUUID(), terminal: "MAIN", items, paymentMethod: "card", customerId: String(customer._id) })).body.data;
      for (const value of ["confirmed", "preparing", "ready"]) await kitchen(order, value);
      await api("cashier", `/orders/${order._id}/handoff`, { status: "delivered" }, "PATCH");
      const reward = await Reward.create({ title: "Debt reward", description: "Fixture", image: "/fixture.jpg", menuItem: dish._id, pointsRequired: 220 });
      const reservation = await reserveReward(customer._id, reward); assert.ok(reservation);
      const refund = (await api("manager", `/pos/sales/${order._id}/refunds`, { idempotencyKey: randomUUID(), amount: 22, reason: "Paid order returned", method: "card" })).body.refund;
      await api("manager", `/pos/refunds/${refund._id}/approve`, {}); await api("manager", `/pos/refunds/${refund._id}/complete`, {});
      assert.equal((await getRewardAccount(customer._id)).pointsDebt, 220);
      const futureId = new Order()._id;
      await creditOrderPoints({ userId: customer._id, orderId: futureId, orderNumber: "Debt repayment", points: 100 });
      await creditOrderPoints({ userId: customer._id, orderId: futureId, orderNumber: "Debt repayment", points: 100 });
      assert.equal((await getRewardAccount(customer._id)).pointsDebt, 120);
      await restoreRedemption({ userId: customer._id, redemptionId: reservation.redemption._id, expectedStatuses: ["reserved"], status: "cancelled", description: "Owned reservation returned" });
      const final = await getRewardAccount(customer._id); assert.equal(final.pointsDebt, 0); assert.equal(final.pointsBalance, 100); assert.equal(final.membership.lifetimePoints, 100);
    });
    await t.test("authorized kitchen stream emits only invalidations and disconnects cleanly", async () => {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(base + "/kitchen/events", { headers: { Authorization: `Bearer ${jwt.sign({ id: String(actors.kitchen._id), sv: 0 }, process.env.JWT_SECRET)}` }, signal: controller.signal });
        assert.equal(response.status, 200); assert.match(response.headers.get("content-type"), /event-stream/);
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let received = "";
        const connected = await reader.read(); received += decoder.decode(connected.value); assert.match(received, /event: connected/);
        // Allow the change-stream cursor to establish its initial resume point.
        await new Promise(resolve => setTimeout(resolve, 100));
        await api("customer", "/orders", customerBody());
        while (!received.includes("orders-changed")) { const chunk = await reader.read(); if (chunk.done) break; received += decoder.decode(chunk.value); }
        assert.match(received, /event: orders-changed\ndata: \{\}/); assert.ok(!received.includes("No onion") && !received.includes("0500000000"));
        await reader.cancel();
      } finally { clearTimeout(timeout); controller.abort(); }
    });
    await t.test("header idempotency supports guest retries without exposing private fields", async () => {
      const body = { ...customerBody(), idempotencyKey: undefined }; const key = randomUUID(); const before = await stock();
      const replies = await Promise.all([1, 2].map(() => api(null, "/orders", body, "POST", { "Idempotency-Key": key })));
      assert.deepEqual(replies.map(row => row.status).sort(), [200, 201]); assert.equal(await stock(), before - 1.5);
      assert.equal(replies[0].body.data._id, replies[1].body.data._id); assert.equal(replies[0].body.trackingToken, replies[1].body.trackingToken);
      const id = replies[0].body.data._id;
      assert.equal((await api("customer", `/orders/${id}`)).status, 404);
      assert.equal((await api(null, "/orders", body, "POST", { "Idempotency-Key": "guessable" })).status, 400);
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
}));
