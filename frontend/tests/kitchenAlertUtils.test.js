import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeAcknowledgedKitchenOrderIds,
  pendingKitchenOrderIds,
  unacknowledgedKitchenOrderIds,
} from "../src/components/kitchen/kitchenAlertUtils.js";

const orders = [
  { _id: "new-1", status: "pending" },
  { _id: "new-2", status: "pending" },
  { _id: "accepted-1", status: "confirmed" },
];

test("only pending kitchen orders trigger alerts", () => {
  assert.deepEqual(pendingKitchenOrderIds(orders), ["new-1", "new-2"]);
});

test("acknowledged orders do not produce duplicate alerts", () => {
  assert.deepEqual(unacknowledgedKitchenOrderIds(orders, ["new-1"]), ["new-2"]);
  assert.deepEqual(unacknowledgedKitchenOrderIds(orders, ["new-1", "new-2"]), []);
});

test("acknowledgement storage is deduplicated and bounded", () => {
  assert.deepEqual(mergeAcknowledgedKitchenOrderIds(["new-1"], ["new-1", "new-2"]), ["new-1", "new-2"]);
  assert.deepEqual(mergeAcknowledgedKitchenOrderIds(["one", "two"], ["three"], 2), ["two", "three"]);
});
