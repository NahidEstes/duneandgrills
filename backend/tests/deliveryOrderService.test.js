import assert from "node:assert/strict";
import test from "node:test";
import Order from "../models/Order.js";
import { hasCapability, CAPABILITIES } from "../config/permissions.js";
import { normalizeExternalOrderId, validateDeliveryOrderInput } from "../services/deliveryOrderService.js";

const valid = {
  provider: "jahez",
  externalOrderId: " jhs-123 ",
  orderOccurredAt: "2026-09-27T10:00:00.000Z",
  entryStatus: "completed",
  platformTotal: 25,
  branch: "Riyadh — Main",
};

test("delivery input canonicalizes provider IDs and preserves original time", () => {
  const result = validateDeliveryOrderInput(valid, new Date("2026-09-27T12:00:00.000Z"));
  assert.equal(result.externalOrderId, "JHS-123");
  assert.equal(result.provider, "jahez");
  assert.equal(result.orderOccurredAt.toISOString(), valid.orderOccurredAt);
  assert.equal(normalizeExternalOrderId(" hs_9 "), "HS_9");
});

test("delivery input rejects unsupported providers, future dates and invalid totals", () => {
  const now = new Date("2026-09-27T12:00:00.000Z");
  assert.throws(() => validateDeliveryOrderInput({ ...valid, provider: "unknown" }, now), /supported delivery platform/);
  assert.throws(() => validateDeliveryOrderInput({ ...valid, orderOccurredAt: "2026-09-28T12:00:00.000Z" }, now), /future/);
  assert.throws(() => validateDeliveryOrderInput({ ...valid, platformTotal: -1 }, now), /non-negative/);
});

test("manual delivery duplicate index is provider scoped and unique", () => {
  const index = Order.schema.indexes().find(([keys]) => keys.deliveryProvider === 1 && keys.externalOrderId === 1);
  assert.ok(index);
  assert.equal(index[1].unique, true);
  assert.equal(index[1].partialFilterExpression.manualEntry, true);
});

test("Admin, Manager and Cashier can operate delivery entry", () => {
  for (const role of ["admin", "manager", "cashier"]) assert.equal(hasCapability(role, CAPABILITIES.POS_OPERATE), true);
  for (const role of ["customer", "kitchen", "accountant"]) assert.equal(hasCapability(role, CAPABILITIES.POS_OPERATE), false);
});
