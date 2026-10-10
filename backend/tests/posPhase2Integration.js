import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import express from "express";
import mongoose from "mongoose";
import { MongoClient } from "mongodb";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import posRoutes from "../routes/posRoutes.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import MenuItem from "../models/MenuItem.js";
import MenuAddOn from "../models/MenuAddOn.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import AddOnInventoryRecipe from "../models/AddOnInventoryRecipe.js";
import PosShift from "../models/PosShift.js";
import PosSession from "../models/PosSession.js";
import PosHeldSale from "../models/PosHeldSale.js";
import CashMovement from "../models/CashMovement.js";
import Refund from "../models/Refund.js";
import AuditLog from "../models/AuditLog.js";
import RestaurantSettings from "../models/RestaurantSettings.js";
import { performStockMovement } from "../services/inventoryStockService.js";
import { savePosTerminal } from "../services/posTerminalService.js";
import { openPosShift, closePosShift, summarizePosShift, addCashMovement, reopenPosShift } from "../services/posShiftService.js";
import { createRefundRequest, transitionRefund } from "../services/refundService.js";
import { voidPosSale } from "../services/posVoidService.js";
import { creditPosSaleRewards } from "../services/refundRestorationService.js";
import { calculateOrderPoints } from "../config/rewards.js";
import { rateLimit } from "../middleware/security.js";

// This suite always starts its own local replica set; it never reads a production URI.
process.env.NODE_ENV = "test";
process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "false";
process.env.JWT_SECRET = "isolated-pos-phase2-test-secret-long-enough";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const unusedPort = async () => { const server = net.createServer(); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; };

