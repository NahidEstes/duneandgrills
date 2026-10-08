import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import SupplierPayment from "../models/SupplierPayment.js";
import Supplier from "../models/Supplier.js";
import PosShift from "../models/PosShift.js";
import CashMovement from "../models/CashMovement.js";
import RestaurantSettings from "../models/RestaurantSettings.js";
import PurchasingAction from "../models/PurchasingAction.js";
import AuditLog from "../models/AuditLog.js";
import Counter from "../models/Counter.js";
import adminRoutes from "../routes/adminRoutes.js";
import orderRoutes from "../routes/orderRoutes.js";
import posRoutes from "../routes/posRoutes.js";
import { listSupplierInvoices } from "../controllers/inventory/supplierInvoiceController.js";
import { CAPABILITIES } from "../config/permissions.js";
import { getAdminOperations, readOperationalCategory } from "../services/adminOperationsService.js";
import { calculateExpectedCashHalala, expectedCashForShifts } from "../services/posShiftService.js";
import { getRestaurantSettingsDefaults, normalizeRestaurantSettings } from "../services/restaurantSettingsService.js";
import { orderAttentionFilter } from "../services/operationalAttentionService.js";
import { invoiceIsOverdue, overdueInvoiceFilter } from "../services/supplierInvoiceHealth.js";
import { decorateInvoice, reverseSupplierPayment } from "../services/supplierInvoiceService.js";
import { parseRiyadhDate, toRiyadhDateKey } from "../utils/adminDate.js";

// Own disposable loopback replica set only; no dotenv, external URI or reset.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "isolated-admin-operations-test-secret";

test("pending attention setting is configurable, validated and backward compatible", () => {
  const defaults = getRestaurantSettingsDefaults();
  assert.equal(defaults.preparation.pendingAttentionMinutes, 5);
  assert.equal(normalizeRestaurantSettings({ preparation: { pendingAttentionMinutes: "12" } }, defaults).preparation.pendingAttentionMinutes, 12);
  assert.equal(normalizeRestaurantSettings({ preparation: { defaultMinutes: "25" } }, defaults).preparation.pendingAttentionMinutes, 5);
  for (const value of [0, -1, 241, 2.5, "invalid"]) assert.throws(() => normalizeRestaurantSettings({ preparation: { pendingAttentionMinutes: value } }, defaults));
});

