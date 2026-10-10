import { ORDER_STATUSES } from "./orderStatuses.js";

export const SOURCE_CHANNELS = Object.freeze(["customer", "pos", "admin"]);
export const FULFILLMENT_TYPES = Object.freeze(["delivery", "pickup", "dine_in"]);
const types = { delivery: "delivery", pickup: "pickup", takeaway: "pickup", "dine-in": "dine_in" };

export const orderContract = (order) => ({
  sourceChannel: order.source === "pos" ? "pos" : !order.source || order.source === "website" ? "customer" : "admin",
  fulfillmentType: types[order.orderType] || "delivery",
  fulfillmentStatus: order.status || "pending",
});

export class OrderEngineError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const orderText = (value, label, maximum = 500) => {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.trim().length > maximum) throw new OrderEngineError(`${label} must be text of at most ${maximum} characters`);
  return value.trim();
};

// Canonical input is additive; old orderType values remain stored and readable.
export const resolveOrderInput = (payload, channel) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new OrderEngineError("Order request must be an object");
  if (payload.sourceChannel !== undefined && payload.sourceChannel !== channel) throw new OrderEngineError("Source channel is controlled by the order endpoint");
  if (payload.fulfillmentType !== undefined && !FULFILLMENT_TYPES.includes(payload.fulfillmentType)) throw new OrderEngineError("Invalid fulfillment type");
  let orderType = payload.orderType;
  if (orderType !== undefined && !Object.hasOwn(types, orderType)) throw new OrderEngineError("Invalid order type");
  if (orderType && payload.fulfillmentType && types[orderType] !== payload.fulfillmentType) throw new OrderEngineError("Order type and fulfillment type disagree");
  orderType ||= { delivery: "delivery", pickup: channel === "pos" ? "takeaway" : "pickup", dine_in: "dine-in" }[payload.fulfillmentType] || (channel === "pos" ? "dine-in" : "delivery");
  if (channel === "pos" && orderType === "pickup") orderType = "takeaway";
  for (const field of ["source", "createdBy", "user", "inventoryStatus", "orderNumber", "trackingTokenHash"]) {
    if (payload[field] !== undefined) throw new OrderEngineError(`${field} is controlled by the server`);
  }
  if (payload.status !== undefined || payload.fulfillmentStatus !== undefined || payload.paymentStatus !== undefined) throw new OrderEngineError("Initial payment and fulfillment statuses are controlled by the server");
  return { orderType, notes: orderText(payload.notes, "Order notes"), kitchenNotes: orderText(payload.kitchenNotes, "Kitchen notes") };
};

export const resolveFulfillmentStatus = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new OrderEngineError("Status request must be an object");
  if (payload.paymentStatus !== undefined || payload.inventoryStatus !== undefined) throw new OrderEngineError("Payment and inventory statuses cannot be changed through fulfillment updates");
  if (payload.status !== undefined && payload.fulfillmentStatus !== undefined && payload.status !== payload.fulfillmentStatus) throw new OrderEngineError("Status fields disagree");
  const status = payload.fulfillmentStatus ?? payload.status;
  if (!ORDER_STATUSES.includes(status)) throw new OrderEngineError("Invalid order status");
  return status;
};

export const resolveOrderTransition = (order, nextStatus, workflow = "admin") => {
  if (!ORDER_STATUSES.includes(nextStatus)) throw new OrderEngineError("Invalid order status");
  if (nextStatus === "refunded") throw new OrderEngineError("Use the refund workflow to refund a payment; order status and payment refund are separate");
  if (order.manualEntry) throw new OrderEngineError("Historical delivery entries cannot enter the live fulfillment workflow", 409);
  if (workflow === "kitchen" && !["confirmed", "preparing", "ready"].includes(nextStatus)) throw new OrderEngineError("Kitchen status must be confirmed, preparing or ready");
  if (workflow === "handoff" && !["out-for-delivery", "delivered"].includes(nextStatus)) throw new OrderEngineError("Handover can only dispatch or complete an order");
  if (order.paymentStatus === "voided") throw new OrderEngineError("Voided orders cannot change fulfillment status", 409);
  if (order.status === nextStatus) return { duplicate: true };
  if (!["cancelled", "failed"].includes(nextStatus) && (order.inventoryStatus === "restored" || Object.values(order.restoredItemQuantities || {}).some(quantity => Number(quantity) > 0))) throw new OrderEngineError("Returned inventory cannot be fulfilled; cancel this order and create a new order if needed", 409);
  const allowed = {
    pending: ["confirmed", "cancelled", "failed"],
    confirmed: ["preparing", "cancelled", "failed"],
    preparing: ["ready", "cancelled", "failed"],
    ready: [orderContract(order).fulfillmentType === "delivery" ? "out-for-delivery" : "delivered", "cancelled", "failed"],
    "out-for-delivery": ["delivered", "cancelled", "failed"],
  };
  if (!allowed[order.status]?.includes(nextStatus)) throw new OrderEngineError(`Order cannot move from ${order.status} to ${nextStatus}`, 409);
  if (order.source === "pos" && ["cancelled", "failed"].includes(nextStatus) && ["paid", "partially_refunded"].includes(order.paymentStatus)) throw new OrderEngineError("Use POS History to void/refund a captured POS payment");
  return { duplicate: false };
};