test("POS Phase 2 transaction and API integration", { timeout: 180000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "dg-pos-phase2-test-"));
  const port = await unusedPort();
  const mongo = spawn(process.env.MONGOD_BINARY || "mongod", ["--dbpath", directory, "--port", String(port), "--bind_ip", "127.0.0.1", "--replSet", "dgPosTest", "--logpath", path.join(directory, "mongo.log"), "--quiet"], { windowsHide: true, stdio: "ignore" });
  let spawnError; mongo.on("error", error => { spawnError = error; });
  let client; let httpServer;
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (spawnError) throw spawnError;
      try { client = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 500 }); await client.connect(); break; }
      catch { await client?.close(); client = null; await delay(200); }
    }
    if (!client) throw new Error("Temporary mongod did not start; install MongoDB or set MONGOD_BINARY");
    await client.db("admin").command({ replSetInitiate: { _id: "dgPosTest", members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    for (let attempt = 0; attempt < 80; attempt++) { if ((await client.db("admin").command({ hello: 1 })).isWritablePrimary) break; await delay(200); }
    await mongoose.connect(`mongodb://127.0.0.1:${port}/dg_pos_phase2_test?replicaSet=dgPosTest`);
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    const app = express(); app.use(express.json()); app.use("/api/pos", posRoutes); app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
    httpServer = await new Promise(resolve => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
    const origin = `http://127.0.0.1:${httpServer.address().port}/api/pos`;
    const makeUser = (name, role) => User.create({ name, role, email: `${name.toLowerCase().replaceAll(" ", "")}@pos.test`, password: "TestPassword123!", posPinHash: bcrypt.hashSync("654321", 12) });
    const admin = await makeUser("Admin", "admin"); const cashier = await makeUser("Cashier", "cashier"); const second = await makeUser("Cashier Two", "cashier"); const customer = await makeUser("Customer", "customer");
    const bearer = actor => jwt.sign({ id: String(actor._id), sv: Number(actor.sessionVersion || 0) }, process.env.JWT_SECRET);
    const sessionTokens = new Map();
    const api = async (actor, route, body, token = sessionTokens.get(String(actor._id))) => { const response = await fetch(origin + route, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${bearer(actor)}`, "Content-Type": "application/json", ...(token ? { "X-POS-Session": token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const data = await response.json(); if (route === "/session" && data.data?.token) sessionTokens.set(String(actor._id), data.data.token); return { status: response.status, body: data }; };
    const terminal = await savePosTerminal({ payload: { code: "COUNTER-1", name: "Counter One" }, actor: admin });
    const otherTerminal = await savePosTerminal({ payload: { code: "COUNTER-2", name: "Counter Two" }, actor: admin });
    const menu = await MenuItem.create({ name: "Test Burger", description: "Test", image: "/burger.jpg", category: "Food", price: 20, customization: { enabled: true } });
    const addOn = await MenuAddOn.create({ name: "Extra Sauce", price: 2, menuItems: [menu._id] });
    const category = await InventoryCategory.create({ name: "Test Ingredients", skuPrefix: "TEST" });
    const ingredient = await InventoryItem.create({ name: "Ingredient", sku: "INV-TEST-001", category: category._id, unit: "kg", unitCost: 10 });
    await performStockMovement({ itemId: ingredient._id, movementType: "STOCK_IN", quantity: 50, lotNumber: "A", expiryDate: "2099-01-01", reason: "Test fixture", userId: admin._id, unitCost: 10 });
    await InventoryRecipe.create({ menuItem: menu._id, ingredients: [{ inventoryItem: ingredient._id, quantityPerSale: 1, unit: "kg" }], updatedBy: admin._id });
    await AddOnInventoryRecipe.create({ addOn: addOn._id, ingredients: [{ inventoryItem: ingredient._id, quantityPerAddOn: 0.5, unit: "kg" }], updatedBy: admin._id });
    const line = { productId: menu._id, productType: "menuItem", quantity: 2, customization: { selectedAddOns: [{ addOn: addOn._id, quantity: 1 }], note: "No onion" } };
    const sale = (actor, overrides = {}) => api(actor, "/sales", { idempotencyKey: crypto.randomUUID(), terminal: terminal.code, items: [line], orderType: "dine-in", paymentMethod: "cash", cashReceived: 100, ...overrides });

    await t.test("terminal uniqueness, immutability and permissions", async () => {
      await assert.rejects(savePosTerminal({ payload: { code: "counter-1", name: "Duplicate" }, actor: admin }), /already exists/);
      await assert.rejects(savePosTerminal({ id: terminal._id, payload: { code: "CHANGED", name: "Renamed" }, actor: admin }), /cannot be changed/);
      assert.equal((await api(cashier, "/terminals", { code: "BAD", name: "Forbidden" })).status, 403);
      assert.equal((await api(customer, "/terminals")).status, 403);
    });
    await t.test("inactive/unregistered terminal rejects sales and historical MAIN remains supported", async () => {
      await savePosTerminal({ id: otherTerminal._id, payload: { name: "Counter Two", isActive: false }, actor: admin });
      assert.equal((await sale(cashier, { terminal: otherTerminal.code })).status, 400);
      assert.equal((await sale(cashier, { terminal: "INVENTED" })).status, 400);
      assert.equal((await sale(cashier, { terminal: "MAIN", paymentMethod: "card" })).status, 201);
      await savePosTerminal({ id: otherTerminal._id, payload: { name: "Counter Two", isActive: true }, actor: admin });
    });
    await t.test("concurrent terminal shifts and incompatible cashier shifts are blocked", async () => {
      const attempts = await Promise.allSettled([openPosShift({ actor: cashier, terminal: terminal.code, openingCash: 50 }), openPosShift({ actor: second, terminal: terminal.code, openingCash: 50 })]);
      assert.equal(attempts.filter(row => row.status === "fulfilled").length, 1);
      const active = attempts.find(row => row.status === "fulfilled").value;
      const actor = String(active.cashier) === String(cashier._id) ? cashier : second;
      await assert.rejects(openPosShift({ actor, terminal: otherTerminal.code, openingCash: 0 }), /already exists/);
      await assert.rejects(savePosTerminal({ id: terminal._id, payload: { name: "Counter", isActive: false }, actor: admin }), /Close all shifts/);
      const closes = await Promise.all([1, 2].map(() => closePosShift({ shiftId: active._id, countedCash: 50, actor, settings: { varianceThreshold: 10 }, idempotencyKey: "conflict-close" })));
      assert.equal(closes.filter(row => !row.duplicate).length, 1);
    });
    let token;
    await t.test("secure session lock/unlock, dedicated PIN, switch identity and inactive cashier rejection", async () => {
      const session = await api(cashier, "/session"); token = session.body.data.token;
      assert.ok(token); assert.equal(session.body.data.actor.name, cashier.name);
      await api(cashier, "/session/lock", {}, token);
      assert.equal((await api(cashier, "/sales", undefined, null)).status, 401);
      const reopened = await api(cashier, "/session", undefined, null); assert.equal(reopened.body.data.locked, true);
      assert.equal((await api(cashier, "/sales", undefined, token)).status, 423);
      assert.equal((await api(cashier, "/session/unlock", { pin: "000000" }, token)).status, 401);
      assert.equal((await api(cashier, "/session/unlock", { pin: "654321" }, token)).status, 200);
      const switched = await api(cashier, "/session/switch", { cashierId: second._id, pin: "654321" }, token);
      assert.equal(switched.body.data.actor.name, second.name);
      const switchedSale = await api(cashier, "/sales", { idempotencyKey: "switched-sale", terminal: terminal.code, items: [line], orderType: "takeaway", paymentMethod: "card" }, token);
      assert.equal(switchedSale.status, 201); assert.equal(String(switchedSale.body.data.createdBy._id), String(second._id));
      await User.updateOne({ _id: second._id }, { $set: { isActive: false } });
      assert.equal((await api(cashier, "/session/unlock", { pin: "654321" }, token)).status, 401);
      await User.updateOne({ _id: second._id }, { $set: { isActive: true } });
    });
    await t.test("PIN failures cause a persistent temporary lockout and rate limiter rejects abuse", async () => {
      await PosSession.updateMany({ owner: cashier._id }, { $set: { actor: cashier._id, actorSessionVersion: cashier.sessionVersion || 0 } });
      const session = await api(cashier, "/session"); const pinToken = session.body.data.token;
      for (let index = 0; index < 5; index++) assert.equal((await api(cashier, "/session/unlock", { pin: "000000" }, pinToken)).status, 401);
      assert.equal((await api(cashier, "/session/unlock", { pin: "654321" }, pinToken)).status, 429);
      assert.ok(await PosSession.exists({ blockedUntil: { $gt: new Date() } }));
      const limiter = rateLimit({ max: 1, keyPrefix: "phase2-unit" }); let denied = false;
      const response = { set() {}, status(code) { denied = code === 429; return this; }, json() {} };
      await limiter({ ip: "isolated-test", user: cashier }, response, () => {}); await limiter({ ip: "isolated-test", user: cashier }, response, () => {}); assert.equal(denied, true);
      await PosSession.updateMany({ owner: cashier._id }, { $set: { failedAttempts: 0, blockedUntil: null, locked: false } });
    });
    await RestaurantSettings.create({ key: "default", posShifts: { enabled: true, requireOpenShift: true, blindClose: true, varianceThreshold: 1, singleShiftPerTerminal: true } });
    const shift = await openPosShift({ actor: cashier, terminal: terminal.code, openingCash: 50, openingNote: "Morning" });
    await t.test("cashier switch and shift close guard unfinished sales without deleting them", async () => {
      const held = await PosHeldSale.create({ cashier: cashier._id, terminal: terminal.code, items: [line], status: "held", orderType: "dine-in", paymentMethod: "cash", expiresAt: new Date(Date.now() + 86400000) });
      await assert.rejects(closePosShift({ shiftId: shift._id, countedCash: 50, actor: cashier, settings: { varianceThreshold: 1 }, idempotencyKey: "unacknowledged" }), /unfinished\/held/);
      const ownSession = (await api(cashier, "/session")).body.data.token;
      assert.equal((await api(cashier, "/session/switch", { cashierId: second._id, pin: "654321" }, ownSession)).status, 400);
      assert.ok(await PosHeldSale.exists({ _id: held._id, status: "held" }));
      await PosHeldSale.updateOne({ _id: held._id }, { $set: { status: "cancelled" } });
      assert.equal((await api(second, `/shifts/${shift._id}`)).status, 403);
    });
    let cashOrder;
    await t.test("cash formula, card exclusion, cash movement validation/idempotency and blind close", async () => {
      const cash = await sale(cashier, { customerId: customer._id }); assert.equal(cash.status, 201); cashOrder = await Order.findById(cash.body.data._id);
      assert.equal((await sale(cashier, { paymentMethod: "card" })).status, 201);
      await addCashMovement({ shiftId: shift._id, type: "cash_in", amount: 10, reason: "Float", actor: cashier, idempotencyKey: "cash-in" });
      await addCashMovement({ shiftId: shift._id, type: "cash_in", amount: 10, reason: "Float", actor: cashier, idempotencyKey: "cash-in" });
      await addCashMovement({ shiftId: shift._id, type: "payout", amount: 4, reason: "Supplies", actor: cashier, idempotencyKey: "cash-out" });
      await assert.rejects(addCashMovement({ shiftId: shift._id, type: "cash_out", amount: -1, reason: "Invalid", actor: cashier }), /greater|negative|at least/);
      await assert.rejects(addCashMovement({ shiftId: shift._id, type: "cash_in", amount: 1, reason: "", actor: cashier }), /reason/);
      const summary = await summarizePosShift(shift); assert.equal(summary.totals.expectedCash, 100); assert.equal(summary.totals.cardSales, 44);
      const current = await api(cashier, `/shifts/current?terminal=${terminal.code}`); assert.equal(current.body.data.totals.expectedCash, undefined);
      assert.equal((await api(cashier, `/shifts/${shift._id}`)).body.data.totals.expectedCash, undefined);
    });
    let partial;
    await t.test("item refund uses server price, restores menu/add-on allocations once and reverses proportional rewards", async () => {
      const beforeStock = (await InventoryItem.findById(ingredient._id)).currentStock;
      partial = await createRefundRequest({ orderId: cashOrder._id, actor: admin, payload: { amount: 999999, items: [{ index: 0, quantity: 1 }], restock: true, method: "cash", reason: "Returned item", idempotencyKey: "partial-item" } });
      assert.equal(partial.refund.amountHalala, 2200);
      await transitionRefund({ refundId: partial.refund._id, action: "approve", payload: {}, actor: admin });
      const completed = await transitionRefund({ refundId: partial.refund._id, action: "complete", payload: {}, actor: admin });
      assert.equal(completed.order.paymentStatus, "partially_refunded");
      assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, beforeStock + 1.5);
      assert.equal((await summarizePosShift(shift)).totals.expectedCash, 78);
      assert.equal((await Order.findById(cashOrder._id)).rewardRefundPointsReversed, Math.floor(cashOrder.pointsEarned / 2));
      assert.equal((await transitionRefund({ refundId: partial.refund._id, action: "complete", payload: {}, actor: admin })).duplicate, true);
      assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, beforeStock + 1.5);
    });
    let rollbackOrder;
    await t.test("restoration failure rolls back financial state, cash, stock and refund status", async () => {
      const created = await sale(cashier); rollbackOrder = created.body.data._id;
      const requested = await createRefundRequest({ orderId: rollbackOrder, actor: admin, payload: { items: [{ index: 0, quantity: 1 }], restock: true, method: "cash", reason: "Returned item", idempotencyKey: "rollback-item" } });
      await transitionRefund({ refundId: requested.refund._id, action: "approve", payload: {}, actor: admin });
      const before = await summarizePosShift(shift);
      const stock = (await InventoryItem.findById(ingredient._id)).currentStock;
      await InventoryItem.updateOne({ _id: ingredient._id }, { $set: { isActive: false } });
      await assert.rejects(transitionRefund({ refundId: requested.refund._id, action: "complete", payload: {}, actor: admin }), /inactive/);
      assert.equal((await Refund.findById(requested.refund._id)).status, "approved");
      assert.equal((await Order.findById(rollbackOrder)).refundedAmountHalala, 0);
      assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, stock);
      assert.equal((await summarizePosShift(shift)).totals.expectedCash, before.totals.expectedCash);
      assert.equal(await CashMovement.countDocuments({ refund: requested.refund._id }), 0);
      await InventoryItem.updateOne({ _id: ingredient._id }, { $set: { isActive: true } });
      await transitionRefund({ refundId: requested.refund._id, action: "cancel", payload: {}, actor: admin });
      await assert.rejects(createRefundRequest({ orderId: rollbackOrder, actor: admin, payload: { amount: 1, method: "bogus", reason: "Bad method", idempotencyKey: "bad-method" } }), /refund method/);
      assert.equal((await Order.findById(rollbackOrder)).refundReservedHalala, 0);
    });
    await t.test("over-refund, unauthorized refund and concurrent item reservation rejection", async () => {
      await assert.rejects(createRefundRequest({ orderId: cashOrder._id, actor: cashier, payload: { amount: 1, reason: "Denied", idempotencyKey: "denied" } }), /Not authorized/);
      await assert.rejects(createRefundRequest({ orderId: cashOrder._id, actor: admin, payload: { amount: 23, reason: "Over refund", idempotencyKey: "over" } }), /remaining refundable/);
      const attempts = await Promise.allSettled([1, 2].map(index => createRefundRequest({ orderId: cashOrder._id, actor: admin, payload: { items: [{ index: 0, quantity: 1 }], method: "card", reason: "Last item", idempotencyKey: `remaining-${index}` } })));
      assert.equal(attempts.filter(row => row.status === "fulfilled").length, 1);
      const last = attempts.find(row => row.status === "fulfilled").value.refund;
      await transitionRefund({ refundId: last._id, action: "approve", actor: admin, payload: {} });
      const stockBefore = (await InventoryItem.findById(ingredient._id)).currentStock;
      await Promise.allSettled([1, 2].map(() => transitionRefund({ refundId: last._id, action: "complete", actor: admin, payload: { externalReference: "MANUAL-CARD" } })));
      assert.equal((await Order.findById(cashOrder._id)).refundedAmountHalala, 4400);
      assert.equal((await Order.findById(cashOrder._id)).paymentStatus, "refunded");
      assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, stockBefore, "prepared food is not automatically restocked");
    });
    await t.test("void authorization, concurrency, cash/inventory/reward reversal and original receipt status", async () => {
      const result = await sale(cashier, { customerId: customer._id }); const id = result.body.data._id;
      const before = (await InventoryItem.findById(ingredient._id)).currentStock;
      await assert.rejects(voidPosSale({ orderId: id, actor: cashier, payload: { reason: "Denied", idempotencyKey: "denied-void" } }), /Not authorized/);
      const results = await Promise.allSettled([1, 2].map(() => voidPosSale({ orderId: id, actor: admin, payload: { reason: "Wrong sale", restock: true, idempotencyKey: "void-once" } })));
      assert.ok(results.some(row => row.status === "fulfilled"));
      const voided = await Order.findById(id); assert.equal(voided.paymentStatus, "voided"); assert.equal(voided.status, "cancelled");
      assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, before + 3);
      assert.equal(await CashMovement.countDocuments({ order: id, type: "cash_void" }), 1);
      assert.equal(voided.rewardRefundPointsReversed, voided.pointsEarned);
      assert.equal((await voidPosSale({ orderId: id, actor: admin, payload: { reason: "Wrong sale", restock: true, idempotencyKey: "void-once" } })).duplicate, true);
      await assert.rejects(voidPosSale({ orderId: cashOrder._id, actor: admin, payload: { reason: "Refunded", idempotencyKey: "refunded-void" } }), /refunded/);
      const old = await sale(cashier, { paymentMethod: "card" });
      // createdAt is schema-immutable; age only this isolated test fixture.
      await Order.collection.updateOne({ _id: new mongoose.Types.ObjectId(old.body.data._id) }, { $set: { createdAt: new Date(Date.now() - 24 * 3600000) } });
      await assert.rejects(voidPosSale({ orderId: old.body.data._id, actor: admin, payload: { reason: "Too late", idempotencyKey: "old-void" } }), /window has ended/);
    });
    await t.test("shift variance approval, idempotent close, historical reopen snapshot and audit", async () => {
      const expected = (await summarizePosShift(shift)).totals.expectedCash;
      await assert.rejects(closePosShift({ shiftId: shift._id, countedCash: expected + 5, actor: cashier, settings: { varianceThreshold: 1 }, idempotencyKey: "close-bad" }), /Explain/);
      await assert.rejects(closePosShift({ shiftId: shift._id, countedCash: expected + 5, note: "Count difference", actor: cashier, settings: { varianceThreshold: 1 }, idempotencyKey: "close-bad" }), /approval/);
      const closed = await closePosShift({ shiftId: shift._id, countedCash: expected + 5, note: "Count difference", actor: cashier, managerId: admin._id, managerPin: "654321", settings: { varianceThreshold: 1 }, idempotencyKey: "close-good" });
      assert.equal(closed.shift.differenceHalala, 500); assert.equal(String(closed.shift.managerApprovedBy), String(admin._id));
      assert.equal((await closePosShift({ shiftId: shift._id, countedCash: expected + 5, actor: cashier, settings: {}, idempotencyKey: "close-good" })).duplicate, true);
      await reopenPosShift({ shiftId: shift._id, actor: admin, reason: "Recount drawer" });
      assert.equal((await PosShift.findById(shift._id)).closeHistory.length, 1);
      assert.ok(await AuditLog.exists({ action: "POS_SHIFT_REOPENED", entityId: shift._id }));
      await closePosShift({ shiftId: shift._id, countedCash: expected, actor: cashier, settings: { varianceThreshold: 1 }, idempotencyKey: "second-close" });
      assert.equal((await PosShift.findById(shift._id)).closeHistory.length, 2);
      await assert.rejects(reopenPosShift({ shiftId: shift._id, actor: cashier, reason: "Not allowed" }), /Not authorized/);
    });
    await t.test("later cash refund uses the active drawer without rewriting the closed original shift", async () => {
      const request = await createRefundRequest({ orderId: rollbackOrder, actor: admin, payload: { amount: 1, method: "cash", reason: "Later return", idempotencyKey: "later-cash" } });
      await transitionRefund({ refundId: request.refund._id, action: "approve", payload: {}, actor: admin });
      await assert.rejects(transitionRefund({ refundId: request.refund._id, action: "complete", payload: {}, actor: admin }), /Open a POS shift/);
      assert.equal((await Refund.findById(request.refund._id)).status, "approved");
      const original = (await summarizePosShift(await PosShift.findById(shift._id))).totals.expectedCash;
      const drawer = await openPosShift({ actor: admin, terminal: otherTerminal.code, openingCash: 10 });
      await transitionRefund({ refundId: request.refund._id, action: "complete", payload: {}, actor: admin });
      assert.equal((await summarizePosShift(drawer)).totals.expectedCash, 9);
      assert.equal((await summarizePosShift(await PosShift.findById(shift._id))).totals.expectedCash, original);
      assert.equal(String((await Refund.findById(request.refund._id)).posShift), String(drawer._id));
      await closePosShift({ shiftId: drawer._id, countedCash: 9, actor: admin, settings: { varianceThreshold: 1 }, idempotencyKey: "later-close" });
    });
    await t.test("history own-sales permissions, filters, pagination, PII minimization and reprint audit", async () => {
      const own = await api(cashier, "/sales?limit=1&page=1"); assert.equal(own.body.data.length, 1); assert.ok(own.body.pagination.total > 1);
      assert.equal(String(own.body.data[0].createdBy._id), String(cashier._id)); assert.equal(own.body.data[0].customer.phone, undefined);
      const filtered = await api(admin, `/sales?paymentStatus=voided&terminal=${terminal.code}`); assert.equal(filtered.body.data.length, 1);
      assert.equal((await api(second, `/sales/${cashOrder._id}`)).status, 404);
      const reprint = await api(cashier, `/sales/${cashOrder._id}/reprint`, {}); assert.equal(reprint.body.data.isReprint, true); assert.equal(reprint.body.data.paymentStatus, "refunded");
      assert.ok(await AuditLog.exists({ action: "POS_RECEIPT_REPRINTED", entityId: cashOrder._id }));
    });
    await t.test("late reward award observes refunded state and cannot double-credit", async () => {
      const before = Number((await User.findById(customer._id)).pointsBalance || 0);
      const delayed = await Order.create({ orderNumber: "LATE-REWARD", source: "pos", createdBy: cashier._id, user: customer._id, customer: { name: "Test", phone: "N/A" }, items: [{ menuItem: menu._id, name: menu.name, price: 20, quantity: 1 }], subtotal: 20, originalSubtotal: 20, totalAmount: 20, paymentMethod: "card", paymentStatus: "partially_refunded", refundedAmount: 10, refundedAmountHalala: 1000 });
      await creditPosSaleRewards(delayed._id);
      await creditPosSaleRewards(delayed._id);
      const updated = await Order.findById(delayed._id);
      const points = calculateOrderPoints(20);
      assert.equal(updated.pointsEarned, points);
      assert.equal(updated.rewardRefundPointsReversed, Math.floor(points / 2));
      assert.equal((await User.findById(customer._id)).pointsBalance, before + points - Math.floor(points / 2));
    });
    await t.test("quick-menu management, unavailable repeat rejection and current-price repeat revalidation", async () => {
      const response = await fetch(origin + "/quick-menu", { method: "PUT", headers: { Authorization: `Bearer ${bearer(admin)}`, "Content-Type": "application/json" }, body: JSON.stringify({ productId: menu._id, productType: "menuItem", position: 1 }) }); assert.equal(response.status, 200);
      assert.equal((await api(cashier, "/quick-menu")).body.data.favourites.length, 1);
      const alternate = await MenuItem.create({ name: "Second favourite", description: "Test", image: "/test.jpg", category: "Food", price: 5 });
      const writeFavourite = (productId, position) => fetch(origin + "/quick-menu", { method: "PUT", headers: { Authorization: `Bearer ${bearer(admin)}`, "Content-Type": "application/json" }, body: JSON.stringify({ productId, productType: "menuItem", position }) });
      assert.equal((await writeFavourite(alternate._id, 1)).status, 200);
      assert.equal((await writeFavourite(alternate._id, 0)).status, 200);
      const favourites = (await api(cashier, "/quick-menu")).body.data.favourites;
      assert.equal(String(favourites[0].productId), String(alternate._id));
      assert.deepEqual(favourites.map(row => row.position), [0, 1]);
      await MenuItem.updateOne({ _id: menu._id }, { $set: { price: 25 } });
      const repeat = await api(cashier, `/sales/${cashOrder._id}/repeat`, {}); assert.equal(repeat.body.data[0].price, 27); assert.equal(repeat.body.data[0].discount, undefined);
      await MenuItem.updateOne({ _id: menu._id }, { $set: { isAvailable: false } });
      const unavailable = await api(cashier, `/sales/${cashOrder._id}/repeat`, {}); assert.equal(unavailable.body.data.length, 0); assert.equal(unavailable.body.warnings.length, 1);
    });
    assert.ok(await Refund.countDocuments());
  } finally {
    if (httpServer) await new Promise(resolve => httpServer.close(resolve));
    await mongoose.disconnect(); await client?.close();
    mongo.kill(); await Promise.race([new Promise(resolve => mongo.once("exit", resolve)), delay(3000)]);
    // The only removed directory is the exact temporary directory created above.
    if (path.dirname(directory) === path.resolve(tmpdir()) && path.basename(directory).startsWith("dg-pos-phase2-test-")) await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
});
