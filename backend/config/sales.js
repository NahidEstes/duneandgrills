export const SALES_SOURCES = Object.freeze(["website", "pos", "phone", "jahez", "hungerstation"]);
export const PAYMENT_METHODS = Object.freeze(["unrecorded", "cash", "card", "other"]);
export const PAYMENT_STATUSES = Object.freeze(["unpaid", "pending", "paid", "partially_refunded", "refunded", "voided", "failed"]);
export const POS_ORDER_TYPES = Object.freeze(["dine-in", "takeaway"]);

export const isPosOrderType = (value) => POS_ORDER_TYPES.includes(value);
export const isPaymentMethod = (value) => PAYMENT_METHODS.includes(value) && value !== "unrecorded";
