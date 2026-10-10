import test from "node:test";
import assert from "node:assert/strict";
import { submitCustomerOrder } from "../src/utils/customerOrderSubmission.js";

const storage = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
const payload = { items: [{ productId: "dish", quantity: 1 }], customer: { name: "Customer", phone: "0500000000" }, orderType: "pickup" };

test("a lost response and new caller reuse one persisted request; success clears it", async () => {
  const saved = storage(); const sent = [];
  await assert.rejects(submitCustomerOrder({ storage: saved, actorId: "customer", payload, createKey: () => "original", send: async value => { sent.push(value); throw new Error("lost response"); } }));
  await submitCustomerOrder({ storage: saved, actorId: "customer", payload, createKey: () => "unused", send: async value => { sent.push(value); return {}; } });
  assert.deepEqual(sent[0], sent[1]);
  await submitCustomerOrder({ storage: saved, actorId: "customer", payload, createKey: () => "next-order", send: async value => { sent.push(value); return {}; } });
  assert.equal(sent[2].idempotencyKey, "next-order");
});

test("unknown outcome cannot silently submit a changed cart or another customer's request", async () => {
  const saved = storage(); let calls = 0;
  await assert.rejects(submitCustomerOrder({ storage: saved, actorId: "one", payload, createKey: () => "first", send: async () => { throw new Error("offline"); } }));
  assert.throws(() => submitCustomerOrder({ storage: saved, actorId: "one", payload: { ...payload, orderType: "delivery" }, send: async () => { calls++; } }), /previous order outcome is unknown/);
  await submitCustomerOrder({ storage: saved, actorId: "two", payload, createKey: () => "second", send: async request => { calls++; assert.equal(request.idempotencyKey, "second"); } });
  assert.equal(calls, 1);
});

test("validation failure allows a corrected submission while server errors retain identity", async () => {
  const saved = storage();
  await assert.rejects(submitCustomerOrder({ storage: saved, actorId: "one", payload, createKey: () => "bad", send: async () => { throw { response: { status: 400 } }; } }));
  await submitCustomerOrder({ storage: saved, actorId: "one", payload: { ...payload, orderType: "delivery" }, createKey: () => "corrected", send: async value => assert.equal(value.idempotencyKey, "corrected") });
});
