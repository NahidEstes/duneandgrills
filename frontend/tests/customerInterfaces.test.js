import test from "node:test";
import assert from "node:assert/strict";
import { filterMenu } from "../src/utils/menuFilters.js";
import { rememberTracking, savedTrackingToken, trackingHref } from "../src/utils/guestTracking.js";
import { fulfillmentActions } from "../src/utils/orderLifecycle.js";
import { rewardEligible } from "../src/utils/rewardEligibility.js";
import { submitPosOrder, retryPosOrder, pendingPosOrder } from "../src/utils/posOrderSubmission.js";
import { retryCustomerOrder, reconcileCustomerOrder } from "../src/utils/customerOrderSubmission.js";
import { submissionStorageKey } from "../src/utils/persistedSubmission.js";
test("catalog search/price/sort combines without mutating original catalog", () => {
  const items = [{ name: "Burger", price: 20 }, { name: "Burger combo", price: 30 }, { name: "Tea", price: 5 }];
  assert.deepEqual(filterMenu(items, { search: "burger", maximumPrice: "25", sort: "price-high" }).map(row => row.name), ["Burger"]);
  assert.deepEqual(filterMenu(items, { sort: "price-low" }).map(row => row.price), [5, 20, 30]);
  assert.equal(items[0].name, "Burger");
});
test("tracking links never carry bearer codes and retrieval is scoped to order number", () => {
  const values = new Map(); const storage = { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) };
  rememberTracking(storage, { orderNumber: "DG-123", trackingToken: "private-secret" });
  assert.equal(savedTrackingToken(storage, "DG-123"), "private-secret"); assert.equal(savedTrackingToken(storage, "OTHER"), "");
  assert.equal(trackingHref("DG-123"), "/menu?track=DG-123"); assert.ok(!trackingHref("DG-123").includes("private-secret"));
});
test("status controls expose valid handover and block captured POS cancellation and returned stock fulfillment", () => {
  assert.deepEqual(fulfillmentActions({ status: "ready", source: "pos", paymentStatus: "paid", orderType: "delivery" }), ["out-for-delivery"]);
  assert.deepEqual(fulfillmentActions({ status: "ready", orderType: "pickup" }), ["delivered", "cancelled", "failed"]);
  assert.deepEqual(fulfillmentActions({ status: "pending", inventoryStatus: "restored" }), ["cancelled", "failed"]);
  assert.deepEqual(fulfillmentActions({ status: "delivered" }), []);
});
test("reward eligibility respects server membership and expiry", () => {
  assert.equal(rewardEligible({ minimumTier: "Gold" }, { membership: { tier: "Bronze" } }), false);
  assert.equal(rewardEligible({ minimumTier: "Silver" }, { membership: { tier: "Gold" } }), true);
  assert.equal(rewardEligible({ expiresAt: "2000-01-01" }, {}), false);
});
test("unknown POS capture survives reload and cannot create a different sale or cross cashier/terminal", async () => {
  const map = new Map(); const storage = { setItem: (key, value) => map.set(key, value), getItem: key => map.get(key), removeItem: key => map.delete(key) };
  const payload = { idempotencyKey: "saved-pos-request", cashReceived: 20, items: [{ productId: "dish", quantity: 1 }] };
  await assert.rejects(submitPosOrder({ storage, actorId: "cashier", terminal: "MAIN", payload, send: async () => { throw new Error("lost response"); } }), /lost response/);
  assert.deepEqual(pendingPosOrder(storage, "cashier", "MAIN"), payload);
  assert.equal(pendingPosOrder(storage, "another", "MAIN"), null); assert.equal(pendingPosOrder(storage, "cashier", "OTHER"), null);
  assert.throws(() => submitPosOrder({ storage, actorId: "cashier", terminal: "MAIN", payload: { items: [] }, send: async () => assert.fail() }), /previous sale/);
  await retryPosOrder({ storage, actorId: "cashier", terminal: "MAIN", send: async body => { assert.deepEqual(body, payload); return {}; } });
  assert.equal(pendingPosOrder(storage, "cashier", "MAIN"), null);
});
test("a pre-phase customer attempt can be recovered with its exact legacy payload", async () => {
  const map = new Map(); const storage = { setItem: (key, value) => map.set(key, value), getItem: key => map.get(key), removeItem: key => map.delete(key) };
  const saved = { idempotencyKey: "original-legacy-key", items: [], orderType: "pickup" };
  storage.setItem(submissionStorageKey("customer-order", "guest"), JSON.stringify(saved));
  await retryCustomerOrder({ storage, send: async body => { assert.deepEqual(body, saved); return {}; } });
  assert.equal(map.size, 0);
});
test("reconciliation preserves unresolved details until server cancellation or existing order recovery", async () => {
  const map = new Map(); const storage = { setItem: (key, value) => map.set(key, value), getItem: key => map.get(key), removeItem: key => map.delete(key) };
  const key = submissionStorageKey("customer-order", "guest"); const saved = { idempotencyKey: "unknown-order-request", items: [] };
  storage.setItem(key, JSON.stringify(saved));
  await assert.rejects(reconcileCustomerOrder({ storage, send: async () => { throw new Error("Disconnected"); } }), /Disconnected/); assert.equal(map.size, 1);
  await assert.rejects(reconcileCustomerOrder({ storage, send: async () => ({}) }), /still unknown/); assert.equal(map.size, 1);
  await reconcileCustomerOrder({ storage, send: async body => { assert.deepEqual(body, saved); return { cancelled: true }; } }); assert.equal(map.size, 0);
  storage.setItem(key, JSON.stringify(saved));
  const result = await reconcileCustomerOrder({ storage, send: async () => ({ cancelled: false, data: { _id: "existing-order" } }) });
  assert.equal(result.data._id, "existing-order"); assert.equal(map.size, 0);
});
