import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import Order from "../models/Order.js";
import MenuItem from "../models/MenuItem.js";
import Refund from "../models/Refund.js";
import Expense from "../models/Expense.js";
import ExpenseCategory from "../models/ExpenseCategory.js";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import { buildSalesReport } from "../services/salesReportingService.js";
import { buildAdminAnalytics, resolveAnalyticsRange } from "../services/adminAnalyticsService.js";
import { buildExpenseFilter, createExpenseRecord, expenseSummaryAggregation } from "../services/expenseService.js";
import { getDashboard } from "../controllers/adminController.js";
import { archiveExpense, cancelExpense, updateExpense, getExpenseDashboard, getExpenseReports, exportExpenses, listExpenses, listExpenseCategories } from "../controllers/expenseController.js";
import posRoutes from "../routes/posRoutes.js";
import expenseRoutes from "../routes/expenseRoutes.js";
import adminRoutes from "../routes/adminRoutes.js";

process.env.NODE_ENV = "test";
process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "false";
process.env.JWT_SECRET = "isolated-reporting-regression-secret";

async function invoke(handler, req = {}) {
  let status = 200, body;
  await handler({ query: {}, params: {}, body: {}, ...req }, { status(code) { status = code; return this; }, json(value) { body = value; return value; } }, error => { throw error; });
  if (status >= 400) throw Object.assign(new Error(body.message), { status });
  return body;
}

