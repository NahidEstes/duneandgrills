import test from "node:test";
import assert from "node:assert/strict";
import { managementDeliveryQuery, activeAttentionMatch } from "../services/deliveryQueryService.js";

test("active scope includes all-time unfinished deliveries; cash and history are completed only", () => {
  const active = managementDeliveryQuery({ role: "manager" }, { workspace: "active" });
  assert.deepEqual(active.match.status, { $ne: "delivered" }); assert.equal(active.match.createdAt, undefined);
  for (const workspace of ["cash", "history"]) assert.equal(managementDeliveryQuery({ role: "manager" }, { workspace }).match.status, "delivered");
  assert.throws(() => managementDeliveryQuery({ role: "cashier" }, { workspace: "active" }), error => error.status === 403);
  assert.equal(managementDeliveryQuery({ role: "cashier" }, { workspace: "cash" }).match.status, "delivered");
  assert.throws(() => managementDeliveryQuery({ role: "manager" }, { workspace: "fake" }));
});

test("stage sort cannot override the workspace; completion sorting uses recorded completion time", () => {
  const contradictory = managementDeliveryQuery({ role: "manager" }, { workspace: "history", sort: "assigned_longest" });
  assert.equal(contradictory.match.status, "delivered"); assert.equal(contradictory.match.$and[0].status, "assigned");
  const recent = managementDeliveryQuery({ role: "cashier" }, { workspace: "cash", sort: "delivered_newest" });
  assert.equal(recent.stages[0].$set.managementSortClock, "$deliveredAt"); assert.equal(recent.stages[2].$sort.managementSortClock, -1);
  assert.equal(managementDeliveryQuery({ role: "manager" }, { sort: "delivered_oldest" }).stages[2].$sort.managementSortClock, 1);
});

test("Needs Attention is a unique union of active conditions, excluding completed cash alerts", () => {
  const match = activeAttentionMatch();
  const keys = match.$or.map(condition => Object.keys(condition)[0].split(".")[1]);
  assert.deepEqual(keys, ["ready_unassigned", "pickup_delayed", "delivery_delayed", "issue", "timing_unavailable"]);
  const records = [{ status: "picked_up", flags: ["delivery_delayed", "timing_unavailable"] }, { status: "issue", flags: ["issue"] }, { status: "delivered", flags: ["awaiting_cash"] }, { status: "assigned", flags: [] }];
  const union = records.filter(row => row.status !== match.status.$ne && match.$or.some(condition => row.flags.includes(Object.keys(condition)[0].split(".")[1])));
  assert.equal(union.length, 2); // Not three from summing the overlapping condition counts.
});
