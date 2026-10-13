export const RIDER_FILTERS = Object.freeze([
  { value: "all", label: "All" }, { value: "assigned", label: "Assigned" },
  { value: "picked_up", label: "Picked Up" },
  { value: "issue", label: "Issues" },
]);
export function filterDeliveries(deliveries, filter) {
  return filter === "all" ? deliveries : deliveries.filter(row => row.deliveryStatus === filter);
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
