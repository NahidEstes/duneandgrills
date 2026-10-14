export const RIDER_FILTERS = Object.freeze([
  { value: "all", label: "All" }, { value: "assigned", label: "Awaiting pickup" },
  { value: "picked_up", label: "Picked up" },
  { value: "issue", label: "Issues" },
]);
export function filterDeliveries(deliveries, filter) {
  return filter === "all" ? deliveries : deliveries.filter(row => row.deliveryStatus === filter);
}
export const ACTIVE_RIDER_FILTERS = RIDER_FILTERS.filter(option => option.value !== "issue");
export function riderDeliveryStage(delivery) {
  if (delivery.deliveryStatus === "issue") return { label: "Delivery issue", tone: "issue", icon: "issue" };
  if (delivery.deliveryStatus === "delivered") return { label: "Completed", tone: "ready", icon: "completed" };
  if (delivery.canOperate === false) return { label: "Requires review", tone: "issue", icon: "issue" };
  if (delivery.deliveryStatus === "picked_up") return { label: "On the way", tone: "transit", icon: "transit" };
  if (delivery.deliveryStatus === "assigned" && delivery.restaurantStatus === "ready") return { label: "Ready for pickup", tone: "ready", icon: "ready" };
  if (delivery.deliveryStatus === "assigned" && ["pending", "confirmed", "preparing"].includes(delivery.restaurantStatus)) return { label: "Preparing", tone: "preparing", icon: "preparing" };
  return { label: "Awaiting pickup", tone: "preparing", icon: "preparing" };
}
export const restaurantStatusLabel = status => ({ pending: "Awaiting kitchen acceptance", confirmed: "Accepted by kitchen", preparing: "Preparing", ready: "Ready", "out-for-delivery": "Dispatched", delivered: "Completed", cancelled: "Cancelled", failed: "Failed" })[status] || "Status unavailable";
export const riderInitials = name => String(name || "Rider").trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] || "").join("").toUpperCase();
// Operational totals come from the server's all-page facet, never visible rows.
export function riderCount(data, key) {
  const value = data?.counts?.[key];
  if (Number.isSafeInteger(value) && value >= 0) return value;
  if (data?.mode === "preview" && ["assigned", "picked_up", "issue"].includes(key)) return filterDeliveries(data.deliveries, key).length;
  return "—";
}
export function paymentLabel(status) {
  return ({ paid: "Paid", pending: "Payment not confirmed", unpaid: "Unpaid", partially_refunded: "Partially refunded", refunded: "Payment refunded", voided: "Payment voided", failed: "Payment failed" })[status] || "Payment unavailable";
}

export const CASH_STATES = Object.freeze({ collection_pending: "Collect from customer", awaiting_confirmation: "Cash reported — awaiting cashier", discrepancy: "Shortage / discrepancy", confirmed: "Cash confirmed", no_collection: "No collection needed", unavailable: "Unavailable / requires review" });
export function riderCash(delivery) {
  const state = Object.hasOwn(CASH_STATES, delivery.cashState) ? delivery.cashState : "unavailable";
  const amountHalala = state === "collection_pending" ? delivery.customerCollectionHalala
    : ["awaiting_confirmation", "discrepancy", "confirmed"].includes(state) ? delivery.reportedCashHalala : state === "no_collection" ? 0 : null;
  return { state, label: CASH_STATES[state], amount: Number.isSafeInteger(amountHalala) && amountHalala >= 0 ? amountHalala / 100 : null };
}
export const deliveryFingerprint = data => JSON.stringify([data?.revision, data?.orderRevision, data?.canOperate, data?.paymentStatus, data?.cashState, data?.ledgerOutstandingHalala, data?.deliveryStatus]);
export function cashReportError(amount, reason, data) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(amount))) return "Enter a non-negative SAR amount with at most two decimals.";
  const value = Math.round(Number(amount) * 100), balance = data?.customerCollectionHalala;
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(balance) || balance <= 0 || value > balance) return "Amount exceeds the authoritative balance, or collection is unavailable.";
  if (value < balance && !reason.trim()) return "Explain the shortage before reporting cash.";
  return "";
}
