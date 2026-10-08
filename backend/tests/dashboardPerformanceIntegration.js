import assert from "node:assert/strict";
import { test } from "node:test";
import { performance } from "node:perf_hooks";
import mongoose from "mongoose";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import Order from "../models/Order.js";
import Refund from "../models/Refund.js";
import MenuItem from "../models/MenuItem.js";
import User from "../models/User.js";
import { getDashboard } from "../controllers/adminController.js";
import { buildSalesReport } from "../services/salesReportingService.js";
import { ADMIN_DAY_MS, startOfRiyadhDay } from "../utils/adminDate.js";

// Never load dotenv or an external database URI. The helper owns its temporary replica set.
process.env.NODE_ENV = "test";
const invoke = async () => {
  let body, status, headers = {};
  await getDashboard({}, { setHeader(key, value) { headers[key] = value; }, status(code) { status = code; return this; }, json(value) { body = value; } });
  assert.equal(status, 200, body?.message); return { ...body.data, headers };
};
test("Dashboard summary performance and accounting parity (isolated fixtures)", { timeout: 180000 }, async t => {
  await withIsolatedMongo(async () => {
    await t.test("successful empty database returns genuine zero sales and cash activity", async () => {
      const data = await invoke();
      assert.equal(data.stats.totalOrders, 0); assert.equal(data.stats.netSales, 0);
      for (const key of ["collectedAmount", "completedRefunds", "voidAmount", "cashCollected", "cashRefunds", "cashVoids", "netCollected", "netCash"]) assert.equal(data.cashActivity[key], 0, key);
      assert.deepEqual(data.recentOrders, []);
    });
    const actor = await User.create({ name: "Benchmark Admin", email: "dashboard-bench@test.local", password: "TestPassword123!", role: "admin" });
    const dish = await MenuItem.create({ name: "Benchmark dish", description: "Dummy only", price: 20, image: "/test.jpg", category: "Food" });
    const today = startOfRiyadhDay();
    const orders = await Order.insertMany(Array.from({ length: 600 }, (_, n) => ({ orderNumber: `BENCH-${n}`, source: n % 4 === 0 ? "jahez" : "pos", deliveryPaymentType: n % 4 === 0 ? "aggregator_prepaid" : undefined, orderOccurredAt: n % 4 === 0 ? new Date(today.getTime() - (n % 20) * ADMIN_DAY_MS + 3600000) : undefined, createdAt: new Date(today.getTime() - (n % 20) * ADMIN_DAY_MS + 7200000), createdBy: actor._id, customer: { name: "Dummy", phone: "0500000000", address: "PRIVATE fixture address" }, items: [{ menuItem: dish._id, name: dish.name, price: 20, quantity: 1 }], orderType: "takeaway", subtotal: 20, totalAmount: 20, status: n % 3 === 0 ? "pending" : "delivered", paymentStatus: n % 3 === 0 ? "unpaid" : "paid", paymentMethod: "cash", notes: "private fixture notes" })));
    await Refund.insertMany(orders.filter((_, n) => n % 19 === 1).map((order, n) => ({ order: order._id, amountHalala: 500, type: "partial", reason: "Dummy refund", method: "cash", requestedBy: actor._id, idempotencyKey: `bench-refund-${n}`, status: n % 2 ? "failed" : "completed", completedAt: n % 2 ? null : today })));
    await invoke(); // Warm-up; measurements below contain controller queries only, not fixture creation.
    const measurements = [];
    for (let run = 0; run < 3; run++) {
      const calls = []; mongoose.set("debug", (collection, method) => calls.push({ collection, method }));
      const start = performance.now(); let data;
      try { data = await invoke(); } finally { mongoose.set("debug", false); }
      measurements.push({ ms: Number((performance.now() - start).toFixed(2)), queries: calls.length, orderAggregates: calls.filter(call => call.collection === "orders" && call.method === "aggregate").length, bytes: Buffer.byteLength(JSON.stringify(data)) });
    }
    console.log("DASHBOARD_MEASUREMENTS", JSON.stringify(measurements));
    await t.test("all-time totals, current Riyadh series and event activity retain shared report definitions", async () => {
      const data = await invoke(), start = new Date(today.getTime() - 6 * ADMIN_DAY_MS), end = new Date(today.getTime() + ADMIN_DAY_MS);
      const all = await buildSalesReport(), current = await buildSalesReport({ range: { start, end, days: 7 } });
      for (const key of Object.keys(all.summary)) assert.equal(data.stats[key], all.summary[key], key);
      assert.deepEqual(data.cashActivity, current.cashActivity); assert.deepEqual(data.analytics.dailyRevenue, current.series);
      assert.deepEqual(data.reportingDefinitions, all.definitions); assert.equal(data.stats.totalOrders, 600);
    });
    if (!process.env.DASHBOARD_BENCHMARK_ONLY) await t.test("one bounded shared sales aggregate and private no-store response", async () => {
      assert.ok(measurements.every(row => row.orderAggregates === 1));
      const data = await invoke(); assert.equal(data.headers["Cache-Control"], "private, no-store");
      assert.ok(data.recentOrders.every(order => order.customer.address === undefined && order.notes === undefined));
    });
  });
});
