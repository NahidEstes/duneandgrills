import assert from "node:assert/strict";
import { test } from "node:test";
import { receiptSubmission, receiptStorageKey, receiptCanBeCorrected } from "../src/components/inventory/purchaseReceiptSubmission.js";

const row = (selected, quantity) => ({ selected, quantity, brand: "Actual", lotNumber: " LOT-A ", receivedAt: "", expiryDate: "2099-01-01", notes: "", overrideReason: "" });
test("only selected delivered lines are submitted, never unselected zero quantities", () => {
  const payload = receiptSubmission({ a: row(true, "2.5"), b: row(false, 0) }, "partial", "stable-key");
  assert.equal(payload.items.length, 1); assert.equal(payload.items[0].lineId, "a"); assert.equal(payload.items[0].quantity, 2.5); assert.equal(payload.items[0].lotNumber, "LOT-A"); assert.equal(payload.items[0].expiryDate, "2099-01-01"); assert.equal(payload.idempotencyKey, "stable-key");
});
test("empty, zero and invalid selected receipts reject", () => {
  assert.throws(() => receiptSubmission({ a: row(false, 0) }, "", "key"), /Select/);
  for (const quantity of [0, -1, "bad"]) assert.throws(() => receiptSubmission({ a: row(true, quantity) }, "", "key"), /greater than zero/);
});
test("retries retain exact persisted payload/key and are scoped by actor and PO", () => {
  const payload = receiptSubmission({ a: row(true, 1) }, "", "key");
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), payload);
  assert.notEqual(receiptStorageKey("po", "a"), receiptStorageKey("po", "b")); assert.notEqual(receiptStorageKey("a", "actor"), receiptStorageKey("b", "actor"));
});
test("only definite validation errors permit correcting a receipt; timeout/5xx/conflict retain original key", () => {
  for (const status of [400, 422]) assert.equal(receiptCanBeCorrected({ response: { status } }), true);
  for (const status of [409, 500, 503, undefined]) assert.equal(receiptCanBeCorrected({ response: { status } }), false);
  assert.equal(receiptCanBeCorrected(new Error("timeout")), false);
});
