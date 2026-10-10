import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import authRoutes from "../routes/authRoutes.js";
import menuRoutes from "../routes/menuRoutes.js";
import comboRoutes from "../routes/comboRoutes.js";
import inventoryRoutes from "../routes/inventoryRoutes.js";
import orderRoutes from "../routes/orderRoutes.js";
import posRoutes from "../routes/posRoutes.js";
import deliveryRoutes from "../routes/deliveryOrderRoutes.js";
import expenseRoutes from "../routes/expenseRoutes.js";
import settingsRoutes from "../routes/restaurantSettingsRoutes.js";
import adminRoutes from "../routes/adminRoutes.js";
import { csrfProtection, securityHeaders, requestCorrelation } from "../middleware/security.js";
import User from "../models/User.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryBatch from "../models/InventoryBatch.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import AddOnInventoryRecipe from "../models/AddOnInventoryRecipe.js";
import MenuItem from "../models/MenuItem.js";
import MenuAddOn from "../models/MenuAddOn.js";
import Combo from "../models/Combo.js";
import StockTransaction from "../models/StockTransaction.js";
import Supplier from "../models/Supplier.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import SupplierPayment from "../models/SupplierPayment.js";
import ExpenseCategory from "../models/ExpenseCategory.js";
import Expense from "../models/Expense.js";
import AuditLog from "../models/AuditLog.js";
import PosSession from "../models/PosSession.js";
import RestaurantSettings from "../models/RestaurantSettings.js";
import { buildSalesReport } from "../services/salesReportingService.js";
import { createPosSession } from "../services/posSessionService.js";
import { getSaleableInventory } from "../services/inventoryEligibilityService.js";
import { runBrowserRehearsal } from "./helpers/launchBrowserRehearsal.js";

// Own loopback replica set only. No dotenv, inherited database URI, reset, or migration.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "owned-local-launch-rehearsal-secret-not-for-production";
process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "false";

