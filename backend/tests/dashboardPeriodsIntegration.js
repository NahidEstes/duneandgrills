import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import Order from "../models/Order.js";
import Refund from "../models/Refund.js";
import User from "../models/User.js";
import MenuItem from "../models/MenuItem.js";
import { resolveDashboardPeriod } from "../services/dashboardPeriodService.js";
import { buildSalesReport } from "../services/salesReportingService.js";
import { getDashboard } from "../controllers/adminController.js";

process.env.NODE_ENV = "test"; // Only the helper-owned temporary replica set; no dotenv.
test("Dashboard periods retain accounting, old events and live snapshots (isolated)", { timeout: 180000 }, async t => {
  await withIsolatedMongo(async () => {
    const admin = await User.create({ name: "Period Admin", email: "period@test.local", password: "TestPassword123!", role: "admin" });
    const dish = await MenuItem.create({ name: "Period dish", description: "Dummy only", price: 100, image: "/fixture.jpg", category: "Food" });
    const now = new Date("2028-03-01T09:00:00Z"), selection = resolveDashboardPeriod("today", now);
    let sequence = 0;
    const sale = (totalAmount, options = {}) => Order.create({ orderNumber: `PERIOD-${++sequence}`, createdAt: new Date("2028-03-01T08:00:00Z"), source: "pos", createdBy: admin._id, customer: { name: "Dummy", phone: "0500000000" }, items: [{ menuItem: dish._id, name: dish.name, price: totalAmount, quantity: 1 }], totalAmount, subtotal: totalAmount, status: "delivered", paymentStatus: "paid", paymentMethod: "cash", ...options });
    const refund = (order, amount, options = {}) => Refund.create({ order: order._id, amountHalala: amount * 100, type: "partial", reason: "Dummy only", method: "cash", requestedBy: admin._id, idempotencyKey: randomUUID(), status: "completed", completedAt: now, ...options });
    await sale(200, { paymentStatus: "unpaid", status: "pending" });
    const partial = await sale(100, { refundedAmountHalala: 2500, paymentStatus: "partially_refunded" }); await refund(partial, 25);
    const full = await sale(80, { paymentStatus: "refunded" }); await refund(full, 80);
    const voided = await sale(50, { status: "cancelled", paymentStatus: "voided", voidedAt: now }); await refund(voided, 20);
    await sale(40, { source: "jahez", manualEntry: true, orderOccurredAt: now, deliveryPaymentType: "aggregator_prepaid" });
    await sale(30, { source: "website", refundedAmountHalala: 1000 });
    await sale(20, { createdAt: selection.range.start });
    await sale(10, { createdAt: new Date(selection.range.start - 1) });
    await sale(15, { createdAt: new Date("2028-02-29T08:00:00Z") });
    await sale(60, { createdAt: new Date("2028-02-25T08:00:00Z") });
    const old = await sale(100, { createdAt: new Date("2028-02-01T08:00:00Z"), status: "cancelled", paymentStatus: "voided", voidedAt: now }); await refund(old, 15);
    await sale(500, { source: "ninja", manualEntry: true, createdAt: now, orderOccurredAt: new Date("2024-01-01T09:00:00Z"), deliveryPaymentType: "aggregator_prepaid", status: "preparing" });
    await sale(900, { createdAt: new Date("2024-01-01T09:00:00Z"), paymentStatus: "unpaid", status: "pending" });
    await sale(777, { createdAt: new Date(selection.metadata.range.calendarEndExclusive) });
    for (const status of ["failed", "requested", "cancelled", "rejected"]) await refund(partial, 5, { status, completedAt: null });
    const report = period => {
      const selected = resolveDashboardPeriod(period, now);
      return buildSalesReport({ range: selected.range, dashboardMode: true, dashboardPeriods: selected.previous ? { current: selected.range, previous: selected.previous } : null });
    };
    await t.test("unpaid, partial/full refunds, voids and cohort/event attribution use authoritative values once", async () => {
      const today = await report("today");
      assert.equal(today.summary.totalOrders, 7); assert.equal(today.summary.orderedAmount, 520);
      assert.equal(today.summary.grossSales, 320); assert.equal(today.summary.collectedAmount, 280);
      assert.equal(today.summary.completedRefunds, 135); assert.equal(today.summary.voidAmount, 30); assert.equal(today.summary.netSales, 155);
      assert.equal(today.cashActivity.collectedAmount, 250); assert.equal(today.cashActivity.completedRefunds, 140);
      assert.equal(today.cashActivity.voidAmount, 115); assert.equal(today.cashActivity.netCollected, -5);
      assert.equal(today.cashActivity.unknownPaymentDateAmount, 30); assert.equal(today.cashActivity.unknownRefundDateAmount, 10);
      assert.equal(today.cashActivity.unknownDateScope, "Selected order-date cohort");
      assert.equal(today.series[0].date, "2028-03-01");
    });
    await t.test("every period matches full shared report; historical entry date is not mistaken for order date", async () => {
      for (const period of ["today", "week", "month", "all"]) {
        const selected = resolveDashboardPeriod(period, now), bounded = await report(period), original = await buildSalesReport({ range: selected.range });
        assert.deepEqual(bounded.summary, original.summary, period);
        for (const key of ["collectedAmount", "completedRefunds", "voidAmount", "cashCollected", "cashRefunds", "cashVoids", "netCollected", "netCash"]) assert.equal(bounded.cashActivity[key], original.cashActivity[key], `${period}.${key}`);
        assert.deepEqual([...bounded.statusBreakdown].sort((a, b) => a.status.localeCompare(b.status)), [...original.statusBreakdown].sort((a, b) => a.status.localeCompare(b.status)));
        assert.deepEqual(bounded.series, original.series);
      }
      assert.equal((await report("week")).summary.totalOrders, 10);
      assert.equal((await report("month")).summary.totalOrders, 7);
      assert.equal((await report("all")).summary.totalOrders, 14);
    });
    await t.test("comparison totals and completed counts use exactly the same elapsed cohort boundaries", async () => {
      const today = await report("today");
      assert.equal(today.dashboard.currentSummary.netSales, today.summary.netSales);
      // Yesterday's 23:59:59.999 order is beyond the noon elapsed cutoff.
      assert.equal(today.dashboard.previousSummary.netSales, 15);
      assert.equal(today.dashboard.orderCounts.currentOrders, today.summary.totalOrders);
      assert.equal(today.dashboard.orderCounts.currentCompleted, 5);
      assert.equal(today.dashboard.orderCounts.previousOrders, 1);
      assert.equal(today.dashboard.orderCounts.previousCompleted, 1);
      const week = await report("week");
      assert.equal(week.dashboard.previousSummary.netSales, 0);
      assert.equal(week.dashboard.orderCounts.previousOrders, 0);
    });
    await t.test("live pending/open counts, Recent Orders and inventory remain identical across periods; no records mutated", async () => {
      const before = await Order.find().sort({ _id: 1 }).lean(); const snapshots = [];
      for (const period of ["today", "week", "month", "all"]) {
        let status, body;
        await getDashboard({ query: { period } }, { setHeader() {}, status(code) { status = code; return this; }, json(value) { body = value; } });
        assert.equal(status, 200, body?.error); assert.equal(body.data.reportingPeriod.period, period);
        snapshots.push(body.data); assert.equal(body.data.recentOrdersMeta.total, 14);
        assert.equal(body.data.stats.pendingOrders, 2); assert.equal(body.data.stats.openOrders, 3);
      }
      for (const data of snapshots.slice(1)) { assert.deepEqual(data.inventorySummary, snapshots[0].inventorySummary); assert.deepEqual(data.recentOrders.map(row => row._id), snapshots[0].recentOrders.map(row => row._id)); }
      assert.deepEqual(await Order.find().sort({ _id: 1 }).lean(), before);
      let code; await getDashboard({ query: { period: ["today"] } }, { setHeader() {}, status(value) { code = value; return this; }, json() {} }); assert.equal(code, 400);
    });
  });
});
