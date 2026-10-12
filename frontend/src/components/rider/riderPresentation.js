export const RIDER_FILTERS = Object.freeze([
  { value: "all", label: "All" }, { value: "assigned", label: "Assigned" },
  { value: "picked_up", label: "Picked Up" },
]);
export function filterDeliveries(deliveries, filter) {
  return filter === "all" ? deliveries : deliveries.filter(row => row.deliveryStatus === filter);
}
export function paymentLabel(status) {
  return ({ paid: "Paid", pending: "Payment not confirmed" })[status] || "Payment unavailable";
}
