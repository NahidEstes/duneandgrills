import { DELIVERY_PROVIDERS } from "../config/sales.js";
import { toHalala, fromHalala } from "../utils/money.js";
import { OrderEngineError } from "../config/orderContract.js";

export const eligibleDeliveryOrder = (order, { enrolled = true } = {}) => Boolean(order
  && (!enrolled || order.deliveryMode === "restaurant") && order.orderType === "delivery"
  && ["website", "phone", "pos"].includes(order.source) && !DELIVERY_PROVIDERS.includes(order.source)
  && !order.manualEntry && !order.deliveryProvider && order.deliveryPaymentType !== "aggregator_prepaid"
  && !["cancelled", "failed", "refunded"].includes(order.status)
  && !["voided", "failed"].includes(order.paymentStatus) && order.inventoryStatus !== "restored"
  && !Object.values(order.restoredItemQuantities || {}).some(value => Number(value) > 0));

// Refunds never reopen a settled customer's debt. Unknown balances remain unknown.
export function outstandingDeliveryHalala(order) {
  if (!order || !Number.isFinite(order.totalAmount) || order.totalAmount < 0) return null;
  if (["paid", "partially_refunded", "refunded"].includes(order.paymentStatus)) return 0;
  if (!["pending", "unpaid"].includes(order.paymentStatus)) return null;
  const records = order.paymentRecords || [];
  if (records.some(row => !Number.isFinite(row.amount) || row.amount < 0)) return null;
  return Math.max(0, toHalala(order.totalAmount) - records.reduce((sum, row) => sum + toHalala(row.amount), 0));
}

export const deliveryError = (message, status = 400) => new OrderEngineError(message, status);

export function serializeDelivery(delivery, order, rider, { detail = false } = {}) {
  const balance = outstandingDeliveryHalala(order);
  const historical = delivery.status === "delivered";
  const cash = delivery.cashReport || {};
  const eligible = eligibleDeliveryOrder(order);
  const accepted = eligible && historical && cash.status === "unconfirmed" && cash.amountHalala === balance
    && balance === toHalala(order.totalAmount) && !(order.paymentRecords || []).length
    && !order.refundReservedHalala;
  return {
    id: String(delivery._id), orderId: String(order._id), orderNumber: order.orderNumber,
    revision: delivery.revision, riderId: delivery.rider ? String(delivery.rider) : null,
    riderName: rider?.name || null, deliveryStatus: delivery.status, restaurantStatus: order.status,
    canOperate: eligible,
    eligibilityWarning: eligible ? "" : "This order is no longer eligible. Delivery actions are blocked; authorized order handling is required.",
    customerName: historical ? "Completed delivery" : order.customer?.name || "Guest",
    paymentStatus: order.paymentStatus, amountToCollect: balance === null ? null : fromHalala(balance),
    assignedAt: delivery.assignedAt || null, pickedUpAt: delivery.pickedUpAt || null,
    deliveredAt: delivery.deliveredAt || null, updatedAt: delivery.updatedAt,
    cashReport: { status: cash.status || "none", amount: cash.amountHalala == null ? null : fromHalala(cash.amountHalala),
      confirmedAt: cash.confirmedAt || null, acknowledgedAt: cash.acknowledgedAt || null },
    canConfirmCash: Boolean(accepted),
    cashConfirmationGap: cash.status === "discrepancy" ? "Shortage/discrepancy requires authorized handling; not posted as payment."
      : cash.status === "unconfirmed" && !accepted ? "Existing payment workflow cannot safely confirm this balance. Cash remains unconfirmed." : "",
    ...(detail ? {
      pickupInstructions: delivery.pickupInstructions,
      customer: historical ? null : { name: order.customer?.name || "Guest", phone: order.customer?.phone || "", address: order.customer?.address || "" },
      deliveryNote: historical ? "" : delivery.deliveryNote,
      issue: delivery.status === "issue" ? { reason: delivery.issue?.reason || "", previousStatus: delivery.issue?.previousStatus } : null,
      orderTotal: order.totalAmount,
      items: (order.items || []).map(item => ({ name: item.name, quantity: item.quantity, price: item.price, lineTotal: fromHalala(toHalala(item.price) * item.quantity),
        selectedAddOns: (item.selectedAddOns || []).map(row => ({ name: row.name, quantity: row.quantity })),
        spiceLevel: item.spiceLevel || "", itemNote: historical ? "" : item.itemNote || "" })),
    } : {}),
  };
}
