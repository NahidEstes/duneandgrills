import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import riderRoutes from "../routes/riderRoutes.js";
import authRoutes from "../routes/authRoutes.js";
import orderRoutes from "../routes/orderRoutes.js";
import adminRoutes from "../routes/adminRoutes.js";
import inventoryRoutes from "../routes/inventoryRoutes.js";
import expenseRoutes from "../routes/expenseRoutes.js";

test("private rider HTTP endpoints and provisioning on a disposable local replica set", async t => {
  // This helper spawns its own MongoDB on a random port/temp directory. No dotenv/server.js.
  const keys = ["JWT_SECRET", "NODE_ENV", "MONGO_URI", "RIDER_PREVIEW_ENABLED", "RIDER_DELIVERY_ENABLED"];
  const beforeEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    await withIsolatedMongo(async ({ uri }) => {
      assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:\d+\/dg_record_id_test\?/);
      Object.assign(process.env, { JWT_SECRET: "isolated-rider-test-secret-not-production", NODE_ENV: "test", MONGO_URI: uri,
        RIDER_PREVIEW_ENABLED: "false", RIDER_DELIVERY_ENABLED: "false" });
      const actors = {};
      for (const role of ["admin", "manager", "cashier", "customer", "rider"]) actors[role] = await User.create({ name: `Test ${role}`, email: `${role}@isolated.invalid`, role, password: "DummySecret123!" });
      actors.other = await User.create({ name: "Other test rider", email: "other@isolated.invalid", role: "rider", password: "DummySecret123!" });
      // Raw isolated historical fixtures: prove denial for records that actually exist.
      const otherOrderId = new mongoose.Types.ObjectId();
      await Order.collection.insertOne({ _id: otherOrderId, user: actors.other._id, orderNumber: "PREVIEW-ISOLATION-TEST",
        customer: { name: "Secret other recipient", address: "Do not expose", phone: "private" }, items: [], totalAmount: 10, status: "pending" });
      const token = actor => jwt.sign({ id: actor._id, sv: 0 }, process.env.JWT_SECRET);
      const app = express(); app.use(express.json());
      app.use("/api/rider", riderRoutes); app.use("/api/auth", authRoutes); app.use("/api/orders", orderRoutes);
      app.use("/api/admin", adminRoutes); app.use("/api/inventory", inventoryRoutes); app.use("/api/expenses", expenseRoutes);
      app.use((error, req, res, next) => { void next; res.status(error.status || 500).json({ success: false, message: error.message }); });
      const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
      const base = `http://127.0.0.1:${server.address().port}/api`;
      const request = async (path, actor, method = "GET", body) => {
        const response = await fetch(`${base}${path}`, { method, headers: { ...(actor ? { Authorization: `Bearer ${token(actor)}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: response.status, headers: response.headers, body: await response.json() };
      };
      try {
        await t.test("unauthenticated/unauthorized users cannot view rider data", async () => {
          assert.equal((await request("/rider/portal")).status, 401);
          for (const role of ["customer", "cashier", "manager"]) assert.equal((await request("/rider/portal", actors[role])).status, 403);
          assert.equal((await request("/rider/portal", actors.admin)).status, 200);
        });
        await t.test("admin provisions existing staff identity; manager and public signup cannot grant rider", async () => {
          const body = { name: "Provisioned rider", email: "provisioned@isolated.invalid", role: "rider", password: "DummySecret123!" };
          assert.equal((await request("/admin/staff", actors.manager, "POST", body)).status, 403);
          const created = await request("/admin/staff", actors.admin, "POST", body);
          assert.equal(created.status, 201); assert.match(created.body.data.employeeId, /^EMP-/);
          const signup = await request("/auth/register", null, "POST", { ...body, email: "signup@isolated.invalid" });
          assert.equal(signup.status, 201); assert.equal(signup.body.user.role, "customer");
        });
        await t.test("rider cannot read admin, finance, stock or arbitrary orders", async () => {
          for (const path of ["/admin/dashboard", "/admin/staff", "/inventory/items", "/expenses", "/orders"])
            assert.equal((await request(path, actors.rider)).status, 403, path);
          assert.equal((await request(`/orders/${actors.other._id}`, actors.rider)).status, 404);
          const other = await request(`/orders/${otherOrderId}`, actors.rider);
          assert.equal(other.status, 404); assert.doesNotMatch(JSON.stringify(other.body), /Secret other recipient|Do not expose/);
        });
        const snapshot = async () => {
          const collections = await mongoose.connection.db.listCollections().toArray();
          const counts = {};
          for (const { name } of collections) counts[name] = await mongoose.connection.db.collection(name).countDocuments();
          const users = await User.find().lean();
          return { counts, users: JSON.stringify(users) };
        };
        const before = await snapshot();
        await t.test("default disabled state and preview gate are enforced on server", async () => {
          const response = await request("/rider/portal", actors.rider);
          assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /private, no-store/);
          assert.equal(response.body.mode, "disabled"); assert.equal(response.body.counts.active, null);
          assert.deepEqual(response.body.deliveries, []);
          assert.equal((await request("/rider/preview", actors.rider)).status, 403);
          process.env.RIDER_PREVIEW_ENABLED = "true";
          process.env.NODE_ENV = "production";
          assert.equal((await request("/rider/preview", actors.rider)).status, 403);
          process.env.NODE_ENV = "test";
        });
        await t.test("two riders receive only their own synthetic scope; identity injection and guessing fail", async () => {
          for (const actor of [actors.rider, actors.other]) {
            const result = await request("/rider/preview", actor);
            assert.equal(result.status, 200); assert.equal(result.body.profile.id, String(actor._id));
            assert.ok(result.body.deliveries.every(row => row.synthetic && row.riderId === String(actor._id)));
            assert.equal((await request(`/rider/preview?riderId=${actors.other._id}`, actor)).status, 400);
            assert.equal((await request(`/rider/deliveries/${actors.other._id}`, actor)).status, 404);
          }
        });
        await t.test("all operational writes remain disabled even if activation requested", async () => {
          process.env.RIDER_DELIVERY_ENABLED = "true";
          for (const [path, method] of [["/rider/availability", "PUT"], ["/rider/deliveries/preview-a/pickup", "POST"], ["/rider/assign", "POST"], ["/rider/deliveries/preview-a", "DELETE"]])
            assert.equal((await request(path, actors.rider, method, { available: true })).body.code, "LIVE_DELIVERY_DISABLED");
          assert.equal((await request("/rider/portal", actors.rider)).body.operationalEnabled, false);
        });
        await t.test("rider session/profile uses a safe allowlist and reads/previews/actions cause no DB writes", async () => {
          const session = await request("/auth/session", actors.rider);
          for (const key of ["address", "pointsBalance", "paymentMethods", "password", "sessionVersion", "customerNumber"]) assert.equal(key in session.body.user, false);
          const login = await request("/auth/login", null, "POST", { email: actors.rider.email, password: "DummySecret123!" });
          assert.equal(login.status, 200); assert.equal(login.body.user.role, "rider");
          assert.deepEqual(await snapshot(), before);
        });
        await t.test("deactivated rider sessions are rejected", async () => {
          await User.updateOne({ _id: actors.other._id }, { $set: { isActive: false } });
          assert.equal((await request("/rider/portal", actors.other)).status, 401);
          await User.updateOne({ _id: actors.rider._id }, { $inc: { sessionVersion: 1 } });
          assert.equal((await request("/rider/portal", actors.rider)).status, 401);
        });
      } finally { await new Promise(resolve => server.close(resolve)); }
    });
  } finally {
    for (const key of keys) { if (beforeEnv[key] === undefined) delete process.env[key]; else process.env[key] = beforeEnv[key]; }
  }
});
