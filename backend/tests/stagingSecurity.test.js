import test from "node:test";
import assert from "node:assert/strict";
import { validateEnvironment } from "../config/environment.js";
import { csrfProtection, rateLimit, verifyProxyIdentity, validateRequestStructure, safeErrorResponses } from "../middleware/security.js";
import { parseCookies } from "../utils/httpCookies.js";

const response = () => ({ statusCode: 200, headers: {}, body: null, set(name, value) { this.headers[name] = value; return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
test("production refuses missing secrets/origins and unsafe inventory fallback", () => {
  const env = { NODE_ENV: "production", MONGO_URI: "mongodb://127.0.0.1/owned", JWT_SECRET: "A-long-random-test-secret-only-123456789", CLIENT_ORIGINS: "https://staging.example.test", ALLOW_NON_TRANSACTIONAL_INVENTORY: "false" };
  assert.deepEqual(validateEnvironment(env), []); assert.ok(validateEnvironment({ ...env, JWT_SECRET: "replace-me", CLIENT_ORIGINS: "*", ALLOW_NON_TRANSACTIONAL_INVENTORY: "true" }).length >= 3); assert.deepEqual(validateEnvironment({ NODE_ENV: "test" }), []);
});
test("spoofed proxy address is ignored unless the shared server secret matches", () => {
  const old = process.env.API_PROXY_SECRET; process.env.API_PROXY_SECRET = "test-shared-proxy-secret-1234567890";
  try { const req = { headers: { "x-dg-client-ip": "192.0.2.10", "x-dg-proxy-secret": "spoofed" } }; verifyProxyIdentity(req, {}, () => {}); assert.equal(req.verifiedClientIp, undefined); req.headers["x-dg-proxy-secret"] = process.env.API_PROXY_SECRET; verifyProxyIdentity(req, {}, () => {}); assert.equal(req.verifiedClientIp, "192.0.2.10"); }
  finally { if (old === undefined) delete process.env.API_PROXY_SECRET; else process.env.API_PROXY_SECRET = old; }
});
test("NoSQL operator/prototype injection is rejected without sanitizing legitimate text", () => {
  for (const body of [{ email: { $ne: "" } }, JSON.parse('{"__proto__":{"admin":true}}'), { items: [{ constructor: "attack" }] }]) { const res = response(); let called = false; validateRequestStructure({ body, query: {} }, res, () => { called = true; }); assert.equal(res.statusCode, 400); assert.equal(called, false); }
  let called = false; validateRequestStructure({ body: { kitchenNotes: "Price $10. No onion <please>", items: [{ quantity: 1 }] }, query: { category: "Food" } }, response(), () => { called = true; }); assert.equal(called, true);
});
test("CSRF compares byte length safely and malformed cookies cannot crash parsing", () => {
  const res = response(); csrfProtection({ method: "POST", headers: { cookie: "dg_session=token; dg_csrf=xx", "x-csrf-token": "éé" } }, res, () => { throw new Error("not allowed"); }); assert.equal(res.statusCode, 403); assert.equal(parseCookies("dg_session=%E0%A4%A").dg_session, "");
});
test("abuse response includes retry/reset headers and a readable message", () => {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = "test";
  try { const limiter = rateLimit({ max: 1, keyPrefix: "owned-security-budget" }); limiter({ ip: "owned-unique" }, response(), () => {}); const res = response(); limiter({ ip: "owned-unique" }, res, () => {}); assert.equal(res.statusCode, 429); assert.ok(Number(res.headers["Retry-After"]) > 0); assert.equal(res.headers["RateLimit-Remaining"], "0"); }
  finally { process.env.NODE_ENV = old; }
});
test("production removes database diagnostics while retaining validation contract", () => {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = "production";
  try { const res = response(); safeErrorResponses({}, res, () => {}); res.status(500).json({ success: false, message: "mongodb://user:secret@host", error: "credential", stack: "trace", code: "DATABASE_UNAVAILABLE" }); assert.equal(res.body.error, undefined); assert.equal(res.body.stack, undefined); assert.ok(!res.body.message.includes("mongodb")); assert.equal(res.body.code, "DATABASE_UNAVAILABLE"); res.status(400).json({ success: false, message: "Invalid quantity", fields: { quantity: "Required" } }); assert.equal(res.body.fields.quantity, "Required"); }
  finally { process.env.NODE_ENV = old; }
});
