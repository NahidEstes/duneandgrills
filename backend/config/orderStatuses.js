export const NON_REVENUE_ORDER_STATUSES = Object.freeze([
  "cancelled",
  "refunded",
  "failed",
]);

export const ORDER_STATUSES = Object.freeze([
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out-for-delivery",
  "delivered",
  ...NON_REVENUE_ORDER_STATUSES,
]);

export const isRevenueOrderStatus = (status) =>
  !NON_REVENUE_ORDER_STATUSES.includes(status);
