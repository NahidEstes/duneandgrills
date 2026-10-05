import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import { RECORD_SEARCH_TYPES, getRecordDetails, searchRecords } from "../services/recordSearchService.js";
import { RECORD_NUMBERS, formatRecordNumber, rejectClientRecordNumbers, reserveRecordNumber } from "../services/recordNumberService.js";
import { backfillRecordNumbers } from "../services/recordNumberBackfillService.js";
import Counter from "../models/Counter.js";
import User from "../models/User.js";
import recordRoutes from "../routes/recordSearchRoutes.js";
import authRoutes from "../routes/authRoutes.js";
import { recordAuditLog } from "../services/auditLogService.js";
import AuditLog from "../models/AuditLog.js";
import { addCashMovement } from "../services/posShiftService.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "isolated-record-id-test-secret-long-enough";
const id = () => new mongoose.Types.ObjectId();
const creation = () => ({ createdAt: new Date(), updatedAt: new Date() });

test("automatic record IDs, migration and permission-aware search", { timeout: 180000 }, async t => withIsolatedMongo(async () => {
  const user = (name, role, extra = {}) => User.create({ name, role, email: `${name}@record.test`, password: "TestPassword123!", ...extra });
  const admin = await user("Admin", "admin"); const cashier = await user("Cashier", "cashier"); const accountant = await user("Accountant", "accountant"); const inventory = await user("Inventory", "inventory"); const customer = await user("Customer", "customer");
  const fixture = {
    Refund: { order: id(), amountHalala: 100, type: "partial", reason: "Test refund", method: "cash", requestedBy: cashier._id, idempotencyKey: "test-refund" },
    SupplierPayment: { invoice: id(), supplier: id(), amountHalala: 100, method: "cash", paymentDate: new Date(), idempotencyKey: "test-payment", createdBy: admin._id },
    PosShift: { cashier: cashier._id, openingCashHalala: 0, openedBy: cashier._id, terminal: "TEST" },
    CashMovement: { shift: id(), type: "payout", amountHalala: 100, direction: "out", reason: "Test payout", createdBy: cashier._id },
    StockTransaction: { item: id(), movementType: "WASTE", quantity: 1, stockBefore: 2, stockAfter: 1, reason: "Test waste", user: admin._id },
    PosHeldSale: { cashier: cashier._id, terminal: "TEST", expiresAt: new Date(Date.now() + 60000), label: "Test hold" },
  };
  const created = {};
  await t.test("all creation models assign IDs; customer role only and historical employee IDs preserved", async () => {
    for (const [type, payload] of Object.entries(fixture)) {
      const Model = mongoose.model(type); created[type] = await Model.create(payload);
      assert.match(created[type][RECORD_NUMBERS[type].field], new RegExp(`^${RECORD_NUMBERS[type].prefix}-\\d{4}-\\d{6}$`));
    }
    assert.match(customer.customerNumber, /^CUS-\d{6}$/); assert.equal(admin.customerNumber, undefined);
    assert.match(cashier.employeeId, /^EMP-\d{6}$/);
    const legacy = await user("Legacy", "kitchen", { employeeId: "KITCHEN-CUSTOM-42" }); assert.equal(legacy.employeeId, "KITCHEN-CUSTOM-42");
  });
  await t.test("concurrent creates and insertMany get unique sequential IDs", async () => {
    const rows = await Promise.all(Array.from({ length: 20 }, () => mongoose.model("CashMovement").create(fixture.CashMovement)));
    assert.equal(new Set(rows.map(row => row.movementNumber)).size, 20);
    const seq = rows.map(row => Number(row.movementNumber.slice(-6))).sort((a, b) => a - b);
    assert.equal(seq.at(-1) - seq[0], 19);
    const bulk = await mongoose.model("CashMovement").insertMany([fixture.CashMovement, fixture.CashMovement]); assert.notEqual(bulk[0].movementNumber, bulk[1].movementNumber);
  });
  await t.test("Riyadh creation year boundary, annual reset and non-year customer/staff counters", async () => {
    const last = await reserveRecordNumber("Refund", { date: "2030-12-31T20:59:59.999Z" });
    const next = await reserveRecordNumber("Refund", { date: "2030-12-31T21:00:00.000Z" });
    assert.equal(last, "RFN-2030-000001"); assert.equal(next, "RFN-2031-000001");
    for (const type of ["Customer", "Staff"]) {
      const a = await reserveRecordNumber(type, { date: "2030-01-01" }); const b = await reserveRecordNumber(type, { date: "2035-01-01" }); assert.equal(Number(b.slice(-6)), Number(a.slice(-6)) + 1);
    }
    assert.throws(() => formatRecordNumber("RFN-2031-", 1000000), /capacity/);
    await Counter.create({ _id: "record-number:RFN-2099-", seq: 999999 }); await assert.rejects(reserveRecordNumber("Refund", { date: "2099-01-01" }), /capacity/);
  });
  await t.test("immutable updates, client override rejection, deleted/reversed IDs not reused", async () => {
    for (const [type, row] of Object.entries(created)) await assert.rejects(row.constructor.updateOne({ _id: row._id }, { $set: { [RECORD_NUMBERS[type].field]: "OVERRIDE" } }), /immutable/);
    await assert.rejects(User.updateOne({ _id: cashier._id }, { employeeId: "OVERRIDE" }), /immutable/);
    for (const field of Object.values(RECORD_NUMBERS).map(row => row.field)) { let error; rejectClientRecordNumbers({ method: "POST", body: { items: [{ [field]: "OVERRIDE" }] } }, {}, value => { error = value; }); assert.equal(error.status, 400); }
    const row = await mongoose.model("CashMovement").create(fixture.CashMovement); const number = row.movementNumber; await row.deleteOne(); const next = await mongoose.model("CashMovement").create(fixture.CashMovement); assert.ok(next.movementNumber > number);
    const payment = created.SupplierPayment; payment.status = "reversed"; await payment.save(); assert.equal(payment.paymentNumber, created.SupplierPayment.paymentNumber);
    const retry = await payment.constructor.findOne({ idempotencyKey: "test-payment" }); assert.equal(retry.paymentNumber, payment.paymentNumber);
  });
  await t.test("backfill dry-run, chronological order, preservation, restart/idempotency and counter bootstrap", async () => {
    const Model = mongoose.model("CashMovement");
    const first = { _id: id(), ...fixture.CashMovement, createdAt: new Date("2020-01-01"), untouched: "keep" }; const second = { _id: id(), ...fixture.CashMovement, createdAt: new Date("2020-02-01") };
    await Model.collection.insertMany([second, first, { ...fixture.CashMovement, ...creation(), movementNumber: "CSH-2020-000050" }]);
    const beforeCounters = await Counter.find().lean(); const dry = await backfillRecordNumbers(); assert.equal(dry.assigned, 0); assert.equal(dry.missing, 2); assert.deepEqual(await Counter.find().lean(), beforeCounters);
    assert.equal((await Model.collection.findOne({ _id: first._id })).movementNumber, undefined);
    const applied = await backfillRecordNumbers({ apply: true }); assert.equal(applied.assigned, 2); const old = await Model.collection.findOne({ _id: first._id }); assert.equal(old.movementNumber, "CSH-2020-000051"); assert.equal(old.untouched, "keep"); assert.equal(old.createdAt.toISOString(), first.createdAt.toISOString());
    assert.equal((await Model.collection.findOne({ _id: second._id })).movementNumber, "CSH-2020-000052"); assert.equal((await backfillRecordNumbers({ apply: true })).assigned, 0);
  });
  await t.test("real cash-service retry keeps ID; aborted transactions do not reuse reserved IDs", async () => {
    const payload = { shiftId: created.PosShift._id, type: "cash_in", amount: 5, reason: "Test cash", idempotencyKey: "record-id-retry", actor: cashier };
    const first = await addCashMovement(payload); const retry = await addCashMovement(payload);
    assert.equal(String(first._id), String(retry._id)); assert.equal(first.movementNumber, retry.movementNumber);
    const session = await mongoose.startSession(); let aborted;
    try {
      session.startTransaction();
      [aborted] = await mongoose.model("CashMovement").create([fixture.CashMovement], { session });
      await session.abortTransaction();
    } finally { await session.endSession(); }
    assert.equal(await mongoose.model("CashMovement").findById(aborted._id), null);
    const next = await mongoose.model("CashMovement").create(fixture.CashMovement);
    assert.ok(next.movementNumber > aborted.movementNumber);
  });
  await t.test("collision preflight blocks writes", async () => {
    const Model = mongoose.model("Refund"); await Model.collection.dropIndex("refundNumber_1");
    await Model.collection.insertOne({ ...fixture.Refund, idempotencyKey: "collision", refundNumber: created.Refund.refundNumber, ...creation() });
    const report = await backfillRecordNumbers({ apply: true }); assert.equal(report.blocked, true); assert.equal(report.assigned, 0); assert.equal(report.collisions[0].type, "Refund");
    await Model.collection.deleteOne({ idempotencyKey: "collision" }); await Model.init();
  });
  await t.test("existing custom/external IDs, exact-first and duplicate lot context are searchable", async () => {
    const Order = RECORD_SEARCH_TYPES.order.model; await Order.collection.insertMany([{ orderNumber: "OLD-CUSTOM-77", externalOrderId: "jhs-MixedCase", status: "delivered", ...creation() }, { orderNumber: "OLD-CUSTOM-77-extra", status: "delivered", ...creation() }]);
    const found = await searchRecords(admin, { q: "old-custom-77" }); assert.equal(found.data[0].readableId, "OLD-CUSTOM-77"); assert.equal((await searchRecords(admin, { q: "JHS-MIXEDCASE" })).data[0].readableId, "jhs-MixedCase");
    const Supplier = RECORD_SEARCH_TYPES.supplier.model; const Item = RECORD_SEARCH_TYPES.inventory.model; const supplier = await Supplier.collection.insertOne({ code: "VENDOR-X", name: "Vendor", ...creation() }); const item = await Item.collection.insertOne({ sku: "CUSTOM-MILK", name: "Milk", ...creation() });
    await RECORD_SEARCH_TYPES.batch.model.collection.insertMany([1, 2].map(n => ({ lotNumber: "LOT-DUP", item: item.insertedId, supplier: supplier.insertedId, brand: `Brand${n}`, ...creation() })));
    const lots = await searchRecords(inventory, { q: "lot-dup" }); assert.equal(lots.data.length, 2); assert.ok(lots.data.every(row => row.context.includes("Milk") && row.context.includes("Vendor")));
    for (const actor of [admin, cashier, accountant, inventory]) { const results = await searchRecords(actor, { q: "00" }); assert.ok(results.data.every(row => !JSON.stringify(row).match(/password|pinHash|email|phone|address|token|pointsBalance/))); }
    await assert.rejects(searchRecords(customer, { q: "00" }), error => error.status === 403);
    await assert.rejects(getRecordDetails(cashier, "payment", created.SupplierPayment._id), error => error.status === 404);
    const other = await user("Other", "cashier"); await assert.rejects(getRecordDetails(other, "held", created.PosHeldSale._id), error => error.status === 404);
    const bounded = await searchRecords(admin, { q: "CSH-", page: 20, limit: 1 });
    assert.ok(bounded.data.length <= 1); assert.equal(bounded.pagination.hasMore, false);
  });
  await t.test("API auth, permission denial, override rejection, escaped search and audit labels", async () => {
    const app = express(); app.use(express.json()); app.use("/records", recordRoutes); app.use("/auth", authRoutes); app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
    const server = await new Promise(resolve => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
    try {
      const origin = `http://127.0.0.1:${server.address().port}`; const token = actor => jwt.sign({ id: String(actor._id), sv: 0 }, process.env.JWT_SECRET);
      assert.equal((await fetch(`${origin}/records?q=00`)).status, 401);
      assert.equal((await fetch(`${origin}/records?q=00`, { headers: { Authorization: `Bearer ${token(customer)}` } })).status, 403);
      assert.equal((await fetch(`${origin}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerNumber: "CUS-000500" }) })).status, 400);
      const escaped = await searchRecords(admin, { q: ".*" }); assert.equal(escaped.data.length, 0);
      await recordAuditLog({ actor: admin, action: "TEST", entityType: "Refund", entityId: created.Refund._id, entityLabel: "Order" });
      const log = await AuditLog.findOne({ action: "TEST" }).lean(); assert.ok(log.entityLabel.startsWith(created.Refund.refundNumber));
      let limited = false;
      for (let request = 0; request < 61; request += 1) {
        const response = await fetch(`${origin}/records/unknown/unused`, { headers: { Authorization: `Bearer ${token(admin)}` } });
        if (response.status === 429) { limited = true; break; }
        assert.equal(response.status, 404);
      }
      assert.equal(limited, true);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
}));