test("Operations overview (isolated fixtures, read-only, permission-scoped)", { timeout: 180000 }, async t => {
  await withIsolatedMongo(async () => {
    const users = {};
    for (const role of ["admin", "manager", "cashier", "accountant", "inventory", "kitchen", "customer"]) users[role] = await User.create({ name: `Operations ${role}`, email: `operations-${role}@test.local`, password: "TestPassword123!", role });
    const now = new Date(), older = new Date(now.getTime() - 3600000), settings = getRestaurantSettingsDefaults();
    const make = async (model, document) => { const value = { _id: new mongoose.Types.ObjectId(), ...document }; await model.collection.insertOne(value); return value; };
    let number = 0;
    const order = options => make(Order, { orderNumber: `OPS-${++number}`, createdAt: older, updatedAt: older, status: "pending", manualEntry: false, source: "website", paymentStatus: "unpaid", totalAmount: 100, customer: { name: "PRIVATE", phone: "PRIVATE" }, items: [], ...options });
    const pending = await order({});
    const both = await order({ preparationDueAt: older });
    const boundary = await order({ createdAt: new Date(now.getTime() - 5 * 60000), preparationDueAt: now });
    await order({ createdAt: new Date(now.getTime() - 5 * 60000 + 1) });
    await order({ status: "preparing", preparationDueAt: new Date(now.getTime() - 1) });
    await order({ status: "ready", preparationDueAt: older });
    for (const status of ["delivered", "cancelled", "refunded", "failed"]) await order({ status, preparationDueAt: older });
    await order({ manualEntry: true, source: "jahez", orderOccurredAt: new Date("2024-01-01"), preparationDueAt: older });
    await order({ paymentStatus: "voided", preparationDueAt: older });
    await order({ voidedAt: older, preparationDueAt: older });
    const po = await make(PurchaseOrder, { orderNumber: "PO-OPS-001", status: "submitted", createdAt: older, submittedAt: older });
    for (const status of ["approved", "rejected", "received", "cancelled"]) await make(PurchaseOrder, { orderNumber: `PO-OPS-${status}`, status, createdAt: older });
    const supplier = await Supplier.create({ name: "Dummy supplier", code: "OPS-DUMMY" });
    let invoiceIndex = 0;
    const yesterday = new Date(parseRiyadhDate(toRiyadhDateKey(now)).getTime() - 86400000);
    const invoice = options => SupplierInvoice.create({ supplier: supplier._id, supplierInvoiceNumber: `DUMMY-${++invoiceIndex}`, normalizedInvoiceNumber: `DUMMY-${invoiceIndex}`, internalReference: `INV-OPS-${invoiceIndex}`, invoiceDate: now, dueDate: yesterday, items: [{ item: new mongoose.Types.ObjectId(), purchaseOrder: po._id, purchaseOrderLine: new mongoose.Types.ObjectId(), quantity: 1, unit: "pcs", unitPrice: 100, lineTotal: 100 }], createdBy: users.admin._id, updatedBy: users.admin._id, subtotal: 100, total: 100, status: "posted", ...options });
    const partial = await invoice({ paidAmountHalala: 4000, paymentStatus: "partially_paid" });
    const full = await invoice({ paidAmountHalala: 10000, paymentStatus: "paid" });
    await invoice({ dueDate: parseRiyadhDate(toRiyadhDateKey(now)) });
    await invoice({ dueDate: null });
    const review = await invoice({ status: "review_required" });
    for (const status of ["draft", "approved", "voided", "disputed"]) await invoice({ status });

    await t.test("strict pending/preparation boundaries, terminal/historical/void exclusions and category deduplication", async () => {
      const data = await getAdminOperations({ role: "admin", now });
      assert.equal(data.categories.pending_age.total, 2);
      assert.equal(data.categories.preparation_overdue.total, 2);
      assert.equal(data.categories.purchase_approval.total, 1);
      assert.equal(data.categories.invoice_review.total, 1);
      assert.equal(data.categories.invoice_overdue.total, 1);
      assert.equal(data.categories.invoice_overdue.items[0].outstandingAmount, 60);
      for (const key of ["pending_age", "preparation_overdue"]) {
        const ids = data.categories[key].items.map(row => String(row._id)); assert.equal(new Set(ids).size, ids.length); assert.ok(ids.includes(String(both._id)));
        assert.ok(!ids.includes(String(boundary._id)));
      }
      assert.deepEqual(data.categories.pending_age.items.map(row => String(row._id)), [pending, both].map(row => String(row._id)).sort());
      assert.equal(JSON.stringify(data).includes("PRIVATE"), false);
      assert.deepEqual(data.shifts, { status: "success", enabled: false });
    });

    await t.test("due date ends at Riyadh midnight, with partial/full payment and real reversal", async () => {
      const date = new Date("2028-12-31T00:00:00Z");
      const fixture = { status: "posted", total: 100, paidAmountHalala: 9900, dueDate: date };
      assert.equal(invoiceIsOverdue(fixture, new Date("2028-12-31T20:59:59.999Z")), false);
      assert.equal(invoiceIsOverdue(fixture, new Date("2028-12-31T21:00:00Z")), true);
      const boundaryInvoice = await invoice({ dueDate: date });
      assert.equal(await SupplierInvoice.countDocuments({ $and: [{ _id: boundaryInvoice._id }, overdueInvoiceFilter(new Date("2028-12-31T20:59:59.999Z"))] }), 0);
      assert.equal(await SupplierInvoice.countDocuments({ $and: [{ _id: boundaryInvoice._id }, overdueInvoiceFilter(new Date("2028-12-31T21:00:00Z"))] }), 1);
      assert.equal(decorateInvoice(fixture, new Date("2028-12-31T21:00:00Z")).outstandingAmount, 1);
      assert.equal(invoiceIsOverdue({ ...fixture, paidAmountHalala: 10000 }, new Date("2029-01-01")), false);
      const payment = await SupplierPayment.create({ invoice: full._id, supplier: supplier._id, amountHalala: 10000, method: "cash", paymentDate: now, idempotencyKey: "ops-reversal", createdBy: users.admin._id });
      await reverseSupplierPayment({ paymentId: payment._id, actor: users.admin, reason: "Isolated rehearsal reversal" });
      const data = await getAdminOperations({ role: "admin", now });
      assert.equal(data.categories.invoice_overdue.total, 2);
      assert.equal(data.categories.invoice_overdue.items.find(row => String(row._id) === String(full._id)).outstandingAmount, 100);
      const count = await SupplierInvoice.countDocuments(overdueInvoiceFilter(now)); assert.equal(count, 2);
    });

    await t.test("resolved approval and review immediately disappear without generating actions", async () => {
      await PurchaseOrder.collection.updateOne({ _id: po._id }, { $set: { status: "approved" } });
      await SupplierInvoice.updateOne({ _id: review._id }, { $set: { status: "approved" } });
      const data = await getAdminOperations({ role: "manager", now });
      assert.equal(data.categories.purchase_approval.total, 0); assert.equal(data.categories.invoice_review.total, 0);
      assert.equal(await PurchasingAction.countDocuments(), 0);
    });

    await RestaurantSettings.create({ key: "default", posShifts: { enabled: true, blindClose: true, varianceThreshold: 50 } });
    const open = await make(PosShift, { shiftNumber: "SHIFT-OPS-OPEN", cashier: users.cashier._id, terminal: "MAIN", openingCashHalala: 10000, isOpen: true, status: "open", openedAt: older });
    const movements = [{ type: "opening_cash", amountHalala: 10000, direction: "in" }, { type: "cash_sale", amountHalala: 3000, direction: "in" }, { type: "cash_refund", amountHalala: 1000, direction: "out" }, { type: "cash_in", amountHalala: 500, direction: "in" }, { type: "payout", amountHalala: 200, direction: "out" }];
    for (const movement of movements) await make(CashMovement, { shift: open._id, ...movement, reason: "Isolated fixture", createdAt: now, createdBy: users.admin._id });
    await order({ status: "delivered", paymentMethod: "card", paymentStatus: "paid", posShift: open._id, totalAmount: 9999 });
    await order({ status: "delivered", source: "jahez", deliveryPaymentType: "aggregator_prepaid", posShift: open._id, totalAmount: 9999 });
    const closed = await make(PosShift, { shiftNumber: "SHIFT-OPS-CLOSED", cashier: users.cashier._id, terminal: "MAIN", isOpen: false, status: "closed", openedAt: older, closedAt: now, openingCashHalala: 10000, expectedCashHalala: 10000, countedCashHalala: 16000, differenceHalala: 6000 });
    const approved = await make(PosShift, { ...closed, _id: new mongoose.Types.ObjectId(), shiftNumber: "SHIFT-OPS-APPROVED", managerApprovedBy: users.manager._id });
    await make(PosShift, { ...closed, _id: new mongoose.Types.ObjectId(), shiftNumber: "SHIFT-OPS-LEGACY", expectedCashHalala: null, countedCashHalala: null, differenceHalala: null });

    await t.test("ledger parity includes opening and manual movements, excludes card/prepaid and preserves recorded close snapshots", async () => {
      const data = await getAdminOperations({ role: "manager", now });
      assert.equal(data.shifts.openCount, 1); assert.equal(data.shifts.closedCount, 3);
      assert.equal(data.shifts.open[0].expectedCash, calculateExpectedCashHalala(movements) / 100);
      assert.equal(data.shifts.open[0].expectedCash, 123);
      assert.equal(data.shifts.open[0].countedCash, undefined);
      assert.equal(data.shifts.closed.find(row => String(row._id) === String(closed._id)).varianceStatus, "review_required");
      assert.equal(data.shifts.closed.find(row => String(row._id) === String(approved._id)).varianceStatus, "approved");
      const legacy = data.shifts.closed.find(row => row.shiftNumber === "SHIFT-OPS-LEGACY");
      assert.equal(legacy.expectedCash, null); assert.equal(legacy.varianceStatus, "unavailable");
      assert.equal(JSON.stringify(data.shifts).includes("password"), false);
      assert.equal((await expectedCashForShifts([{ _id: new mongoose.Types.ObjectId() }])).values().next().value, null);
    });

    await t.test("reopened shifts remain open and never reuse a previous closed-count snapshot", async () => {
      await PosShift.collection.updateOne({ _id: approved._id }, { $set: { status: "reopened", isOpen: true, terminal: "REOPENED" } });
      try {
        const data = await getAdminOperations({ role: "admin", now });
        assert.equal(data.shifts.openCount, 2); assert.equal(data.shifts.closedCount, 2);
        const reopened = data.shifts.open.find(row => String(row._id) === String(approved._id));
        assert.equal(reopened.countedCash, undefined); assert.equal(reopened.difference, undefined); assert.equal(reopened.expectedCash, null);
      } finally { await PosShift.collection.updateOne({ _id: approved._id }, { $set: { status: "closed", isOpen: false, terminal: "MAIN" } }); }
    });

    await t.test("failed source is unavailable, not empty; other categories recover independently", async () => {
      const original = PurchaseOrder.aggregate;
      try { PurchaseOrder.aggregate = () => { throw new Error("Isolated source failure"); };
        const data = await getAdminOperations({ role: "admin", now });
        assert.equal(data.categories.purchase_approval.status, "unavailable"); assert.equal(data.categories.purchase_approval.total, undefined);
        assert.equal(data.categories.pending_age.status, "success"); assert.equal(data.shifts.status, "success");
      } finally { PurchaseOrder.aggregate = original; }
      assert.equal((await getAdminOperations({ role: "admin", now })).categories.purchase_approval.status, "success");
    });

    const app = express(); app.use("/api/admin", adminRoutes); app.use("/api/orders", orderRoutes); app.use("/api/pos", posRoutes);
    app.get("/invoices", listSupplierInvoices); // Only on this isolated test server.
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
    const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = (path, role = "admin") => fetch(base + path, { headers: role ? { Authorization: `Bearer ${jwt.sign({ id: String(users[role]._id) }, process.env.JWT_SECRET)}` } : {} });
    try {
      await t.test("API authorization, private responses and no restricted counts or expected cash", async () => {
        for (const role of ["admin", "manager"]) { const response = await call("/api/admin/operations-overview", role); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store"); }
        for (const role of ["cashier", "accountant", "inventory", "kitchen", "customer"]) { const response = await call("/api/admin/operations-overview", role); assert.equal(response.status, 403); assert.equal((await response.json()).data, undefined); }
        assert.equal((await call("/api/admin/operations-overview", null)).status, 401);
        let calls = 0;
        assert.deepEqual(await readOperationalCategory("cashier", CAPABILITIES.POS_SHIFT_MANAGE, () => { calls++; }), { status: "restricted" });
        assert.equal(calls, 0);
        const cashier = await call(`/api/pos/shifts/${open._id}`, "cashier"); assert.equal(cashier.status, 200);
        assert.equal((await cashier.json()).data.totals.expectedCash, undefined);
        assert.equal((await call("/api/pos/shifts?state=open", "cashier")).status, 403);
      });
      await t.test("bounded stable lists, matching destination filters, invalid filter rejection and exact shift details", async () => {
        for (let index = 0; index < 6; index++) await order({});
        // Move exact-boundary fixtures out of wall-clock filters to avoid test timing drift.
        await Order.collection.updateMany({ createdAt: { $gte: boundary.createdAt }, status: "pending" }, { $set: { createdAt: new Date(Date.now() + 60000), preparationDueAt: new Date(Date.now() + 60000) } });
        const data = await getAdminOperations({ role: "admin" });
        for (const category of ["pending_age", "preparation_overdue"]) {
          const result = await (await call(`/api/orders?attention=${category}&page=1&limit=100`)).json();
          assert.equal(result.count, data.categories[category].total);
          assert.equal(data.categories[category].items.length, Math.min(3, result.count));
          assert.equal(result.count, await Order.countDocuments(orderAttentionFilter(category, settings)));
        }
        const invoices = await (await call("/invoices?overdue=true")).json(); assert.equal(invoices.pagination.total, data.categories.invoice_overdue.total);
        const shifts = await (await call("/api/pos/shifts?state=open")).json(); assert.equal(shifts.pagination.total, data.shifts.openCount);
        const detail = await (await call(`/api/pos/shifts/${closed._id}`)).json(); assert.equal(detail.data.shift.shiftNumber, closed.shiftNumber);
        assert.equal((await call("/api/orders?attention=unsupported")).status, 400);
      });
      await t.test("dashboard reads do not mutate records, logs, counters or actions; query work is bounded", async () => {
        const models = [Order, PurchaseOrder, SupplierInvoice, SupplierPayment, PosShift, CashMovement, RestaurantSettings, AuditLog, PurchasingAction, Counter];
        const snapshots = () => Promise.all(models.map(model => model.find().sort({ _id: 1 }).lean()));
        const before = await snapshots(); let queries = 0;
        mongoose.set("debug", () => { queries++; });
        const start = performance.now(); const result = await getAdminOperations({ role: "admin" }); const elapsed = performance.now() - start;
        mongoose.set("debug", false);
        assert.deepEqual(await snapshots(), before); assert.ok(queries <= 12, `${queries} queries`);
        t.diagnostic(`Operations snapshot: ${queries} DB queries, ${elapsed.toFixed(1)} ms, ${Buffer.byteLength(JSON.stringify(result))} bytes; isolated dummy data only.`);
      });
    } finally { mongoose.set("debug", false); await new Promise(resolve => server.close(resolve)); }
    await t.test("empty success is genuine zero and disabling shifts does not delete prior history", async () => {
      await RestaurantSettings.updateOne({ key: "default" }, { $set: { "posShifts.enabled": false } });
      assert.deepEqual((await getAdminOperations({ role: "admin" })).shifts, { status: "success", enabled: false });
      assert.equal(await PosShift.countDocuments(), 4);
      const empty = await readOperationalCategory("admin", CAPABILITIES.ORDERS_READ_ALL, async () => ({ total: 0, items: [], limit: 3 })); assert.equal(empty.total, 0); assert.equal(empty.status, "success");
      assert.equal(String(partial._id).length, 24);
    });
  });
});
