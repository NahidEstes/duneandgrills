import test from "node:test";
import assert from "node:assert/strict";
import { riderCompletionAction, riderCashReceipt, riyadhRecordedTime } from "../src/components/rider/riderCompletion.js";
import { deliveryFingerprint } from "../src/components/rider/riderPresentation.js";
import { createDeliverySubmission } from "../src/components/rider/deliveryPresentation.js";

const context = { userId: "own", role: "rider" };
const transit = { id: "delivery", riderId: "own", mode: "operational", canOperate: true, revision: 2, orderRevision: 4, deliveryStatus: "picked_up", restaurantStatus: "out-for-delivery" };
const completed = { ...transit, deliveryStatus: "delivered", restaurantStatus: "delivered", cashState: "collection_pending", customerCollectionHalala: 4200, cashReport: { status: "none" } };

test("completion requires both real stages, own rider, valid revisions and authorized mode", () => {
  assert.equal(riderCompletionAction(transit, "deliver", context).allowed, true);
  for (const change of [{ riderId: "other" }, { revision: -1 }, { orderRevision: undefined }, { canOperate: false }, { deliveryStatus: "assigned" }, { deliveryStatus: "issue" }, { deliveryStatus: "delivered" }, { restaurantStatus: "ready" }, { restaurantStatus: "delivered" }, { mode: "preview" }]) assert.equal(riderCompletionAction({ ...transit, ...change }, "deliver", context).allowed, false);
  for (const flag of ["preview", "admin", "pending", "awaitingUpdate", "offline", "refreshing", "error", "reviewRequired", "loading"]) assert.equal(riderCompletionAction(transit, "deliver", { ...context, [flag]: true }).allowed, false, flag);
  assert.equal(riderCompletionAction(transit, "deliver", { ...context, role: "cashier" }).allowed, false);
  assert.equal(riderCompletionAction({ ...transit, mode: "rehearsal" }, "deliver", context).allowed, false);
  assert.equal(riderCompletionAction({ ...transit, mode: "rehearsal" }, "deliver", { ...context, rehearsal: true }).allowed, true);
});

test("cash reporting is once only, after delivery, with authoritative positive balance and a valid explanation", () => {
  const cash = payload => riderCompletionAction(completed, "report_cash", context, payload);
  assert.equal(cash({ amount: "42.00" }).allowed, true);
  assert.equal(cash({ amount: "0", reason: "No cash received" }).allowed, true);
  assert.equal(cash({ amount: "32.10", reason: "Shortage" }).allowed, true);
  for (const payload of [{ amount: "42.001" }, { amount: "43" }, { amount: "-1" }, { amount: "" }, { amount: "32" }, { amount: "0" }, { amount: "42", reason: "a".repeat(501) }]) assert.equal(cash(payload).allowed, false);
  for (const change of [{ deliveryStatus: "picked_up" }, { customerCollectionHalala: null }, { customerCollectionHalala: 0 }, { cashState: "no_collection" }, { cashReport: { status: "unconfirmed" } }, { cashReport: { status: "discrepancy" } }, { cashReport: { status: "confirmed" } }, { cashReport: null }]) assert.equal(riderCompletionAction({ ...completed, ...change }, "report_cash", context, { amount: "42" }).allowed, false);
});

test("issue confirmation requires active stage and a nonempty private explanation", () => {
  assert.equal(riderCompletionAction(transit, "issue", context, { reason: "Road blocked" }).allowed, true);
  for (const reason of ["", "  ", "a".repeat(501)]) assert.equal(riderCompletionAction(transit, "issue", context, { reason }).allowed, false);
  assert.equal(riderCompletionAction(completed, "issue", context, { reason: "Road blocked" }).allowed, false);
});

test("reported and confirmed status come only from server records, even when a later refund requires review", () => {
  assert.equal(riderCashReceipt(completed).label, "Cash report pending");
  assert.equal(riderCashReceipt({ ...completed, cashState: "no_collection" }).recorded, false);
  assert.match(riderCashReceipt({ ...completed, cashState: "unavailable" }).label, /unavailable/);
  for (const [status, label] of [["unconfirmed", "Reported · Awaiting cashier confirmation"], ["discrepancy", "Discrepancy · Requires review"], ["confirmed", "Cashier confirmed"]]) {
    const receipt = riderCashReceipt({ ...completed, cashState: "unavailable", cashReport: { status } });
    assert.equal(receipt.recorded, true); assert.equal(receipt.label, label);
  }
  assert.equal(riyadhRecordedTime(null), "Time not recorded"); assert.equal(riyadhRecordedTime("invalid"), "Time not recorded");
  assert.match(riyadhRecordedTime("2026-10-14T21:05:00Z"), /15\/10\/2026, 00:05:00 Riyadh/);
  assert.notEqual(deliveryFingerprint(completed), deliveryFingerprint({ ...completed, cashReport: { status: "unconfirmed", amount: 42 } }));
});

test("cash retries recover the exact original request, never a second collection", async () => {
  const submit = createDeliverySubmission(), payload = { expectedRevision: 3, expectedOrderRevision: 5, amount: "42.00", reason: "" }, sent = [];
  await assert.rejects(submit("report_cash", payload, async body => { sent.push(body); throw new Error("Uncertain response"); }), /Uncertain/);
  await submit("report_cash", payload, async body => { sent.push(body); return { success: true, duplicate: true }; });
  assert.deepEqual(sent[0], sent[1]);
});