test("Phase 3 reporting and cashier safety (owned isolated replica set only)", { timeout: 180000 }, async t => {
  await withIsolatedMongo(async () => {
    const admin = await User.create({ name: "Reporting Admin", email: "reporting-admin@test.local", password: "TestPassword123!", role: "admin" });
    const cashier = await User.create({ name: "Reporting Cashier", email: "reporting-cashier@test.local", password: "TestPassword123!", role: "cashier" });
    const manager = await User.create({ name: "Reporting Manager", email: "reporting-manager@test.local", password: "TestPassword123!", role: "manager" });
    const category = await ExpenseCategory.create({ name: "Operating fixtures", createdBy: admin._id, updatedBy: admin._id });
    const dish = await MenuItem.create({ name: "Reporting fixture dish", description: "Isolated reporting fixture", price: 100, image: "/fixture.jpg", category: "Food" });
    let seq = 0;
    const date = "2026-10-04T22:00:00Z";
    const query = { period: "custom", from: "2026-10-05", to: "2026-10-05" };
    const range = resolveAnalyticsRange(query);
    const sale = (options = {}) => Order.create({ orderNumber: `REPORT-${++seq}`, source: "pos", createdBy: admin._id, customer: { name: "Fixture", phone: "0500000000" }, items: [{ menuItem: dish._id, name: dish.name, price: 100, quantity: 1 }], orderType: "takeaway", subtotal: 100, totalAmount: 100, status: "pending", paymentStatus: "paid", paymentMethod: "cash", createdAt: new Date(date), ...options });
    const refund = (order, amount, status = "completed", options = {}) => Refund.create({ order: order._id, amountHalala: amount * 100, type: amount === order.totalAmount ? "full" : "partial", reason: "Reporting fixture", method: "cash", requestedBy: admin._id, idempotencyKey: randomUUID(), status, completedAt: status === "completed" ? new Date(date) : null, ...options });
    const expense = (options = {}) => createExpenseRecord({ title: `Bill ${++seq}`, category: category._id, totalAmount: 100, expenseDate: range.start, createdBy: admin._id, updatedBy: admin._id, ...options });
    const clean = async () => { // Only collections in the temporary database owned by withIsolatedMongo.
      assert.equal(mongoose.connection.db.databaseName, "dg_record_id_test");
      await Promise.all([Order.deleteMany({}), Refund.deleteMany({}), Expense.deleteMany({}), AuditLog.deleteMany({})]);
    };
    const check = (name, work) => t.test(name, async () => { await clean(); await work(); });

    await check("unpaid/pending/failed orders are ordered amounts, not captured collections", async () => {
      await sale({ paymentStatus: "unpaid", totalAmount: 200 }); await sale({ paymentStatus: "pending", totalAmount: 300 }); await sale({ paymentStatus: "failed", status: "failed", totalAmount: 400 }); await sale({ totalAmount: 50 });
      const report = await buildSalesReport({ range });
      assert.equal(report.summary.orderedAmount, 950); assert.equal(report.summary.grossSales, 50); assert.equal(report.summary.collectedAmount, 50); assert.equal(report.summary.netSales, 50);
      assert.equal(report.cashActivity.cashCollected, 50); assert.equal(report.summary.totalOrders, 4); assert.equal(report.summary.capturedOrders, 1);
    });
    await check("partial/full completed refunds use actual amounts and reconcile counters only once", async () => {
      const partial = await sale({ paymentStatus: "partially_refunded", refundedAmount: 25, refundedAmountHalala: 2500 }); await refund(partial, 25);
      const full = await sale({ status: "refunded", paymentStatus: "refunded", refundedAmount: 100, refundedAmountHalala: 10000 }); await refund(full, 100);
      const report = await buildSalesReport({ range });
      assert.equal(report.summary.grossSales, 200); assert.equal(report.summary.completedRefunds, 125); assert.equal(report.summary.netSales, 75); assert.equal(report.cashActivity.completedRefunds, 125);
    });
    await check("pending/approved/processing/rejected/failed/cancelled refunds do not count", async () => {
      const row = await sale(); for (const status of ["requested", "approved", "processing", "rejected", "failed", "cancelled"]) await refund(row, 10, status);
      const report = await buildSalesReport({ range }); assert.equal(report.summary.completedRefunds, 0); assert.equal(report.cashActivity.completedRefunds, 0); assert.equal(report.summary.netSales, 100);
    });
    await check("refunded order status without an actual amount is not an invented full refund", async () => {
      await sale({ status: "refunded", paymentStatus: "refunded" }); const report = await buildSalesReport({ range });
      assert.equal(report.summary.completedRefunds, 0); assert.equal(report.summary.grossSales, 100); assert.equal(report.summary.netSales, 100);
    });
    await check("captured voids are distinguished from unpaid cancellations", async () => {
      await sale({ status: "cancelled", paymentStatus: "voided", voidedAt: new Date(date) }); await sale({ status: "cancelled", paymentStatus: "voided" });
      const report = await buildSalesReport({ range }); assert.equal(report.summary.orderedAmount, 200); assert.equal(report.summary.grossSales, 100); assert.equal(report.summary.voidAmount, 100); assert.equal(report.summary.netSales, 0); assert.equal(report.cashActivity.netCash, 0);
    });
    await check("inconsistent historical void plus completed refund never deducts the same amount twice", async () => {
      const row = await sale({ status: "cancelled", paymentStatus: "voided", voidedAt: new Date(date) }); await refund(row, 40);
      const report = await buildSalesReport({ range }); assert.equal(report.summary.completedRefunds, 40); assert.equal(report.summary.voidAmount, 60); assert.equal(report.summary.netSales, 0); assert.equal(report.cashActivity.netCash, 0);
    });
    await check("cancelled orders with unreversed captured payments still retain their collection", async () => {
      await sale({ status: "cancelled", paymentStatus: "paid" }); const report = await buildSalesReport({ range }); assert.equal(report.summary.collectedAmount, 100); assert.equal(report.summary.voidAmount, 0);
    });
    await check("cash activity excludes Card/Other captures, refunds and voids without dropping them from recorded totals", async () => {
      const cash = await sale(), card = await sale({ totalAmount: 50, paymentMethod: "card" });
      await sale({ totalAmount: 30, paymentMethod: "other", status: "cancelled", paymentStatus: "voided", voidedAt: new Date(date) });
      await refund(cash, 10); await refund(card, 20, "completed", { method: "card" });
      const report = await buildSalesReport({ range });
      assert.equal(report.summary.grossSales, 180); assert.equal(report.summary.netSales, 120);
      assert.equal(report.cashActivity.collectedAmount, 180); assert.equal(report.cashActivity.netCollected, 120);
      assert.equal(report.cashActivity.cashCollected, 100); assert.equal(report.cashActivity.cashRefunds, 10); assert.equal(report.cashActivity.cashVoids, 0); assert.equal(report.cashActivity.netCash, 90);
    });
    await check("order-date cohort refunds differ explicitly from refund-event cash dates", async () => {
      const row = await sale({ createdAt: new Date("2026-10-03T22:00:00Z") }); await refund(row, 30);
      const report = await buildSalesReport({ range }); assert.equal(report.summary.totalOrders, 0); assert.equal(report.summary.completedRefunds, 0); assert.equal(report.cashActivity.collectedAmount, 0); assert.equal(report.cashActivity.completedRefunds, 30); assert.equal(report.cashActivity.netCollected, -30);
    });
    await check("Riyadh midnight boundaries use inclusive start/exclusive end with matching chart keys", async () => {
      for (const at of ["2026-10-04T20:59:59.999Z", "2026-10-04T21:00:00Z", "2026-10-05T20:59:59.999Z", "2026-10-05T21:00:00Z"]) await sale({ createdAt: new Date(at) });
      const report = await buildAdminAnalytics(query); assert.equal(report.summary.totalOrders, 2); assert.equal(report.series.length, 1); assert.equal(report.series[0].date, "2026-10-05"); assert.equal(report.series[0].netSales, 200); assert.equal(report.cashActivity.collectedAmount, 200);
    });
    await check("historical delivery uses original business date and aggregator payment is not restaurant collection", async () => {
      await sale({ source: "jahez", orderType: "delivery", manualEntry: true, deliveryPaymentType: "aggregator_prepaid", createdAt: new Date("2026-10-05T22:00:00Z"), orderOccurredAt: new Date(date) });
      const report = await buildAdminAnalytics({ ...query, source: "jahez" }); assert.equal(report.summary.grossSales, 100); assert.equal(report.summary.aggregatorPrepaidAmount, 100); assert.equal(report.summary.collectedAmount, 0); assert.equal(report.cashActivity.collectedAmount, 0); assert.equal(report.series[0].grossSales, 100);
    });
    await check("unknown historical website payment/refund dates are disclosed, not fabricated", async () => {
      await sale({ source: "website", paymentStatus: "partially_refunded", refundedAmountHalala: 2000 });
      const report = await buildSalesReport({ range }); assert.equal(report.summary.collectedAmount, 100); assert.equal(report.summary.completedRefunds, 20); assert.equal(report.cashActivity.collectedAmount, 0); assert.equal(report.cashActivity.unknownPaymentDateAmount, 100); assert.equal(report.cashActivity.unknownRefundDateAmount, 20);
    });
    await check("Dashboard/Analytics/series/source/type breakdowns share identical net calculations", async () => {
      const row = await sale({ refundedAmount: 25 }); await refund(row, 25); await sale({ paymentStatus: "pending" });
      const analytics = await buildAdminAnalytics(query), dashboard = (await invoke(getDashboard, { query: { period: "all" } })).data;
      assert.equal(analytics.summary.netSales, dashboard.stats.netSales); assert.equal(analytics.summary.completedRefunds, dashboard.stats.completedRefunds);
      assert.equal(analytics.series.reduce((n, x) => n + x.netSales, 0), 75); assert.equal(analytics.sourceBreakdown[0].netSales, 75); assert.equal(analytics.orderTypeBreakdown[0].netSales, 75);
    });
    await check("unknown source/type inputs are rejected", async () => {
      await assert.rejects(buildSalesReport({ query: { source: { $ne: "pos" } } }), /Invalid sales source/); await assert.rejects(buildSalesReport({ query: { orderType: "bogus" } }), /Invalid order type/);
    });
    await check("expense archive hides working list but preserves dashboard/report/category/export totals", async () => {
      const row = await expense({ amountPaid: 100, paymentStatus: "paid", paymentDate: range.start, paymentMethod: "cash" });
      await invoke(archiveExpense, { user: admin, params: { id: row._id }, body: { reason: "Archive fixture" } });
      assert.equal((await invoke(listExpenses)).data.length, 0);
      assert.equal((await invoke(getExpenseReports)).data.summary.totalExpenses, 100);
      const dashboard = (await invoke(getExpenseDashboard, { query })).data; assert.equal(dashboard.summary.totalExpenses, 100); assert.equal(dashboard.summary.paidAmount, 100);
      const exported = (await invoke(exportExpenses)).data; assert.equal(exported[0].recognizedAmount, 100); assert.equal(exported[0].recordStatus, "archived");
      assert.equal((await invoke(listExpenseCategories)).data[0].totalRecorded, 100);
      assert.ok(await AuditLog.exists({ action: "EXPENSE_ARCHIVED", entityId: row._id }));
    });
    await check("unpaid cancellation requires reason, retains original values, and is audited atomically", async () => {
      const row = await expense(); await assert.rejects(invoke(cancelExpense, { user: admin, params: { id: row._id }, body: {} }), /reason/);
      await invoke(cancelExpense, { user: admin, params: { id: row._id }, body: { reason: "Duplicate unpaid bill" } });
      const current = await Expense.findById(row._id); assert.equal(current.totalAmount, 100); assert.equal(current.amountPaid, 0); assert.equal(current.recordStatus, "cancelled"); assert.equal(current.cancellationReason, "Duplicate unpaid bill"); assert.ok(current.cancelledAt);
      const report = (await invoke(getExpenseReports)).data; assert.equal(report.summary.totalExpenses, 0); assert.equal(report.summary.outstandingAmount, 0); assert.equal(report.categoryBreakdown[0].total, 0); assert.equal(report.trend[0].total, 0);
      assert.equal((await invoke(exportExpenses)).data[0].recognizedAmount, 0);
      assert.ok(await AuditLog.exists({ action: "EXPENSE_CANCELLED", entityId: row._id, reason: "Duplicate unpaid bill" }));
      await invoke(cancelExpense, { user: admin, params: { id: row._id }, body: { reason: "Retry cancellation" } }); assert.equal(await AuditLog.countDocuments({ action: "EXPENSE_CANCELLED", entityId: row._id }), 1);
    });
    await check("paid/partial expense cancellation and silent payment erasure fail closed", async () => {
      for (const paid of [30, 100]) {
        const row = await expense({ amountPaid: paid, paymentStatus: paid === 100 ? "paid" : "partially_paid", paymentDate: range.start, paymentMethod: "cash" });
        await assert.rejects(invoke(cancelExpense, { user: admin, params: { id: row._id }, body: { reason: "Attempt cancellation" } }), /payment reversal/i);
        await assert.rejects(invoke(updateExpense, { user: admin, params: { id: row._id }, body: { amountPaid: 0 } }), /cannot be erased/);
        assert.equal((await Expense.findById(row._id)).amountPaid, paid); assert.equal((await Expense.findById(row._id)).recordStatus, "active");
      }
      assert.equal(await AuditLog.countDocuments({ action: "EXPENSE_CANCELLED" }), 0);
    });
    await check("legacy cancelled paid expense is never silently erased from historical financial effects", async () => {
      const row = await expense({ totalAmount: 100, amountPaid: 40, recordStatus: "cancelled", paymentStatus: "partially_paid", paymentDate: range.start, paymentMethod: "cash" });
      const summary = await expenseSummaryAggregation(buildExpenseFilter({}, { financial: true })); assert.equal(summary.totalExpenses, 40); assert.equal(summary.paidAmount, 40); assert.equal(summary.outstandingAmount, 0);
      const exported = (await invoke(exportExpenses)).data[0]; assert.equal(exported.totalAmount, 100); assert.equal(exported.recognizedAmount, 40); assert.equal(String(exported._id), String(row._id));
    });
    await check("audit failure rolls cancellation back completely", async () => {
      const row = await expense(), original = AuditLog.create;
      try { AuditLog.create = async () => { throw new Error("Injected audit failure"); }; await assert.rejects(invoke(cancelExpense, { user: admin, params: { id: row._id }, body: { reason: "Rollback fixture" } }), /Injected audit failure/); }
      finally { AuditLog.create = original; }
      const current = await Expense.findById(row._id); assert.equal(current.recordStatus, "active"); assert.equal(current.cancelledAt, null); assert.equal(await AuditLog.countDocuments({ entityId: row._id }), 0);
    });
    await check("archive cannot be used as a cancellation bypass or resurrect cancelled bills", async () => {
      const row = await expense(); await assert.rejects(invoke(archiveExpense, { user: admin, params: { id: row._id }, body: { recordStatus: "cancelled", reason: "Bypass" } }), /dedicated cancellation/);
      await invoke(cancelExpense, { user: admin, params: { id: row._id }, body: { reason: "Cancel fixture" } }); await assert.rejects(invoke(archiveExpense, { user: admin, params: { id: row._id } }), /cannot be reclassified/);
    });
    await check("concurrent cancellation retries create one audit and preserve original amounts", async () => {
      const row = await expense();
      await Promise.all(Array.from({ length: 3 }, () => invoke(cancelExpense, { user: admin, params: { id: row._id }, body: { reason: "Concurrent cancellation" } })));
      assert.equal(await AuditLog.countDocuments({ action: "EXPENSE_CANCELLED", entityId: row._id }), 1);
      assert.equal((await Expense.findById(row._id)).totalAmount, 100);
    });
    await check("concurrent paid edit and cancellation cannot leave a cancelled paid expense", async () => {
      const row = await expense();
      const results = await Promise.allSettled([
        invoke(cancelExpense, { user: admin, params: { id: row._id }, body: { reason: "Concurrent cancel" } }),
        invoke(updateExpense, { user: admin, params: { id: row._id }, body: { amountPaid: 100, paymentDate: "2026-10-05", paymentMethod: "cash" } }),
      ]);
      assert.ok(results.some(result => result.status === "fulfilled"));
      const current = await Expense.findById(row._id);
      assert.ok(current.recordStatus !== "cancelled" || current.amountPaid === 0);
    });

    const app = express(); app.use(express.json()); app.use("/pos", posRoutes); app.use("/expenses", expenseRoutes); app.use("/admin", adminRoutes);
    app.use((error, req, res, next) => res.status(error.status || 400).json({ success: false, message: error.message }));
    const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
    const request = async (path, user = cashier, options = {}) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { ...options, headers: { ...(user ? { Authorization: `Bearer ${jwt.sign({ id: String(user._id), sv: 0 }, process.env.JWT_SECRET)}` } : {}), "Content-Type": "application/json" } });
      return { status: response.status, body: await response.json() };
    };
    try {
      const customers = await User.insertMany(Array.from({ length: 25 }, (_, n) => ({ name: `Search Fixture ${String(n).padStart(2, "0")}`, email: `search-${n}@test.local`, password: "Not-a-live-password", phone: "0550000000", address: "PRIVATE", bio: "PRIVATE", pointsBalance: 42, role: "customer" })));
      await User.create({ name: "Search Fixture Staff", email: "search-staff@test.local", password: "TestPassword123!", role: "cashier" });
      await User.create({ name: "Search Fixture Inactive", email: "search-inactive@test.local", password: "TestPassword123!", role: "customer", isActive: false });
      await t.test("cashier POS search is bounded, customer-only, allowlisted, and requires authentication", async () => {
        const result = await request("/pos/customers?search=Search%20Fixture"); assert.equal(result.status, 200); assert.equal(result.body.data.length, 8);
        for (const row of result.body.data) { assert.deepEqual(Object.keys(row).sort(), ["_id", "customerNumber", "name", "phone"]); assert.ok(!row.name.includes("Inactive") && !row.name.includes("Staff")); }
        assert.equal((await request("/pos/customers?search=Search%20Fixture&limit=20")).body.data.length, 20);
        assert.equal((await request("/pos/customers?search=Search", null)).status, 401);
        assert.equal((await request("/pos/customers?search=Search", customers[0])).status, 403);
        assert.equal((await request("/admin/users?scope=customers", cashier)).status, 403);
      });
      await t.test("POS validates search/limit and distinguishes empty success from rejected input", async () => {
        for (const path of ["?search=a", "?search[]=Search", "?search=Search&limit=21", "?search=Search&limit=-1", "?search=Search&limit[]=8", `?search=${"x".repeat(81)}`]) assert.equal((await request(`/pos/customers${path}`)).status, 400);
        const empty = await request("/pos/customers?search=NoMatchingCustomer"); assert.equal(empty.status, 200); assert.deepEqual(empty.body.data, []);
        const literal = await request("/pos/customers?search=.*"); assert.deepEqual(literal.body.data, []);
      });
      await t.test("Admin/Manager customer search remains available without granting cashiers admin access", async () => {
        for (const user of [admin, manager]) assert.equal((await request("/admin/users?scope=customers&search=Search", user)).status, 200);
      });
      await check("expense write authorization is enforced server-side and read-only roles retain reports", async () => {
        const row = await expense(); const options = { method: "POST", body: JSON.stringify({ reason: "Unauthorized cancellation" }) };
        assert.equal((await request(`/expenses/entries/${row._id}/cancel`, cashier, options)).status, 403);
        assert.equal((await request(`/expenses/entries/${row._id}/cancel`, manager, options)).status, 403);
        assert.equal((await request("/expenses/reports", manager)).status, 200);
        assert.equal((await request(`/expenses/entries/${row._id}/cancel`, admin, options)).status, 200);
      });
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
