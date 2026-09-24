import Order from "../models/Order.js";
import Refund from "../models/Refund.js";
import { recordAuditLog } from "./auditLogService.js";
import { runInventoryTransaction } from "./inventoryStockService.js";
import { fromHalala, positiveHalala, toHalala } from "../utils/money.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { recordRefundCashMovement } from "./posShiftService.js";

const RESERVED_STATUSES = ["requested", "approved", "processing", "completed"];

const clean = (value, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";

export const refundSummaryForOrder = async (order, session = null) => {
  const refunds = await Refund.find({ order: order._id }).sort({ createdAt: -1 }).session(session || null).lean();
  const paidHalala = toHalala(order.totalAmount, "Order total");
  const completedHalala = refunds.filter((row) => row.status === "completed").reduce((sum, row) => sum + row.amountHalala, 0);
  const reservedHalala = refunds.filter((row) => RESERVED_STATUSES.includes(row.status)).reduce((sum, row) => sum + row.amountHalala, 0);
  return {
    paidAmount: fromHalala(paidHalala),
    completedRefundAmount: fromHalala(completedHalala),
    pendingRefundAmount: fromHalala(reservedHalala - completedHalala),
    remainingRefundableAmount: fromHalala(Math.max(0, paidHalala - reservedHalala)),
    refunds: refunds.map((row) => ({ ...row, amount: fromHalala(row.amountHalala), currency: "SAR" })),
  };
};

export const createRefundRequest = async ({ orderId, payload, actor, correlationId }) => {
  const idempotencyKey = clean(payload.idempotencyKey, 120);
  if (!idempotencyKey) throw new ValidationError("Refund request identifier is required");
  const prior = await Refund.findOne({ idempotencyKey });
  if (prior) return { refund: prior, duplicate: true };
  const amountHalala = positiveHalala(payload.amount, "Refund amount");
  const reason = clean(payload.reason);
  if (reason.length < 3) throw new ValidationError("Refund reason is required");
  try {
    return await runInventoryTransaction(async (session) => {
    let order = await Order.findById(orderId).session(session || null);
    if (!order) throw new ValidationError("Order was not found");
    if (!["paid", "partially_refunded"].includes(order.paymentStatus)) throw new ValidationError("Only captured payments can be refunded");
    const paidHalala = toHalala(order.totalAmount, "Order total");
    order = await Order.findOneAndUpdate({
      _id: order._id,
      paymentStatus: { $in: ["paid", "partially_refunded"] },
      $expr: {
        $lte: [
          {
            $add: [
              { $ifNull: ["$refundReservedHalala", 0] },
              { $ifNull: ["$refundedAmountHalala", { $round: [{ $multiply: [{ $ifNull: ["$refundedAmount", 0] }, 100] }, 0] }] },
              amountHalala,
            ],
          },
          { $round: [{ $multiply: ["$totalAmount", 100] }, 0] },
        ],
      },
    }, { $inc: { refundReservedHalala: amountHalala } }, { new: true, session });
    if (!order) {
      const current = await Order.findById(orderId).session(session || null);
      const used = Number(current?.refundReservedHalala || 0) + Number(current?.refundedAmountHalala || toHalala(current?.refundedAmount || 0));
      throw new ValidationError(`Refund exceeds the remaining refundable amount of SAR ${fromHalala(Math.max(0, toHalala(current?.totalAmount || 0) - used)).toFixed(2)}`);
    }
    const usedBeforeThisRequest = Number(order.refundReservedHalala || 0) - amountHalala + Number(order.refundedAmountHalala || toHalala(order.refundedAmount || 0));
    const method = payload.method || order.paymentMethod;
    if (!["cash", "card", "other"].includes(method)) throw new ValidationError("Choose cash, card or other refund method");
    const [refund] = await Refund.create([{
      order: order._id,
      originalPaymentReference: clean(payload.originalPaymentReference, 160),
      amountHalala,
      type: amountHalala === paidHalala - usedBeforeThisRequest ? "full" : "partial",
      reason,
      method,
      externalReference: clean(payload.externalReference, 160),
      requestedBy: actor._id,
      status: "requested",
      idempotencyKey,
      approvalRequired: true,
      statusHistory: [{ status: "requested", note: reason, changedBy: actor._id }],
    }], session ? { session } : {});
    await recordAuditLog({ actor, action: "REFUND_REQUESTED", entityType: "Refund", entityId: refund._id, entityLabel: `Order #${order.orderNumber}`, correlationId, after: { amount: fromHalala(amountHalala), type: refund.type, method, status: refund.status }, reason, related: { order: order._id } }, { session });
    return { refund, duplicate: false };
    });
  } catch (error) {
    if (error?.code === 11000) {
      const duplicate = await Refund.findOne({ idempotencyKey });
      if (duplicate) return { refund: duplicate, duplicate: true };
    }
    throw error;
  }
};

const transitions = {
  approve: { from: ["requested"], to: "approved" },
  reject: { from: ["requested"], to: "rejected" },
  process: { from: ["approved"], to: "processing" },
  complete: { from: ["approved", "processing"], to: "completed" },
  fail: { from: ["approved", "processing"], to: "failed" },
  cancel: { from: ["requested", "approved"], to: "cancelled" },
};

export const transitionRefund = async ({ refundId, action, payload, actor, correlationId }) => {
  const transition = transitions[action];
  if (!transition) throw new ValidationError("Unknown refund action");
  return runInventoryTransaction(async (session) => {
    const refund = await Refund.findById(refundId).session(session || null);
    if (!refund) throw new ValidationError("Refund was not found");
    if (refund.status === transition.to) return { refund, duplicate: true };
    if (!transition.from.includes(refund.status)) throw new ValidationError(`Refund cannot be ${action}ed from ${refund.status}`);
    let order = await Order.findById(refund.order).session(session || null);
    if (!order) throw new ValidationError("Refund order was not found");
    const before = { status: refund.status, paymentStatus: order.paymentStatus, refundedAmount: order.refundedAmount || 0 };
    const note = clean(payload.note || payload.reason);
    if (["reject", "fail"].includes(action) && !note) throw new ValidationError(`${action === "reject" ? "Rejection" : "Failure"} reason is required`);
    refund.status = transition.to;
    if (action === "approve") refund.approvedBy = actor._id;
    if (["process", "complete", "fail"].includes(action)) refund.processedBy = actor._id;
    if (action === "fail") refund.failureReason = note;
    if (payload.externalReference !== undefined) refund.externalReference = clean(payload.externalReference, 160);
    if (action === "complete") {
      refund.completedAt = new Date();
      const totalHalala = toHalala(order.totalAmount, "Order total");
      order = await Order.findOneAndUpdate(
        { _id: order._id, refundReservedHalala: { $gte: refund.amountHalala } },
        [
          { $set: {
            refundReservedHalala: { $subtract: [{ $ifNull: ["$refundReservedHalala", 0] }, refund.amountHalala] },
            refundedAmountHalala: { $add: [{ $ifNull: ["$refundedAmountHalala", { $round: [{ $multiply: [{ $ifNull: ["$refundedAmount", 0] }, 100] }, 0] }] }, refund.amountHalala] },
          } },
          { $set: {
            refundedAmount: { $divide: ["$refundedAmountHalala", 100] },
            paymentStatus: { $cond: [{ $gte: ["$refundedAmountHalala", totalHalala] }, "refunded", "partially_refunded"] },
          } },
        ],
        { new: true, session }
      );
      if (!order) throw new ValidationError("Refund reservation is no longer available");
      await recordRefundCashMovement({ refund, order, actor, session });
    } else if (["reject", "fail", "cancel"].includes(action)) {
      order = await Order.findOneAndUpdate(
        { _id: order._id, refundReservedHalala: { $gte: refund.amountHalala } },
        { $inc: { refundReservedHalala: -refund.amountHalala } },
        { new: true, session }
      );
      if (!order) throw new ValidationError("Refund reservation is no longer available");
    }
    refund.statusHistory.push({ status: refund.status, note, changedBy: actor._id });
    await refund.save(session ? { session } : {});
    await recordAuditLog({ actor, action: `REFUND_${refund.status.toUpperCase()}`, entityType: "Refund", entityId: refund._id, entityLabel: `Order #${order.orderNumber}`, correlationId, before, after: { status: refund.status, paymentStatus: order.paymentStatus, refundedAmount: order.refundedAmount || 0 }, reason: note, related: { order: order._id } }, { session });
    return { refund, order, duplicate: false };
  });
};
