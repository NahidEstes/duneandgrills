import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import Delivery from "../models/Delivery.js";
import { listWorkflowDeliveries } from "../services/deliveryReadService.js";
import { deliveryCashFacts, deliveryHealthPipeline, deliveryDelayThresholds } from "../services/deliveryHealthService.js";
import { serializeDelivery, eligibleDeliveryOrder, outstandingDeliveryHalala } from "../services/deliveryContractService.js";
import { startOfRiyadhDay, ADMIN_DAY_MS } from "../utils/adminDate.js";

test("cash display never treats a rider report or shortage acknowledgement as settlement", () => {
  assert.equal(deliveryCashFacts({}, 4000, true).cashState, "collection_pending");
  for (const status of ["unconfirmed", "discrepancy", "confirmed"]) {
    const row = deliveryCashFacts({ cashReport: { status, amountHalala: 3000, acknowledgedAt: new Date() } }, 4000, true);
    assert.equal(row.customerCollectionHalala, null); assert.equal(row.reportedCashHalala, 3000); assert.equal(row.ledgerOutstandingHalala, 4000);
  }
  assert.equal(deliveryCashFacts({}, null, true).cashState, "unavailable");
  assert.equal(deliveryCashFacts({}, 0, true).cashState, "no_collection");
  assert.equal(deliveryCashFacts({ cashReport: { status: "unconfirmed" } }, 100, true).cashState, "unavailable");
  assert.equal(deliveryCashFacts({}, 100, false).cashState, "unavailable");
});

