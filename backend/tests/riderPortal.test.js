import assert from "node:assert/strict";
import test from "node:test";
import { riderConfiguration } from "../config/rider.js";
import { buildRiderPortal } from "../services/riderPortalService.js";
import { CAPABILITIES, hasCapability, STAFF_ROLES } from "../config/permissions.js";

const user = { _id: "rider-a", role: "rider", name: "Test Rider", employeeId: "EMP-TEST",
  password: "secret", address: "private", pointsBalance: 900, paymentMethods: [{ token: "secret" }] };
const isolated = { NODE_ENV: "development", MONGO_URI: "mongodb://127.0.0.1:27017/dg_rider_preview", RIDER_PREVIEW_ENABLED: "true" };

test("operational activation always fails closed in Phase 1", () => {
  assert.equal(riderConfiguration().operationalEnabled, false);
  assert.equal(riderConfiguration({ ...isolated, RIDER_DELIVERY_ENABLED: "true" }).operationalEnabled, false);
});
test("preview requires explicit flag, non-production environment and isolated loopback database", () => {
  assert.equal(riderConfiguration(isolated).previewEnabled, true);
  for (const env of [{ ...isolated, NODE_ENV: "production" }, { ...isolated, RIDER_PREVIEW_ENABLED: "false" },
    { ...isolated, MONGO_URI: "mongodb://127.0.0.1/duneandgrills" },
    { ...isolated, MONGO_URI: "mongodb://real.example/dg_rider_preview" },
    { ...isolated, MONGO_URI: "mongodb://127.0.0.1,real.example/dg_rider_preview" },
    { ...isolated, MONGO_URI: "mongodb+srv://real.example/dg_rider_preview" },
    { ...isolated, MONGO_URI: "" }]) assert.equal(riderConfiguration(env).previewEnabled, false);
});
test("only rider capability is granted; admin retains private preview permission", () => {
  assert.ok(STAFF_ROLES.includes("rider"));
  assert.ok(hasCapability("admin", CAPABILITIES.RIDER_PORTAL_READ));
  for (const capability of Object.values(CAPABILITIES)) assert.equal(hasCapability("rider", capability), [CAPABILITIES.RIDER_PORTAL_READ, CAPABILITIES.RIDER_DELIVERY_OPERATE].includes(capability));
  for (const role of ["customer", "manager", "cashier", "kitchen", "accountant", "inventory"])
    assert.equal(hasCapability(role, CAPABILITIES.RIDER_PORTAL_READ), false);
});
test("default response contains no real orders, fake zero metrics or customer/account secrets", () => {
  const result = buildRiderPortal(user);
  assert.equal(result.mode, "disabled"); assert.deepEqual(result.deliveries, []);
  assert.deepEqual(result.counts, { active: null, deliveredToday: null });
  assert.deepEqual(result.history, []); assert.equal(result.availability, null);
  for (const key of ["password", "address", "pointsBalance", "paymentMethods", "sessionVersion", "notes"])
    assert.equal(key in result.profile, false);
});
test("synthetic fixtures are session-scoped, separate from order identities and never history", () => {
  const config = riderConfiguration(isolated);
  const a = buildRiderPortal(user, { preview: true, config });
  const b = buildRiderPortal({ ...user, _id: "rider-b" }, { preview: true, config });
  assert.equal(a.deliveries.length, 2);
  for (const row of a.deliveries) { assert.equal(row.riderId, "rider-a"); assert.equal(row.synthetic, true); assert.match(row.orderNumber, /^PREVIEW-/); }
  assert.ok(b.deliveries.every(row => row.riderId === "rider-b"));
  assert.deepEqual(a.history, []); assert.equal(a.operationalEnabled, false);
});
test("service independently rejects unauthenticated, unauthorized and unconfigured preview calls", () => {
  assert.throws(() => buildRiderPortal(null), { status: 401 });
  assert.throws(() => buildRiderPortal({ ...user, role: "cashier" }), { status: 403 });
  assert.throws(() => buildRiderPortal(user, { preview: true, config: riderConfiguration({}) }), { status: 403 });
});
