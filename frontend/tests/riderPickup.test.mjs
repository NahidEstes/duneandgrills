import test from "node:test";
import assert from "node:assert/strict";
import { riderPickupState, riderFoodStatus, riderAmount } from "../src/components/rider/riderPickup.js";
import { deliveryFingerprint } from "../src/components/rider/riderPresentation.js";
import { customerPhoneHref, customerMapHref, createDeliverySubmission } from "../src/components/rider/deliveryPresentation.js";

const context = { userId: "own-rider", role: "rider" };
const ready = { id: "own-delivery", riderId: "own-rider", mode: "operational", canOperate: true, restaurantStatus: "ready", deliveryStatus: "assigned", revision: 2, orderRevision: 4 };

test("pickup requires an eligible Ready order assigned to this rider in an authorized mode", () => {
  assert.equal(riderPickupState(ready, context).allowed, true);
  for (const changes of [{ riderId: "another-rider" }, { canOperate: false }, { restaurantStatus: "pending" }, { restaurantStatus: "confirmed" }, { restaurantStatus: "preparing" }, { restaurantStatus: "out-for-delivery" }, { deliveryStatus: "picked_up" }, { deliveryStatus: "delivered" }, { deliveryStatus: "issue" }, { revision: undefined }, { orderRevision: -1 }, { mode: "disabled" }]) {
    const state = riderPickupState({ ...ready, ...changes }, context);
    assert.equal(state.allowed, false, JSON.stringify(changes)); assert.ok(state.reason);
  }
  assert.equal(riderPickupState(ready, { ...context, role: "admin" }).allowed, false);
  assert.equal(riderPickupState({ ...ready, mode: "rehearsal" }, context).allowed, false);
  assert.equal(riderPickupState({ ...ready, mode: "rehearsal" }, { ...context, rehearsal: true }).allowed, true);
});

test("preview, offline, pending, loading, stale and refresh states fail closed with an explanation", () => {
  for (const flag of ["preview", "offline", "pending", "loading", "refreshing", "error", "reviewRequired"]) {
    const state = riderPickupState(ready, { ...context, [flag]: true });
    assert.equal(state.allowed, false, flag); assert.ok(state.reason.length > 10);
  }
  assert.equal(riderPickupState(null, context).allowed, false);
});

test("confirmation is invalidated by kitchen status and assignment changes, even with a legacy unchanged revision", () => {
  assert.notEqual(deliveryFingerprint(ready), deliveryFingerprint({ ...ready, restaurantStatus: "preparing" }));
  assert.notEqual(deliveryFingerprint(ready), deliveryFingerprint({ ...ready, riderId: "another-rider" }));
  assert.notEqual(deliveryFingerprint(ready), deliveryFingerprint({ ...ready, orderRevision: 5 }));
  assert.notEqual(deliveryFingerprint(ready), deliveryFingerprint({ ...ready, deliveryStatus: "picked_up" }));
  assert.equal(riderFoodStatus(ready).title, "Food ready for pickup");
  assert.match(riderFoodStatus({ ...ready, restaurantStatus: "preparing" }).title, /prepared/);
  assert.equal(riderFoodStatus({ ...ready, deliveryStatus: "delivered", restaurantStatus: "out-for-delivery" }).title, "Delivery completed");
});

test("unknown totals never become zero and invalid contact data cannot generate call/map links", () => {
  for (const value of [undefined, null, NaN, Infinity, -1, "42"]) assert.equal(riderAmount(value), "Amount unavailable");
  assert.match(riderAmount(0), /0\.00/); assert.match(riderAmount(42), /42\.00/);
  for (const phone of [undefined, "", "+------", "123---", "javascript:alert(1)", "+966/501234567"]) assert.equal(customerPhoneHref(phone), null);
  assert.equal(customerPhoneHref("+966 50 123 4567"), "tel:+966501234567");
  assert.equal(customerMapHref("   "), null);
  assert.equal(customerMapHref(null), null);
  assert.match(customerMapHref("Saved address & location"), /^https:\/\/www\.google\.com\/maps\/search\//);
});

test("pickup double clicks are bounded and explicit uncertain retries retain their original key and revisions", async () => {
  const submit = createDeliverySubmission(); const keys = []; let release;
  const payload = { expectedRevision: 2, expectedOrderRevision: 4 };
  const first = submit("pickup", payload, body => { keys.push(body); return new Promise(resolve => { release = resolve; }); });
  await assert.rejects(submit("pickup", payload, () => { throw new Error("Should not send"); }), /already running/);
  assert.equal(keys.length, 1); release({ success: true, status: "picked_up" }); await first;
  const fail = body => { keys.push(body); throw new Error("unknown network outcome"); };
  await assert.rejects(submit("pickup", payload, fail), /unknown network/);
  await submit("pickup", payload, body => { keys.push(body); return { success: true, duplicate: true, status: "picked_up" }; });
  assert.deepEqual(keys[1], keys[2]);
  assert.equal(keys[2].expectedOrderRevision, 4);
  const before = keys.length;
  await assert.rejects(submit("pickup", payload, fail, false), /offline/); assert.equal(keys.length, before);
});
