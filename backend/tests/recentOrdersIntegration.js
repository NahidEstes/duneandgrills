import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import MenuItem from "../models/MenuItem.js";
import adminRoutes from "../routes/adminRoutes.js";
import orderRoutes from "../routes/orderRoutes.js";
import { serializeAdminOrder } from "../services/orderSerializer.js";
import { getOrderById } from "../controllers/orderController.js";

// Own temporary loopback replica set only. No dotenv/external URI/reset.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "isolated-recent-orders-secret";

test("Recent orders: filtered, bounded, private and stable (isolated database)", { timeout: 180000 }, async t => {
  await withIsolatedMongo(async () => {
    const users = {};
    for (const role of ["admin", "manager", "cashier", "kitchen", "customer"]) {
      users[role] = await User.create({ name: `Recent ${role}`, email: `recent-${role}@test.local`, password: "TestPassword123!", role });
    }
    const dish = await MenuItem.create({ name: "Recent dummy dish", description: "Isolated fixture", price: 20, image: "/fixture.jpg", category: "Food" });
    const now = new Date(), old = new Date(now.getTime() - 86400000);
    const create = (number, options = {}) => Order.create({
      orderNumber: `RECENT-${number}`, createdAt: now, createdBy: users.admin._id,
      customer: { name: "Dummy guest", phone: "0500000000", address: "PRIVATE fixture" },
      items: [{ menuItem: dish._id, name: dish.name, price: 20, quantity: 2 }],
      totalAmount: 40, subtotal: 40, status: "delivered", source: "website",
      paymentStatus: "paid", paymentMethod: "card", notes: "PRIVATE", ...options,
    });
    const older = await create("OLDER-PENDING", { createdAt: old, status: "pending", paymentStatus: "unpaid", preparationDueAt: old });
    const pending = [older];
    for (let n = 0; n < 8; n++) pending.push(await create(`PENDING-${n}`, { createdAt: old, status: "pending", paymentStatus: "pending" }));
    for (let n = 0; n < 25; n++) await create(`NEW-DELIVERED-${n}`);
    const historical = await create("HISTORICAL", { source: "jahez", manualEntry: true, orderOccurredAt: new Date("2024-04-01T21:01:00Z"), deliveryPaymentType: "aggregator_prepaid", preparationDueAt: old, status: "preparing", paymentMethod: "unrecorded" });
    const before = await Order.find().sort({ _id: 1 }).lean();
    const app = express(); app.use("/api/admin", adminRoutes); app.use("/api/orders", orderRoutes);
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
    const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = (path, role = "admin") => fetch(base + path, { headers: role ? { Authorization: `Bearer ${jwt.sign({ id: String(users[role]._id) }, process.env.JWT_SECRET)}` } : {} });
    const read = async path => { const response = await call(path); const body = await response.json(); assert.equal(response.status, 200, body.message); return { ...body, headers: response.headers }; };
    try {
      await t.test("pending orders outside latest seven global results are filtered before limiting", async () => {
        const all = await read("/api/admin/dashboard");
        assert.equal(all.data.recentOrders.length, 7);
        assert.ok(all.data.recentOrders.every(order => order.status !== "pending"));
        assert.equal(all.data.recentOrdersMeta.total, 35); assert.equal(all.data.recentOrdersMeta.hasMore, true);
        const result = await read("/api/orders?view=recent&status=pending&limit=100&page=5");
        assert.equal(result.data.length, 7); assert.equal(result.count, 9);
        assert.ok(result.data.every(order => order.status === "pending"));
        assert.deepEqual(result.pagination, { page: 1, limit: 7, total: 9, pages: 2, hasMore: true });
        assert.deepEqual(result.data.map(order => order._id), pending.map(order => String(order._id)).sort().reverse().slice(0, 7));
        assert.equal(result.headers.get("cache-control"), "private, no-store");
      });
      await t.test("timestamp ties remain stable across requests and list pages", async () => {
        const one = await read("/api/orders?status=pending&page=1&limit=5"), two = await read("/api/orders?status=pending&page=2&limit=5");
        const again = await read("/api/orders?status=pending&page=1&limit=5");
        assert.deepEqual(one.data.map(order => order._id), again.data.map(order => order._id));
        assert.deepEqual([...one.data, ...two.data].map(order => order._id), pending.map(order => String(order._id)).sort().reverse());
      });
      await t.test("recent projection includes authoritative amounts/payment/timing but not private details", async () => {
        const result = await read("/api/orders?view=recent&status=preparing");
        assert.equal(result.data.length, 1); const row = result.data[0];
        assert.equal(row.totalAmount, 40); assert.equal(row.items[0].quantity, 2);
        assert.equal(row.deliveryPaymentType, "aggregator_prepaid"); assert.equal(row.paymentMethod, "unrecorded");
        assert.equal(row.manualEntry, true); assert.equal(row.preparationActive, false); assert.equal(row.isOverdue, false);
        assert.equal(row.orderOccurredAt, "2024-04-01T21:01:00.000Z");
        for (const field of ["phone", "email", "address"]) assert.equal(row.customer[field], undefined);
        assert.equal(row.notes, undefined); assert.equal(row.createdBy, undefined);
      });
      await t.test("exact order fetch works outside first list page, without public access", async () => {
        const first = await read("/api/orders?page=1&limit=20"); assert.ok(!first.data.some(row => row._id === String(older._id)));
        const detail = await read(`/api/orders/${older._id}`); assert.equal(detail.data.orderNumber, older.orderNumber);
        assert.equal(detail.data.isOverdue, true); assert.equal(detail.data.customer.address, "PRIVATE fixture");
        assert.equal((await call(`/api/orders/${older._id}`, null)).status, 401);
        assert.equal((await call(`/api/orders/${older._id}`, "customer")).status, 404);
        assert.equal((await call(`/api/orders/${older._id}`, "kitchen")).status, 404);
        assert.equal((await call(`/api/orders/${new mongoose.Types.ObjectId()}`)).status, 404);
        assert.equal((await call("/api/orders/not-a-valid-id")).status, 404);
      });
      await t.test("existing role policies and invalid status validation are preserved", async () => {
        for (const role of ["admin", "manager"]) assert.equal((await call("/api/admin/dashboard", role)).status, 200);
        assert.equal((await call("/api/admin/dashboard", "cashier")).status, 403);
        assert.equal((await call("/api/orders?view=recent", "cashier")).status, 200);
        assert.equal((await call("/api/orders?view=recent", "kitchen")).status, 403);
        assert.equal((await call("/api/orders?view=recent", null)).status, 401);
        assert.equal((await call("/api/orders?status=made-up&view=recent")).status, 400);
        const empty = await read("/api/orders?view=recent&status=failed");
        assert.deepEqual(empty.data, []); assert.equal(empty.pagination.total, 0); assert.equal(empty.pagination.hasMore, false);
      });
      await t.test("recorded prep deadline never makes terminal/historical orders actively overdue", () => {
        for (const status of ["ready", "delivered", "cancelled", "refunded", "failed"]) {
          const row = serializeAdminOrder({ status, preparationDueAt: old }, now);
          assert.equal(row.preparationActive, false); assert.equal(row.isOverdue, false);
        }
        for (const status of ["pending", "confirmed", "preparing", "out-for-delivery"]) {
          assert.equal(serializeAdminOrder({ status, preparationDueAt: old }, now).isOverdue, true);
          assert.equal(serializeAdminOrder({ status }, now).isOverdue, false);
        }
        assert.equal(serializeAdminOrder(historical, now).isOverdue, false);
      });
      await t.test("detail API failure is distinct from genuinely unavailable orders", async () => {
        const original = Order.findById;
        let status, body;
        try {
          Order.findById = async () => { throw new Error("Isolated database unavailable"); };
          await getOrderById({ params: { id: String(older._id) }, user: users.admin }, {
            setHeader() {}, status(value) { status = value; return this; }, json(value) { body = value; },
          });
          assert.equal(status, 500); assert.equal(body.message, "Failed to fetch order");
          assert.doesNotMatch(JSON.stringify(body), /database unavailable|PRIVATE/);
        } finally { Order.findById = original; }
      });
      await t.test("reading dashboard/list/details never alters historical orders or payments", async () => {
        assert.deepEqual(await Order.find().sort({ _id: 1 }).lean(), before);
      });
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