test("Phase 4 integrated launch rehearsal (owned dummy database)", { timeout: 480000 }, async t => {
  await withIsolatedMongo(async () => {
    assert.equal(mongoose.connection.host, "127.0.0.1");
    assert.equal(mongoose.connection.name, "dg_record_id_test");
    const actors = {};
    for (const role of ["admin", "cashier", "inventory", "manager", "customer"]) actors[role] = await User.create({ name: `Rehearsal ${role}`, email: `${role}@launch.test`, password: "TestPassword123!", role, posPinHash: bcrypt.hashSync("654321", 10) });
    await RestaurantSettings.create({ key: "default", procurement: { purchaseApprovalThreshold: 1000000, overReceiveTolerancePercent: 0, invoiceQuantityTolerancePercent: 0 }, posShifts: { enabled: true, requireOpenShift: true, blindClose: false, varianceThreshold: 1 } });
    const category = await InventoryCategory.create({ name: "Rehearsal ingredients", skuPrefix: "RHL" });
    const ingredient = await InventoryItem.create({ name: "Rehearsal Milk", sku: "INV-RHL-001", category: category._id, unit: "kg", purchaseUnit: "carton", purchaseConversionFactor: 2, tracksExpiry: true, unitCost: 5, preferredBrand: "Preferred fixture" });
    const supplier = await Supplier.create({ code: "RHL-SUP", name: "Rehearsal supplier" });
    const dish = await MenuItem.create({ name: "Rehearsal Dish", description: "Dummy only", image: "/fixture.jpg", category: "Food", price: 20, customization: { enabled: true } });
    const plain = await MenuItem.create({ name: "Browser Dish", description: "Dummy only", image: "/fixture.jpg", category: "Food", price: 10 });
    await InventoryRecipe.create({ menuItem: dish._id, ingredients: [{ inventoryItem: ingredient._id, quantityPerSale: 0.5, unit: "kg" }], updatedBy: actors.admin._id });
    await InventoryRecipe.create({ menuItem: plain._id, doNotTrack: true, updatedBy: actors.admin._id });
    const addOn = await MenuAddOn.create({ name: "Rehearsal Extra", price: 2, menuItems: [dish._id] });
    await AddOnInventoryRecipe.create({ addOn: addOn._id, ingredients: [{ inventoryItem: ingredient._id, quantityPerAddOn: 0.1, unit: "kg" }], updatedBy: actors.admin._id });
    const combo = await Combo.create({ name: "Rehearsal Combo", slug: "rehearsal-combo", description: "Dummy", image: "/fixture.jpg", regularPrice: 40, comboPrice: 35, status: "published", items: [{ menuItem: dish._id, quantity: 2 }] });
    const expenseCategory = await ExpenseCategory.create({ name: "Rehearsal operating", createdBy: actors.admin._id, updatedBy: actors.admin._id });
    const app = express(); app.use(express.json(), securityHeaders, requestCorrelation, csrfProtection);
    for (const [path, router] of [["auth", authRoutes], ["menu", menuRoutes], ["combos", comboRoutes], ["inventory", inventoryRoutes], ["orders", orderRoutes], ["pos", posRoutes], ["delivery-orders", deliveryRoutes], ["expenses", expenseRoutes], ["settings", settingsRoutes], ["admin", adminRoutes]]) app.use("/api/" + path, router);
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ success: false, message: error.message }));
    const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const api = async (role, path, body, method = body === undefined ? "GET" : "POST", extra = {}) => {
      const actor = actors[role];
      const token = actor && jwt.sign({ id: String(actor._id), sv: actor.sessionVersion || 0 }, process.env.JWT_SECRET);
      const response = await fetch(origin + "/api" + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json(), headers: response.headers };
    };
    const ok = async (role, path, body, method, extra) => { const result = await api(role, path, body, method, extra); assert.ok(result.status < 300, path + ": " + result.body.message); return result.body; };
    const configuredLine = quantity => ({ productId: String(dish._id), productType: "menuItem", quantity, price: 0.01, customization: { selectedAddOns: [{ addOn: String(addOn._id), quantity: 1 }] } });
    const website = items => ok(null, "/orders", { customer: { name: "Dummy customer", phone: "0500000000" }, items, orderType: "takeaway" });
    let po, invoice, payment, shift, posOrder;
    try {
      await t.test("cashier catalog works without Admin catalog access; cookie CSRF and role checks", async () => {
        assert.equal((await api("cashier", "/menu")).status, 200);
        assert.equal((await api("cashier", "/menu/manage")).status, 403);
        assert.equal((await api("cashier", "/expenses/dashboard")).status, 403);
        assert.equal((await api("inventory", "/pos/terminals")).status, 403);
        const login = await ok(null, "/auth/login", { email: actors.cashier.email, password: "TestPassword123!" });
        assert.equal(login.user.role, "cashier");
        const logged = await api(null, "/auth/login", { email: actors.cashier.email, password: "TestPassword123!" });
        const cookies = logged.headers.getSetCookie().map(row => row.split(";")[0]).join("; ");
        assert.equal((await api(null, "/pos/session/lock", {}, "POST", { Cookie: cookies })).status, 403);
        const expired = jwt.sign({ id: String(actors.cashier._id) }, process.env.JWT_SECRET, { expiresIn: -1 });
        assert.equal((await api(null, "/pos/terminals", undefined, "GET", { Authorization: "Bearer " + expired })).status, 401);
      });
      await t.test("purchase draft / independent approval / partial receipt / final receipt reconciles 16 kg", async () => {
        po = (await ok("inventory", "/inventory/purchase-orders", { supplier: String(supplier._id), items: [{ item: String(ingredient._id), quantity: 8, unitCost: 10 }] })).data;
        assert.equal(po.items[0].requestedBrand, "Preferred fixture");
        const createAudit = AuditLog.create;
        try {
          AuditLog.create = async () => { throw new Error("Injected dummy PO audit failure"); };
          assert.equal((await api("inventory", "/inventory/purchase-orders", { supplier: String(supplier._id), items: [{ item: String(ingredient._id), quantity: 1, unitCost: 10 }] })).status, 500);
          assert.equal((await api("inventory", `/inventory/purchase-orders/${po._id}`, { notes: "Must roll back PO edit" }, "PATCH")).status, 500);
        } finally { AuditLog.create = createAudit; }
        assert.equal(await PurchaseOrder.countDocuments(), 1);
        assert.notEqual((await PurchaseOrder.findById(po._id)).notes, "Must roll back PO edit");
        await ok("inventory", `/inventory/purchase-orders/${po._id}/status`, { status: "submitted" }, "PATCH");
        assert.equal((await api("inventory", `/inventory/purchase-orders/${po._id}/status`, { status: "approved" }, "PATCH")).status, 403);
        await ok("manager", `/inventory/purchase-orders/${po._id}/status`, { status: "approved" }, "PATCH");
        await ok("inventory", `/inventory/purchase-orders/${po._id}/status`, { status: "ordered" }, "PATCH");
        const first = { idempotencyKey: randomUUID(), items: [{ lineId: po.items[0]._id, quantity: 3, brand: "Actual A", lotNumber: "RHL-A", expiryDate: "2098-12-31" }] };
        await ok("inventory", `/inventory/purchase-orders/${po._id}/receive`, first);
        assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 6);
        assert.equal((await ok("inventory", `/inventory/purchase-orders/${po._id}/receive`, first)).data.duplicate, true);
        await ok("inventory", `/inventory/purchase-orders/${po._id}/receive`, { idempotencyKey: randomUUID(), items: [{ lineId: po.items[0]._id, quantity: 5, lotNumber: "RHL-B", expiryDate: "2099-12-31" }] });
        po = (await ok("inventory", `/inventory/purchase-orders/${po._id}`)).data;
        assert.equal(po.status, "received"); assert.equal(po.items[0].receivedQuantity, 8);
        assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 16);
        assert.equal((await InventoryBatch.find({ item: ingredient._id })).reduce((sum, row) => sum + row.remainingQuantity, 0), 16);
      });
      await t.test("invoice match / approval / partial and full payment / reversal reconciles SAR 20 payable", async () => {
        invoice = (await ok("admin", "/inventory/supplier-invoices", { supplier: String(supplier._id), supplierInvoiceNumber: "DUMMY-RHL-001", invoiceDate: "2026-10-06", items: [{ item: String(ingredient._id), purchaseOrder: po._id, purchaseOrderLine: po.items[0]._id, quantity: 8, unitPrice: 10 }] })).data;
        assert.equal(invoice.total, 80); assert.equal(invoice.matchSummary.mismatches, 0);
        for (const status of ["submitted", "approved", "posted"]) await ok("admin", `/inventory/supplier-invoices/${invoice._id}/status`, { status, idempotencyKey: randomUUID() }, "PATCH");
        const body = { amount: 20, method: "cash", paymentDate: "2026-10-06", idempotencyKey: randomUUID() };
        payment = (await ok("admin", `/inventory/supplier-invoices/${invoice._id}/payments`, body)).data.payment;
        assert.equal((await ok("admin", `/inventory/supplier-invoices/${invoice._id}/payments`, body)).duplicate, true);
        assert.equal((await api("admin", `/inventory/supplier-invoices/${invoice._id}/payments`, { ...body, amount: 30 })).status, 409);
        const second = { ...body, amount: 60, idempotencyKey: randomUUID() };
        const parallel = await Promise.all([ok("admin", `/inventory/supplier-invoices/${invoice._id}/payments`, second), ok("admin", `/inventory/supplier-invoices/${invoice._id}/payments`, second)]);
        assert.equal(parallel.filter(row => !row.duplicate).length, 1);
        await ok("manager", `/inventory/supplier-payments/${payment._id}/reverse`, { reason: "Dummy correction" });
        const row = await SupplierInvoice.findById(invoice._id);
        assert.equal(row.paidAmountHalala, 6000); assert.equal(row.paymentStatus, "partially_paid");
        const payments = await SupplierPayment.find({ invoice: invoice._id, status: "completed" });
        assert.equal(payments.reduce((sum, row) => sum + row.amountHalala, 0), 6000); assert.equal(80 - row.paidAmountHalala / 100, 20);
      });
      await t.test("website cancellation before preparation restores; after preparation does not", async () => {
        const before = (await website([configuredLine(2)])).data;
        assert.equal(before.subtotal, 44); assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 14.8);
        await ok("manager", `/orders/${before._id}/status`, { status: "cancelled", reason: "Before kitchen work" }, "PATCH");
        assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 16);
        const after = (await website([{ productId: String(dish._id), quantity: 1 }])).data;
        await ok("manager", `/orders/${after._id}/status`, { status: "confirmed" }, "PATCH");
        await ok("manager", `/orders/${after._id}/status`, { status: "preparing" }, "PATCH");
        await ok("manager", `/orders/${after._id}/status`, { status: "cancelled", reason: "Prepared food" }, "PATCH");
        assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 15.5);
      });
      await t.test("POS add-ons / partial then full refund / combo void reconcile stock and original receipts", async () => {
        shift = (await ok("cashier", "/pos/shifts/open", { terminal: "MAIN", openingCash: 50 })).data.shift;
        posOrder = (await ok("cashier", "/pos/sales", { terminal: "MAIN", idempotencyKey: randomUUID(), items: [configuredLine(2)], paymentMethod: "cash", cashReceived: 50, orderType: "takeaway" })).data;
        assert.equal(posOrder.totalAmount, 44);
        for (const restock of [true, false]) {
          const requested = await ok("admin", `/pos/sales/${posOrder._id}/refunds`, { items: [{ index: 0, quantity: 1 }], restock, method: "cash", reason: "Dummy return", idempotencyKey: randomUUID() });
          const refundId = requested.refund._id;
          await ok("admin", `/pos/refunds/${refundId}/approve`, {});
          await ok("admin", `/pos/refunds/${refundId}/complete`, {});
        }
        const comboSale = (await ok("cashier", "/pos/sales", { terminal: "MAIN", idempotencyKey: randomUUID(), items: [{ productId: String(combo._id), productType: "combo", quantity: 1 }], paymentMethod: "cash", cashReceived: 40, orderType: "takeaway" })).data;
        assert.equal(comboSale.totalAmount, 35);
        await ok("admin", `/pos/sales/${comboSale._id}/void`, { reason: "Dummy entry error", restock: true, idempotencyKey: randomUUID() });
        assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 14.9);
        const receipt = await ok("cashier", `/pos/sales/${posOrder._id}/reprint`, {});
        assert.equal(receipt.data.paymentStatus, "refunded"); assert.equal(receipt.data.orderNumber, posOrder.orderNumber);
      });
      await t.test("historical delivery uses server pricing, original date and same recipe", async () => {
        const row = await ok("cashier", "/delivery-orders/orders", { provider: "jahez", externalOrderId: "DUMMY-RHL-DELIVERY", orderOccurredAt: new Date(Date.now() - 3600000).toISOString(), entryStatus: "completed", branch: "Dummy", platformTotal: 20, items: [{ productId: String(dish._id), quantity: 1 }] });
        assert.equal(row.data.source, "jahez"); assert.equal(row.data.subtotal, 20);
        assert.equal((await InventoryItem.findById(ingredient._id)).currentStock, 14.4);
      });
      await t.test("independent stock ledger and cash drawer reconciliation agrees with reporting", async () => {
        const movements = await StockTransaction.find({ item: ingredient._id });
        const signed = movements.reduce((sum, row) => sum + row.stockAfter - row.stockBefore, 0);
        assert.ok(Math.abs(signed - 14.4) < 0.000001);
        await ok("cashier", `/pos/shifts/${shift._id}/cash-movements`, { type: "cash_in", amount: 10, reason: "Dummy float", idempotencyKey: randomUUID() });
        await ok("cashier", `/pos/shifts/${shift._id}/cash-movements`, { type: "payout", amount: 4, reason: "Dummy payout", idempotencyKey: randomUUID() });
        const closing = await ok("cashier", `/pos/shifts/${shift._id}/close`, { countedCash: 56, idempotencyKey: randomUUID() });
        assert.equal(closing.data.differenceHalala, 0);
        const report = await buildSalesReport({});
        assert.equal(report.summary.completedRefunds, 44); assert.equal(report.summary.voidAmount, 35);
        assert.equal(report.summary.collectedAmount, 79); assert.equal(report.summary.netSales, 20);
        const stats = (await ok("admin", "/orders/stats")).data;
        assert.equal(stats.netSales, report.summary.netSales); assert.equal(stats.totalRefunds, 44);
        const filtered = (await ok("admin", "/orders/stats?source=pos&search=" + posOrder.orderNumber)).data;
        assert.equal(filtered.totalOrders, 1); assert.equal(filtered.netSales, 0);
      });
      await t.test("expense concurrent retry creates once; archive/export retains money; audit failure rolls back", async () => {
        const payload = { title: "Dummy rent", category: String(expenseCategory._id), totalAmount: 100, expenseDate: "2026-10-06", idempotencyKey: randomUUID() };
        const results = await Promise.all([ok("admin", "/expenses/entries", payload), ok("admin", "/expenses/entries", payload)]);
        assert.equal(results.filter(row => !row.duplicate).length, 1); const row = results[0].data;
        assert.equal(await Expense.countDocuments(), 1);
        assert.equal((await api("admin", "/expenses/entries", { ...payload, totalAmount: 200 })).status, 409);
        const create = AuditLog.create;
        try {
          AuditLog.create = async () => { throw new Error("Injected dummy audit failure"); };
          assert.equal((await api("admin", "/expenses/entries", { ...payload, idempotencyKey: randomUUID(), title: "Must roll back" })).status, 500);
          assert.equal((await api("admin", `/expenses/entries/${row._id}`, { title: "Must roll back edit" }, "PATCH")).status, 500);
        } finally { AuditLog.create = create; }
        assert.equal(await Expense.countDocuments(), 1); assert.equal((await Expense.findById(row._id)).title, "Dummy rent");
        await ok("admin", `/expenses/entries/${row._id}/archive`, { reason: "Hide dummy" });
        assert.equal((await ok("admin", "/expenses/entries?recordStatus=active")).data.length, 0);
        const exported = (await ok("admin", "/expenses/entries/export?search=" + row.expenseNumber)).data;
        assert.equal(exported.length, 1); assert.equal(exported[0].recognizedAmount, 100);
        await ok("admin", `/expenses/entries/${row._id}/cancel`, { reason: "Dummy cancellation" });
        assert.equal((await ok("admin", "/expenses/entries/export")).data[0].recognizedAmount, 0);
      });
      await t.test("POS reopen keeps lock and actor; expired/deleted sessions cannot bypass via missing header", async () => {
        const [first, second] = await Promise.all([createPosSession(actors.cashier), createPosSession(actors.cashier)]);
        assert.equal(jwt.decode(first.token).sid, jwt.decode(second.token).sid);
        await ok("cashier", "/pos/session/lock", {}, "POST", { "X-POS-Session": first.token });
        assert.equal((await api("cashier", "/pos/sales")).status, 401);
        assert.equal((await ok("cashier", "/pos/session")).data.locked, true);
        await ok("cashier", "/pos/session/unlock", { pin: "654321" }, "POST", { "X-POS-Session": first.token });
        await ok("cashier", "/pos/session/switch", { cashierId: String(actors.manager._id), pin: "654321" }, "POST", { "X-POS-Session": first.token });
        assert.equal((await ok("cashier", "/pos/session")).data.actor.role, "manager");
        await PosSession.deleteMany({ owner: actors.cashier._id }); // Simulates TTL cleanup, only dummy records.
        assert.equal((await api("cashier", "/pos/sales")).status, 401);
        const reopened = (await ok("cashier", "/pos/session")).data; assert.equal(reopened.locked, true);
        await User.updateOne({ _id: actors.cashier._id }, { $set: { role: "inventory" } });
        assert.equal((await api("cashier", "/pos/session", undefined, "GET", { "X-POS-Session": reopened.token })).status, 403);
        await User.updateOne({ _id: actors.cashier._id }, { $set: { role: "cashier" } });
        await User.updateOne({ _id: actors.manager._id }, { $set: { isActive: false } });
        assert.equal((await api("manager", "/pos/terminals")).status, 401);
        await User.updateOne({ _id: actors.manager._id }, { $set: { isActive: true } });
      });
      await t.test("Inventory, waste and invoice HTTP filters use inclusive Riyadh dates without timestamp migration", async () => {
        const originalInvoice = await SupplierInvoice.findById(invoice._id);
        const range = "from=2090-10-06&to=2090-10-06";
        try {
          // Synthetic read fixtures have zero ledger effect. Never rewrite immutable movements.
          await StockTransaction.create(["2090-10-05T21:00:00Z", "2090-10-06T21:00:00Z"].map(date => ({ item: ingredient._id, movementType: "WASTE", quantity: 0, stockBefore: 14.4, stockAfter: 14.4, reason: "Dummy date-boundary fixture", occurredAt: new Date(date) })));
          await SupplierInvoice.updateOne({ _id: invoice._id }, { $set: { invoiceDate: new Date("2090-10-05T21:00:00Z") } });
          assert.equal((await ok("inventory", "/inventory/movements?" + range)).pagination.total, 1);
          assert.equal((await ok("inventory", "/inventory/waste?" + range)).pagination.total, 1);
          assert.equal((await ok("inventory", "/inventory/reports?type=waste&" + range)).pagination.total, 1);
          assert.equal((await ok("admin", "/inventory/supplier-invoices?" + range)).pagination.total, 1);
          await SupplierInvoice.updateOne({ _id: invoice._id }, { $set: { invoiceDate: new Date("2090-10-06T21:00:00Z") } });
          assert.equal((await ok("inventory", "/inventory/movements?" + range)).pagination.total, 1);
          assert.equal((await ok("inventory", "/inventory/waste?" + range)).pagination.total, 1);
          assert.equal((await ok("inventory", "/inventory/reports?type=waste&" + range)).pagination.total, 1);
          assert.equal((await ok("admin", "/inventory/supplier-invoices?" + range)).pagination.total, 0);
          assert.equal((await api("inventory", "/inventory/movements?from=2026-02-30")).status, 400);
          const dashboard = (await ok("inventory", "/inventory/dashboard")).data;
          const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
          assert.equal(dashboard.inventoryValueOverTime.length, 30);
          assert.equal(dashboard.inventoryValueOverTime.at(-1).date, today);
        } finally {
          await SupplierInvoice.updateOne({ _id: invoice._id }, { $set: { invoiceDate: originalInvoice.invoiceDate } });
        }
      });
      if (process.env.PHASE4_PLAYWRIGHT_MODULE) await t.test("real browser / built frontend / cookie login / three roles / loss and reopen rehearsal", async () => {
        const receiptItem = await InventoryItem.create({ name: "Browser receipt fixture", sku: "RHL-BROWSER-RECEIPT", category: category._id, unit: "pcs", tracksExpiry: false });
        await runBrowserRehearsal({ origin, actors, dish: plain, expenseCategory, invoice, receiptItem, supplier });
        assert.equal((await InventoryItem.findById(receiptItem._id)).currentStock, 2);
      });
      assert.equal((await getSaleableInventory(await InventoryItem.findById(ingredient._id))).saleableStock, 14.4);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
