import Order from "../models/Order.js";
import PosShift from "../models/PosShift.js";
import { hasCapability, CAPABILITIES } from "../config/permissions.js";
import { runInventoryTransaction } from "./inventoryStockService.js";
import { createMovement } from "./posShiftService.js";
import { restoreRefundItems, reverseRefundRewards } from "./refundRestorationService.js";
import { getEffectiveRestaurantSettings } from "./restaurantSettingsService.js";
import { recordAuditLog } from "./auditLogService.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { toHalala } from "../utils/money.js";

export const voidPosSale = async ({ orderId, payload, actor, correlationId }) => {
  if (!hasCapability(actor.role, CAPABILITIES.POS_VOID)) throw Object.assign(new ValidationError("Not authorized to void POS sales"), { status: 403 });
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  const key = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey.trim() : "";
  if (reason.length < 3 || reason.length > 500 || !key || key.length > 120) throw new ValidationError("Void reason and request identifier are required");
  const policy = (await getEffectiveRestaurantSettings()).posCheckout;
  return runInventoryTransaction(async session => {
    if (!session) throw new ValidationError("Voiding requires a MongoDB replica set");
    let order = await Order.findOne({ _id: orderId, source: "pos" }).session(session);
    if (!order) throw new ValidationError("POS sale was not found");
    if (order.voidIdempotencyKey === key) return { order, duplicate: true };
    if (order.paymentStatus !== "paid" || order.status === "cancelled" || order.refundReservedHalala || order.refundedAmountHalala) throw new ValidationError("Sale is already voided/refunded or has pending refunds");
    if (Date.now() - order.createdAt.getTime() > policy.voidWindowMinutes * 60_000) throw new ValidationError("Void window has ended. Use the authorized refund workflow");
    const shift = order.posShift ? await PosShift.findOne({ _id: order.posShift, isOpen: true }).session(session) : null;
    if (order.posShift && !shift) throw new ValidationError("Original shift is closed. Use the refund workflow");
    const claimed = await Order.updateOne({ _id: order._id, paymentStatus: "paid", voidedAt: null, refundReservedHalala: 0, refundedAmountHalala: 0 }, { $set: { voidedAt: new Date(), voidedBy: actor._id, voidIdempotencyKey: key } }, session ? { session } : {});
    if (!claimed.matchedCount) throw new ValidationError("Sale changed before voiding; reload it");
    order = await Order.findById(order._id).session(session);
    if (order.paymentMethod === "cash" && shift && order.totalAmount > 0) await createMovement({ shift, type: "cash_void", amountHalala: toHalala(order.totalAmount), reason, actor, order: order._id, idempotencyKey: `cash-void:${order._id}` }, session);
    if (payload.restock === true) await restoreRefundItems({ order, items: order.items.map((line, index) => ({ index, quantity: line.quantity })), actor, reference: `void:${order._id}`, session });
    await reverseRefundRewards({ order, refundedHalala: toHalala(order.totalAmount), reference: `void:${order._id}`, session });
    order.status = "cancelled"; order.paymentStatus = "voided"; order.cancellationReason = reason;
    order.statusHistory.push({ status: "cancelled", reason: `POS void: ${reason}`, changedBy: actor._id });
    await order.save(session ? { session } : {});
    await recordAuditLog({ actor, action: "POS_SALE_VOIDED", entityType: "Order", entityId: order._id, entityLabel: order.orderNumber, reason, correlationId, after: { paymentStatus: order.paymentStatus, restock: payload.restock === true, terminal: order.terminal, shift: order.posShift } }, { session });
    return { order, duplicate: false };
  });
};
