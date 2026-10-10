import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import mongoose from "mongoose";
import RateLimitBucket from "../models/RateLimitBucket.js";
import { rateLimit } from "../middleware/security.js";

test("real API staging security and append-only audit (owned replica set)", async t => {
  await withIsolatedMongo(async ({ uri }) => {
    const keys = ["NODE_ENV", "VERCEL", "MONGO_URI", "JWT_SECRET", "CLIENT_ORIGINS", "TRUST_PROXY_HOPS"];
    const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    Object.assign(process.env, { NODE_ENV: "test", VERCEL: "1", MONGO_URI: uri, JWT_SECRET: "owned-staging-test-secret-123456789012", CLIENT_ORIGINS: "https://owned-frontend.test", TRUST_PROXY_HOPS: "0" });
    const { default: app } = await import("../server.js");
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    const user = await User.create({ name: "Owned cashier", email: "cashier@owned-staging.test", password: "TestPassword123!", role: "cashier" });
    const token = jwt.sign({ id: String(user._id), sv: 0 }, process.env.JWT_SECRET, { algorithm: "HS256" });
    const server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const call = (route, options = {}) => fetch(origin + "/api" + route, options);
    try {
      await t.test("health/readiness and private session responses", async () => {
        assert.equal((await call("/health")).status, 200); assert.equal((await call("/readiness")).status, 200);
        assert.equal((await call("/auth/session")).status, 401);
        const response = await call("/auth/session", { headers: { Cookie: `dg_session=${token}` } }); const body = await response.json(); assert.equal(body.user.role, "cashier"); assert.equal(body.user.password, undefined); assert.equal(body.user.sessionVersion, undefined); assert.ok(response.headers.get("x-request-id"));
        assert.equal((await call("/admin/dashboard", { headers: { Cookie: `dg_session=${token}` } })).status, 403);
      });
      await t.test("CORS and cookie CSRF fail closed without database mutations", async () => {
        assert.equal((await call("/health", { headers: { Origin: "https://evil.test" } })).status, 403);
        const allowed = await call("/health", { headers: { Origin: "https://owned-frontend.test" } }); assert.equal(allowed.headers.get("access-control-allow-origin"), "https://owned-frontend.test");
        const logout = await call("/auth/logout", { method: "POST", headers: { Cookie: `dg_session=${token}`, "Content-Type": "application/json" }, body: "{}" }); assert.equal(logout.status, 403); assert.equal(logout.headers.get("set-cookie"), null);
        const verified = await call("/auth/logout", { method: "POST", headers: { Cookie: `dg_session=${token}; dg_csrf=owned-csrf`, "X-CSRF-Token": "owned-csrf", "Content-Type": "application/json" }, body: "{}" }); assert.equal(verified.status, 200);
      });
      await t.test("readiness detects a missing TTL index without repairing it", async () => {
        const index = (await RateLimitBucket.collection.listIndexes().toArray()).find(value => value.expireAfterSeconds === 0);
        assert.ok(index); await RateLimitBucket.collection.dropIndex(index.name); // Only this owned, disposable database.
        const response = await call("/readiness"); assert.equal(response.status, 503);
        assert.equal((await RateLimitBucket.collection.listIndexes().toArray()).some(value => value.name === index.name), false);
        await RateLimitBucket.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        assert.equal((await call("/readiness")).status, 200);
      });
      await t.test("operator injection and malformed cookie do not escape authentication", async () => {
        assert.equal((await call("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: { $ne: null }, password: "TestPassword123!" }) })).status, 400);
        assert.equal((await call("/auth/session", { headers: { Cookie: "dg_session=%E0%A4%A" } })).status, 401);
        await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } }); assert.equal((await call("/auth/session", { headers: { Cookie: `dg_session=${token}` } })).status, 401);
      });
      await t.test("public abuse limits cannot be bypassed with untrusted forwarded addresses", async () => {
        let last; for (let count = 0; count < 61; count++) last = await call("/orders", { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": `192.0.2.${count}` }, body: "{}" });
        assert.equal(last.status, 429); assert.equal(last.headers.get("ratelimit-limit"), "60"); assert.ok(Number(last.headers.get("retry-after")) > 0);
      });
      await t.test("production rate budgets share an atomic database counter under concurrency", async () => {
        const previous = process.env.NODE_ENV; process.env.NODE_ENV = "production";
        try {
          const limit = rateLimit({ max: 2, keyPrefix: "owned-concurrent-budget" });
          const statuses = await Promise.all(Array.from({ length: 20 }, () => new Promise((resolve, reject) => {
            const res = { statusCode: 200, set() { return this; }, status(code) { this.statusCode = code; return this; }, json() { resolve(this.statusCode); return this; } };
            limit({ ip: "192.0.2.99" }, res, error => error ? reject(error) : resolve(200));
          })));
          assert.equal(statuses.filter(status => status === 200).length, 2); assert.equal(statuses.filter(status => status === 429).length, 18);
          assert.equal((await RateLimitBucket.findOne({ count: 20 })).count, 20);
        } finally { process.env.NODE_ENV = previous; }
      });
      await t.test("audit history cannot be updated, deleted, replaced or resaved", async () => {
        const row = await AuditLog.create({ action: "OWNED_SECURITY_TEST", entityType: "Test", metadata: { retained: true } });
        await assert.rejects(AuditLog.updateOne({ _id: row._id }, { $set: { reason: "rewrite" } }), /append-only/);
        await assert.rejects(AuditLog.deleteOne({ _id: row._id }), /append-only/);
        await assert.rejects(row.deleteOne(), /append-only/);
        await assert.rejects(AuditLog.bulkWrite([{ deleteOne: { filter: { _id: row._id } } }]), /append-only/);
        await assert.rejects(AuditLog.findOneAndReplace({ _id: row._id }, { action: "REPLACE", entityType: "Test" }), /append-only/);
        await assert.rejects(row.save(), /append-only/); assert.equal((await AuditLog.findById(row._id)).action, "OWNED_SECURITY_TEST");
      });
    } finally {
      await new Promise(resolve => server.close(resolve));
      for (const key of keys) if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
    }
  });
});
