import assert from "node:assert/strict";
import { test } from "node:test";
import { pendingSubmission, submissionStorageKey, submitPersisted } from "../src/utils/persistedSubmission.js";

const storage = () => {
  const entries = new Map();
  return { getItem: key => entries.get(key) || null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
};
test("lost payment response / reopened form retries the original payload and key", async () => {
  const local = storage(), key = submissionStorageKey("supplier-payment", "actor", "invoice");
  let committed, writes = 0;
  await assert.rejects(submitPersisted({ storage: local, key, payload: { amount: 25 }, createKey: () => "first", send: async body => { committed = body; writes++; throw new Error("Response lost after commit"); } }));
  assert.equal(pendingSubmission(local, key).amount, 25);
  await submitPersisted({ storage: local, key, payload: { amount: 75 }, createKey: () => "wrong-new-key", send: async body => { assert.deepEqual(body, committed); return { duplicate: true }; } });
  assert.equal(writes, 1); assert.equal(pendingSubmission(local, key), null);
});
test("network/5xx/conflict retains pending details; definite validation failure releases key", async () => {
  const local = storage();
  for (const status of [undefined, 500, 409]) {
    await assert.rejects(submitPersisted({ storage: local, key: "k", payload: { amount: 10 }, createKey: () => "stable", send: async () => { throw { response: { status } }; } }));
    assert.equal(pendingSubmission(local, "k").idempotencyKey, "stable");
  }
  await assert.rejects(submitPersisted({ storage: local, key: "k", send: async () => { throw { response: { status: 400 } }; } }));
  assert.equal(pendingSubmission(local, "k"), null);
});
test("unavailable or corrupted storage fails closed without making a financial write", async () => {
  let writes = 0; const send = async () => writes++;
  await assert.rejects(submitPersisted({ storage: { getItem: () => null, setItem() { throw new Error("Blocked"); } }, key: "k", payload: {}, send }));
  const local = storage(); local.setItem("k", "{broken");
  await assert.rejects(submitPersisted({ storage: local, key: "k", payload: {}, send }), /unreadable/);
  assert.equal(writes, 0);
});
test("saved financial requests are isolated by actor and invoice", () => {
  assert.notEqual(submissionStorageKey("supplier-payment", "a", "one"), submissionStorageKey("supplier-payment", "b", "one"));
  assert.notEqual(submissionStorageKey("supplier-payment", "a", "one"), submissionStorageKey("supplier-payment", "a", "two"));
});
