export const fulfillmentActions = order => {
  if (order.manualEntry || order.paymentStatus === "voided") return [];
  const next = { pending: "confirmed", confirmed: "preparing", preparing: "ready", ready: order.orderType === "delivery" ? "out-for-delivery" : "delivered", "out-for-delivery": "delivered" }[order.status];
  if (!next) return [];
  const returned = order.inventoryStatus === "restored" || Object.values(order.restoredItemQuantities || {}).some(value => Number(value) > 0);
  const cancellation = order.source === "pos" && ["paid", "partially_refunded"].includes(order.paymentStatus) ? [] : ["cancelled", "failed"];
  return [...(returned ? [] : [next]), ...cancellation];
};
