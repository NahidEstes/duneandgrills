import mongoose from "mongoose";
import Order from "../models/Order.js";
import PosShift from "../models/PosShift.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { calculateOrderPoints } from "../config/rewards.js";
import { OrderEngineError, orderText } from "../config/orderContract.js";
import { creditOrderPoints } from "./rewardService.js";
import { runInventoryTransaction } from "./inventoryStockService.js";
import { recordAuditLog } from "./auditLogService.js";
import { reverseRefundRewards } from "./refundRestorationService.js";
import { findOpenShift, recordPosCashSale } from "./posShiftService.js";

export const awardCompletedOrderPoints = async (order, session) => {
  if (!order.user || order.status !== "delivered" || !["paid", "partially_refunded"].includes(order.paymentStatus) || order.pointsAwardedAt || order.pointsReversedAt) return;
  const points = calculateOrderPoints(order.eligiblePointsAmount ?? order.totalAmount);
  if (await creditOrderPoints({ userId: order.user, orderId: order._id, orderNumber: order.orderNumber, points, session })) {
    order.pointsEarned = points; order.pointsAwardedAt = new Date();
    if (order.refundedAmountHalala > 0) await reverseRefundRewards({ order, refundedHalala: order.refundedAmountHalala, reference: `completion:${order._id}`, session });
  }
};

// Records money actually collected at handover; never simulates a gateway charge.
export const recordOrderPayment = async ({ orderId, actor, payload, correlationId }) => {
  if (!actor || !hasCapability(actor.role, CAPABILITIES.ORDERS_HANDOFF) || actor.role === "kitchen") throw new OrderEngineError("Not authorized to collect order payments", 403);
  if (!mongoose.isValidObjectId(orderId)) throw new OrderEngineError("Invalid order id");
  const key = orderText(payload.idempotencyKey, "Payment request identifier", 120);
  const reference = orderText(payload.reference, "Payment reference", 160);
  const terminal = orderText(payload.terminal, "Collection terminal", 60);
  if (!/^[A-Za-z0-9._:-]{16,120}$/.test(key)) throw new OrderEngineError("A unique payment request identifier is required");
  if (!["cash", "card", "other"].includes(payload.method)) throw new OrderEngineError("Invalid collected payment method");
  if (payload.method !== "cash" && !reference) throw new OrderEngineError("A payment terminal or manual payment reference is required");
  return runInventoryTransaction(async session => {
    if (!session) throw new OrderEngineError("Payment recording requires a replica set", 503);
    const order = await Order.findById(orderId).session(session);
    if (!order || order.manualEntry) throw new OrderEngineError("Live order not found", 404);
    const amount = Number(payload.amount);
    const previous = order.paymentRecords.find(row => row.key === key);
    if (previous) {
      if (previous.method !== payload.method || previous.reference !== reference || previous.amount !== amount) throw new OrderEngineError("Payment identifier was used with different contents", 409);
      return { order, duplicate: true };
    }
    if (!["ready", "out-for-delivery", "delivered"].includes(order.status) || !["pending", "unpaid"].includes(order.paymentStatus)) throw new OrderEngineError("Payment is already recorded or order is not ready for collection", 409);
    if (!Number.isFinite(amount) || Math.round(amount * 100) !== Math.round(order.totalAmount * 100)) throw new OrderEngineError("Collected amount must equal the order total");
    order.paymentStatus = "paid"; order.paymentMethod = payload.method;
    if (payload.method === "cash") {
      if (!terminal && await PosShift.countDocuments({ cashier: actor._id, isOpen: true }).session(session) > 1) throw new OrderEngineError("Choose the collection terminal when multiple cash drawers are open");
      const shift = await findOpenShift({ cashier: actor._id, terminal: terminal || null }, session);
      if (terminal && !shift) throw new OrderEngineError("Open a shift on the selected collection terminal before recording cash");
      if (shift) { order.posShift = shift._id; await recordPosCashSale({ shift, order, actor, session }); }
    }
    order.paymentRecords.push({ key, method: payload.method, reference, amount, recordedBy: actor._id, recordedAt: new Date() });
    await awardCompletedOrderPoints(order, session);
    await order.save({ session });
    await recordAuditLog({ actor, action: "ORDER_PAYMENT_COLLECTED", entityType: "Order", entityId: order._id, entityLabel: order.orderNumber, correlationId, after: { paymentStatus: "paid", amount, method: payload.method, reference } }, { session });
    return { order, duplicate: false };
  });
};