test("server-wide delivery attention, cash summaries, filters and Riyadh boundaries in owned isolated Mongo", async t => {
  const keys = ["NODE_ENV", "MONGO_URI", "RIDER_WORKFLOW_ENABLED", "DELIVERY_PICKUP_DELAY_MINUTES", "DELIVERY_TRANSIT_DELAY_MINUTES"];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try { await withIsolatedMongo(async ({ uri }) => {
    assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:\d+\/dg_record_id_test\?/);
    Object.assign(process.env, { NODE_ENV: "test", MONGO_URI: uri, RIDER_WORKFLOW_ENABLED: "true", DELIVERY_PICKUP_DELAY_MINUTES: "15", DELIVERY_TRANSIT_DELAY_MINUTES: "45" });
    const actors = {};
    for (const role of ["admin", "manager", "cashier", "rider", "customer"]) actors[role] = await User.create({ name: `Test ${role}`, role, email: `${role}@management.invalid`, password: "DummyLocal123!" });
    const now = new Date(), old = new Date(now.getTime() - 60 * 60000), today = startOfRiyadhDay(now);
    let sequence = 0;
    const fixture = async (delivery = {}, order = {}) => {
      const record = await Order.create({ orderNumber: `TEST-MANAGEMENT-${++sequence}`, source: "website", orderType: "delivery", deliveryMode: "restaurant", status: "ready", readyAt: old,
        totalAmount: 40.01, subtotal: 40.01, paymentStatus: "pending", paymentRecords: [], inventoryStatus: "not_required",
        customer: { name: "Isolated customer", phone: "+0000000000" }, items: [{ menuItem: new mongoose.Types.ObjectId(), name: "Dummy item", quantity: 1, price: 40.01 }], ...order });
      return Delivery.create({ order: record._id, orderNumber: record.orderNumber, ...delivery });
    };
    for (let index = 0; index < 23; index++) await fixture();
    const delayed = await fixture({ status: "assigned", rider: actors.rider._id, assignedAt: old });
    await fixture({ status: "assigned", assignedAt: old }, { readyAt: now }); // Food just became ready: not delayed.
    await fixture({ status: "assigned", assignedAt: old }, { readyAt: undefined });
    await fixture({ status: "picked_up", pickedUpAt: old }, { status: "out-for-delivery" });
    await fixture({ status: "picked_up" }, { status: "out-for-delivery" });
    await fixture({ status: "issue", issue: { previousStatus: "assigned", reason: "Dummy unresolved issue", reportedAt: old } });
    await fixture({ status: "delivered", deliveredAt: old }, { status: "delivered" });
    await fixture({ status: "delivered", cashReport: { status: "unconfirmed", amountHalala: 4001, reportedAt: old } }, { status: "delivered" });
    await fixture({ status: "delivered", cashReport: { status: "discrepancy", amountHalala: 3001, reportedAt: old, acknowledgedAt: now } }, { status: "delivered" });
    await fixture({ status: "delivered", cashReport: { status: "confirmed", amountHalala: 4001, confirmedAt: today } }, { status: "delivered", paymentStatus: "paid" });
    await fixture({ status: "delivered", cashReport: { status: "confirmed", amountHalala: 4001, confirmedAt: new Date(today.getTime() - 1) } }, { status: "delivered", paymentStatus: "paid" });
    await fixture({ status: "delivered" }, { status: "delivered", paymentStatus: "paid" });
    await fixture({ status: "delivered" }, { status: "cancelled" });
    await t.test("attention covers all pages; clicked filters have the same count", async () => {
      const list = await listWorkflowDeliveries(actors.admin, { limit: 1 });
      assert.equal(list.deliveries.length, 1); assert.equal(list.health.attention.ready_unassigned, 23);
      assert.equal(list.health.attention.pickup_delayed, 1); assert.equal(list.health.attention.delivery_delayed, 1);
      assert.equal(list.health.attention.timing_unavailable, 2); assert.equal(list.health.attention.issue, 1);
      assert.equal(list.health.activeAttentionCount, 28);
      const active = await listWorkflowDeliveries(actors.admin, { workspace: "active", limit: 1 });
      assert.equal(active.pagination.total, 29); assert.equal(active.health.activeAttentionCount, 28);
      assert.equal((await listWorkflowDeliveries(actors.manager, { workspace: "active", attention: "needs_attention", limit: 1 })).pagination.total, 28);
      for (const workspace of ["cash", "history"]) {
        const completed = await listWorkflowDeliveries(actors.manager, { workspace, limit: 1 });
        assert.equal(completed.pagination.total, 7); assert.equal(completed.deliveries[0].deliveryStatus, "delivered");
      }
      await assert.rejects(listWorkflowDeliveries(actors.cashier, { workspace: "active" }), error => error.status === 403);
      assert.equal(list.health.attention.no_cash_report, 1); assert.equal(list.health.attention.awaiting_cash, 1); assert.equal(list.health.attention.discrepancy, 1);
      for (const [attention, count] of Object.entries(list.health.attention)) assert.equal((await listWorkflowDeliveries(actors.manager, { attention, limit: 1 })).pagination.total, count);
      const page2 = await listWorkflowDeliveries(actors.admin, { attention: "ready_unassigned", page: 2, limit: 20 });
      assert.equal(page2.deliveries.length, 3); assert.equal(page2.health.attention.ready_unassigned, 23);
      const before = list.health.attention;
      await Delivery.updateOne({ _id: delayed._id }, { $set: { updatedAt: new Date(), pickupInstructions: "Unrelated edit" } });
      assert.deepEqual((await listWorkflowDeliveries(actors.admin)).health.attention, before);
    });
    await t.test("cash amounts are integer halala, scoped, separately reported and not double-counted", async () => {
      const list = await listWorkflowDeliveries(actors.admin);
      assert.equal(list.health.cash.awaiting_confirmation.amountHalala, 4001); assert.equal(list.health.cash.discrepancy.amountHalala, 3001);
      assert.equal(list.health.cash.discrepancy.ledgerOutstandingHalala, 4001); assert.equal(list.health.confirmedToday.amountHalala, 4001);
      assert.equal(list.health.deliveredCash.collection_pending.count, 1); assert.equal(list.health.deliveredCash.collection_pending.amountHalala, 4001);
      assert.ok(list.health.cash.collection_pending.count > list.health.deliveredCash.collection_pending.count);
      for (const [cashStatus, count] of Object.entries(list.health.deliveredCash)) assert.equal((await listWorkflowDeliveries(actors.manager, { workspace: "cash", cashStatus, limit: 1 })).pagination.total, count.count);
      assert.equal(list.health.confirmedToday.count, 1);
      assert.equal((await listWorkflowDeliveries(actors.admin, { cashStatus: "confirmed_today" })).pagination.total, 1);
      const reported = await listWorkflowDeliveries(actors.admin, { cashStatus: "awaiting_confirmation" });
      assert.equal(reported.deliveries[0].customerCollectionHalala, null); assert.equal(reported.deliveries[0].amountToCollect, 40.01);
      const cashier = await listWorkflowDeliveries(actors.cashier);
      assert.equal(cashier.pagination.total, 4); assert.equal(cashier.health.cash.collection_pending.count, 0); assert.equal(cashier.health.attention.ready_unassigned, 0);
      assert.ok(cashier.deliveries.every(row => row.customerName === "Completed delivery"));
      const rider = await listWorkflowDeliveries(actors.rider);
      assert.equal(rider.deliveries.length, 1); assert.equal(rider.health, undefined);
      await assert.rejects(listWorkflowDeliveries(actors.customer), /denied/i);
      await assert.rejects(listWorkflowDeliveries(null), /denied/i);
      for (const query of [{ attention: "invented" }, { cashStatus: "invented" }, { riderId: "forged" }]) await assert.rejects(listWorkflowDeliveries(actors.admin, query), /Invalid|Unsupported/);
      await assert.rejects(listWorkflowDeliveries(actors.rider, { cashStatus: "confirmed" }), /require delivery history/);
    });
    await t.test("Mongo read facts match authoritative contract including rounding and legacy/invalid balances", async () => {
      for (const order of [{ totalAmount: 0.29 }, { totalAmount: 1.005 }, { paymentRecords: [{ amount: 10.01 }] }, { paymentStatus: "refunded" }, { paymentStatus: "partially_refunded" }, { paymentStatus: "failed" }, { status: "cancelled" }, { restoredItemQuantities: { one: 1 } }]) await fixture({}, order);
      const legacy = await fixture(); // Deliberately corrupt this isolated fixture only; schema rejects new negative values.
      await Order.collection.updateOne({ _id: legacy.order }, { $set: { totalAmount: -1 } });
      const jobs = await Delivery.find().lean(), orders = await Order.find().lean();
      const projected = await Delivery.aggregate([{ $lookup: { from: "orders", localField: "order", foreignField: "_id", as: "orderRecord" } }, { $unwind: "$orderRecord" }, ...deliveryHealthPipeline(now).stages]);
      for (const row of projected) {
        const order = orders.find(order => String(order._id) === String(row.order));
        const job = jobs.find(job => String(job._id) === String(row._id));
        assert.equal(row.healthEligible, eligibleDeliveryOrder(order), order.orderNumber);
        assert.equal(row.healthBalance, outstandingDeliveryHalala(order), order.orderNumber);
        assert.equal(row.healthCash, serializeDelivery(job, order).cashState, order.orderNumber);
      }
    });
    await t.test("exact delay and Riyadh year/midnight boundaries are inclusive/exclusive", async () => {
      const fixedNow = new Date("2026-12-31T21:01:00Z"), health = deliveryHealthPipeline(fixedNow);
      const boundary = new Date(fixedNow.getTime() - 15 * 60000);
      const cases = [
        await fixture({ status: "assigned", assignedAt: boundary }, { readyAt: boundary }),
        await fixture({ status: "assigned", assignedAt: boundary }, { readyAt: new Date(boundary.getTime() + 1) }),
        await fixture({ status: "picked_up", pickedUpAt: new Date(fixedNow.getTime() - 45 * 60000) }),
        await fixture({ status: "delivered", cashReport: { status: "confirmed", amountHalala: 4001, confirmedAt: health.today } }, { status: "delivered", paymentStatus: "paid" }),
        await fixture({ status: "delivered", cashReport: { status: "confirmed", amountHalala: 4001, confirmedAt: new Date(health.today.getTime() - 1) } }, { status: "delivered", paymentStatus: "paid" }),
        await fixture({ status: "delivered", cashReport: { status: "confirmed", amountHalala: 4001, confirmedAt: health.tomorrow } }, { status: "delivered", paymentStatus: "paid" }),
      ];
      const rows = await Delivery.aggregate([{ $match: { _id: { $in: cases.map(row => row._id) } } }, { $lookup: { from: "orders", localField: "order", foreignField: "_id", as: "orderRecord" } }, { $unwind: "$orderRecord" }, ...health.stages]);
      const find = index => rows.find(row => String(row._id) === String(cases[index]._id));
      assert.equal(find(0).attentionFlags.pickup_delayed, true); assert.equal(find(1).attentionFlags.pickup_delayed, false); assert.equal(find(2).attentionFlags.delivery_delayed, true);
      assert.deepEqual(rows.filter(row => row.healthCash === "confirmed" && row.cashReport.confirmedAt >= health.today && row.cashReport.confirmedAt < health.tomorrow).map(row => String(row._id)), [String(cases[3]._id)]);
    });
    await t.test("configured thresholds and confirmation periods use Riyadh midnight/year boundary", () => {
      const fixed = deliveryHealthPipeline(new Date("2026-12-31T21:01:00Z"));
      assert.equal(fixed.today.toISOString(), "2026-12-31T21:00:00.000Z"); assert.equal(fixed.tomorrow - fixed.today, ADMIN_DAY_MS);
      process.env.DELIVERY_PICKUP_DELAY_MINUTES = "25"; assert.equal(deliveryDelayThresholds().pickupMinutes, 25);
      process.env.DELIVERY_PICKUP_DELAY_MINUTES = "0"; assert.throws(deliveryDelayThresholds, /1 to 1440/);
    });
  }); } finally { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
});
