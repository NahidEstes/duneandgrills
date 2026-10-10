import assert from "node:assert/strict";
import test from "node:test";
import Order from "../models/Order.js";
import { orderContract, resolveOrderInput, resolveOrderTransition, resolveFulfillmentStatus } from "../config/orderContract.js";
import { persistOrderWithInventory, transitionOrderInSession } from "../services/orderEngineService.js";

test("canonical fields derive from legacy orders without a backfill or duplicate state", () => {
  for (const [source, channel] of [[undefined, "customer"], ["website", "customer"], ["pos", "pos"], ["phone", "admin"], ["jahez", "admin"]]) {
    assert.equal(orderContract({ source }).sourceChannel, channel);
  }
  for (const [orderType, type] of [["delivery", "delivery"], ["pickup", "pickup"], ["takeaway", "pickup"], ["dine-in", "dine_in"]]) {
    const order = new Order({ source: "pos", orderType, status: "ready" });
    assert.equal(order.fulfillmentType, type);
    assert.equal(order.toJSON().fulfillmentStatus, "ready");
  }
});

test("canonical and legacy input reconcile, and conflicting/spoofed fields fail", () => {
  assert.equal(resolveOrderInput({ fulfillmentType: "pickup" }, "pos").orderType, "takeaway");
  assert.equal(resolveOrderInput({ fulfillmentType: "dine_in" }, "customer").orderType, "dine-in");
  assert.equal(resolveOrderInput({ orderType: "takeaway" }, "customer").orderType, "takeaway");
  for (const body of [{ sourceChannel: "admin" }, { fulfillmentType: "bad" }, { orderType: "delivery", fulfillmentType: "pickup" }, { status: "delivered" }, { paymentStatus: "paid" }, { inventoryStatus: "deducted" }]) {
    assert.throws(() => resolveOrderInput(body, "customer"));
  }
  assert.throws(() => resolveOrderInput({ kitchenNotes: "x".repeat(501) }, "customer"));
  assert.equal(resolveFulfillmentStatus({ fulfillmentStatus: "confirmed" }), "confirmed");
  assert.throws(() => resolveFulfillmentStatus({ status: "ready", fulfillmentStatus: "delivered" }));
  assert.throws(() => resolveFulfillmentStatus({ status: "", fulfillmentStatus: "confirmed" }));
  assert.throws(() => resolveFulfillmentStatus({ status: "confirmed", paymentStatus: "paid" }));
  assert.throws(() => resolveOrderInput(null, "customer"));
});

test("transition matrix blocks skips, regressions, terminal reactivation and wrong handoff", () => {
  const order = (status, orderType = "delivery", extra = {}) => ({ status, orderType, ...extra });
  for (const [from, to] of [["pending", "confirmed"], ["confirmed", "preparing"], ["preparing", "ready"], ["ready", "out-for-delivery"], ["out-for-delivery", "delivered"]]) {
    assert.equal(resolveOrderTransition(order(from), to).duplicate, false);
  }
  assert.equal(resolveOrderTransition(order("ready", "takeaway"), "delivered").duplicate, false);
  for (const [from, to] of [["pending", "ready"], ["pending", "preparing"], ["confirmed", "delivered"], ["ready", "delivered"], ["preparing", "confirmed"], ["cancelled", "confirmed"], ["delivered", "failed"], ["failed", "pending"]]) {
    assert.throws(() => resolveOrderTransition(order(from), to), { status: 409 });
  }
  assert.throws(() => resolveOrderTransition(order("ready", "pickup"), "out-for-delivery"), { status: 409 });
  assert.throws(() => resolveOrderTransition(order("pending", "delivery", { manualEntry: true }), "confirmed"), { status: 409 });
  assert.throws(() => resolveOrderTransition(order("ready"), "out-for-delivery", "kitchen"));
  assert.throws(() => resolveOrderTransition(order("pending", "takeaway", { source: "pos", paymentStatus: "paid" }), "cancelled"));
  assert.equal(resolveOrderTransition(order("confirmed"), "confirmed").duplicate, true);
});

test("no transaction means no order or fulfillment writes, even with development fallback", async () => {
  await assert.rejects(persistOrderWithInventory({ fields: {}, catalogLines: [], session: null }), { status: 503 });
  await assert.rejects(transitionOrderInSession({ orderId: "000000000000000000000001", actor: { role: "admin" }, nextStatus: "confirmed", session: null }), { status: 503 });
});
