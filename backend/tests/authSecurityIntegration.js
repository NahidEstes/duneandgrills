import "dotenv/config";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import User from "../models/User.js";
import { login, logout } from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import { csrfProtection, rateLimit } from "../middleware/security.js";
import { createStaff, resetStaffPassword, setStaffActive, updateStaff } from "../controllers/staffController.js";
import AuditLog from "../models/AuditLog.js";

const uri = process.env.MONGO_TEST_URI || "mongodb://127.0.0.1:27017/duneandgrills_auth_test";
const response = () => ({
  statusCode: 200, payload: null, cookies: [], cleared: [], headers: {},
  status(code) { this.statusCode = code; return this; },
  json(value) { this.payload = value; return value; },
  cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
  clearCookie(name, options) { this.cleared.push({ name, options }); return this; },
  set(name, value) { if (typeof name === "object") Object.assign(this.headers, name); else this.headers[name] = value; return this; },
});

const runMiddleware = async (handler, req) => {
  const res = response();
  let nextCalled = false;
  await handler(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
};

const runController = async (handler, req) => {
  const res = response();
  await handler(req, res, (error) => { throw error; });
  return res;
};

const run = async () => {
  await mongoose.connect(uri);
  if (!mongoose.connection.db.databaseName.endsWith("_test")) throw new Error("Refusing to run outside a test database");
  await mongoose.connection.dropDatabase();
  const user = await User.create({ name: "Security Test", email: "security@example.com", password: "StrongPass123!", role: "manager" });
  const admin = await User.create({ name: "Admin Test", email: "security-admin@example.com", password: "StrongPass123!", role: "admin" });
  const loginRes = response();
  await login({ body: { email: user.email, password: "StrongPass123!" } }, loginRes);
  assert.equal(loginRes.statusCode, 200);
  assert.equal("token" in loginRes.payload, false);
  const session = loginRes.cookies.find((cookie) => cookie.name === "dg_session");
  const csrf = loginRes.cookies.find((cookie) => cookie.name === "dg_csrf");
  assert.equal(session.options.httpOnly, true);
  assert.equal(csrf.options.httpOnly, false);

  const invalidLogin = response();
  await login({ body: { email: user.email, password: "WrongPassword123!" } }, invalidLogin);
  assert.equal(invalidLogin.statusCode, 401);

  const cookieHeader = `dg_session=${session.value}; dg_csrf=${csrf.value}`;
  const authenticated = await runMiddleware(protect, { headers: { cookie: cookieHeader }, user: null });
  assert.equal(authenticated.nextCalled, true);
  assert.equal(String(authenticated.res.statusCode), "200");

  const rejectedCsrf = await runMiddleware(csrfProtection, { method: "POST", headers: { cookie: cookieHeader }, ip: "test" });
  assert.equal(rejectedCsrf.res.statusCode, 403);
  const acceptedCsrf = await runMiddleware(csrfProtection, { method: "POST", headers: { cookie: cookieHeader, "x-csrf-token": csrf.value }, ip: "test" });
  assert.equal(acceptedCsrf.nextCalled, true);

  await User.updateOne({ _id: user._id }, { $set: { isActive: false }, $inc: { sessionVersion: 1 } });
  const revoked = await runMiddleware(protect, { headers: { cookie: cookieHeader }, user: null });
  assert.equal(revoked.res.statusCode, 401);

  await User.updateOne({ _id: user._id }, { $set: { isActive: true } });
  const relogin = response();
  await login({ body: { email: user.email, password: "StrongPass123!" } }, relogin);
  const refreshedSession = relogin.cookies.find((cookie) => cookie.name === "dg_session");
  const beforePasswordChange = `dg_session=${refreshedSession.value}`;
  await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
  const passwordRevoked = await runMiddleware(protect, { headers: { cookie: beforePasswordChange }, user: null });
  assert.equal(passwordRevoked.res.statusCode, 401);

  const limiter = rateLimit({ windowMs: 60_000, max: 1, keyPrefix: `test-${Date.now()}` });
  assert.equal((await runMiddleware(limiter, { ip: "127.0.0.1", socket: {}, headers: {} })).nextCalled, true);
  assert.equal((await runMiddleware(limiter, { ip: "127.0.0.1", socket: {}, headers: {} })).res.statusCode, 429);

  const logoutRes = response();
  await logout({}, logoutRes);
  assert.deepEqual(logoutRes.cleared.map((entry) => entry.name).sort(), ["dg_csrf", "dg_session"]);

  const createdStaff = await runController(createStaff, { user: admin, body: { name: "Cashier Test", email: "cashier@example.com", phone: "0501112222", role: "cashier", password: "CashierPass123!" } });
  assert.equal(createdStaff.statusCode, 201);
  assert.equal(createdStaff.payload.data.role, "cashier");
  const staffId = createdStaff.payload.data._id;
  const updatedStaff = await runController(updateStaff, { user: admin, params: { id: staffId }, body: { role: "kitchen", name: "Kitchen Test" } });
  assert.equal(updatedStaff.payload.data.role, "kitchen");
  const reset = await runController(resetStaffPassword, { user: admin, params: { id: staffId }, body: { password: "KitchenPass123!" } });
  assert.match(reset.payload.message, /sessions revoked/);
  const deactivated = await runController(setStaffActive, { user: admin, params: { id: staffId }, body: { active: false } });
  assert.equal(deactivated.payload.data.isActive, false);
  assert.equal(await AuditLog.countDocuments({ entityId: staffId }), 4);
  console.log("Auth security integration checks passed");
};

try { await run(); } finally {
  if (mongoose.connection.readyState === 1) {
    if (mongoose.connection.db.databaseName.endsWith("_test")) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}
