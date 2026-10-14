import { cashReportError } from "./riderPresentation.js";

// These UI checks supplement the server's ownership, transaction and revision checks.
export function riderCompletionAction(data, action, context = {}, payload = {}) {
  const blocked = reason => ({ allowed: false, reason });
  if (!data || context.loading) return blocked("Wait for delivery details to load.");
  if (context.preview) return blocked("Read-only preview. Delivery actions are disabled.");
  if (context.pending || context.awaitingUpdate) return blocked("Waiting for the latest server details. Refresh before another action.");
  if (context.offline) return blocked("You are offline. Reconnect and refresh details before confirming.");
  if (context.refreshing) return blocked("Updating delivery details. Please wait for the latest status.");
  if (context.error) return blocked("Details may be outdated. Refresh details successfully before confirming.");
  if (context.reviewRequired) return blocked("Delivery changed. Go back, refresh and review the current order.");
  if (context.admin || context.role !== "rider" || !context.userId || String(data.riderId) !== String(context.userId)) return blocked("Only the assigned rider can perform this action.");
  if (!(data.mode === "operational" || (context.rehearsal && data.mode === "rehearsal"))) return blocked("The delivery workflow is not enabled in this mode.");
  if (!data.canOperate) return blocked(data.eligibilityWarning || "This delivery requires restaurant review.");
  if (![data.revision, data.orderRevision].every(value => Number.isSafeInteger(value) && value >= 0)) return blocked("Refresh details to verify the current order and delivery revisions.");
  if (data.deliveryStatus === "issue") return blocked("An unresolved delivery issue requires manager review. Delivery actions are paused.");
  if (action === "deliver") {
    if (data.deliveryStatus === "delivered") return blocked("Delivery is already completed. Review its cash status below.");
    if (data.deliveryStatus !== "picked_up" || data.restaurantStatus !== "out-for-delivery") return blocked("Confirm delivery only after pickup is recorded and the order is Out for delivery. Refresh or contact the restaurant.");
    return { allowed: true, reason: "Confirm after the customer receives the order." };
  }
  if (action === "issue") {
    if (!["assigned", "picked_up"].includes(data.deliveryStatus)) return blocked("Only an active delivery can report an issue.");
    if (!String(payload.reason || "").trim()) return blocked("Describe the delivery issue before reporting it.");
    if (String(payload.reason).trim().length > 500) return blocked("Keep the explanation within 500 characters.");
    return { allowed: true, reason: "Reporting an issue pauses this delivery until a manager reviews it." };
  }
  if (action === "report_cash") {
    if (data.deliveryStatus !== "delivered") return blocked("Cash can be reported only after delivery is completed.");
    if (data.cashReport?.status !== "none") return blocked("A cash report is already recorded or its status is unavailable. Do not report or collect it again.");
    if (data.cashState !== "collection_pending") return blocked("No cash collection is available. Review the server payment information.");
    const problem = cashReportError(payload.amount, payload.reason || "", data);
    return problem ? blocked(problem) : { allowed: true, reason: "Reporting cash does not confirm payment. Cashier confirmation is separate." };
  }
  return blocked("This rider action is unavailable.");
}

export const riyadhRecordedTime = value => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" }) + " Riyadh" : "Time not recorded";

// Receipt stages come from stored report status, never from a typed amount or a POST in flight.
export function riderCashReceipt(data) {
  const status = data?.cashReport?.status;
  if (status === "confirmed") return { label: "Cashier confirmed", tone: "ready", icon: "confirmed", recorded: true };
  if (status === "discrepancy") return { label: "Discrepancy · Requires review", tone: "issue", icon: "issue", recorded: true };
  if (status === "unconfirmed") return { label: "Reported · Awaiting cashier confirmation", tone: "preparing", icon: "pending", recorded: true };
  if (status === "none" && data.cashState === "collection_pending") return { label: "Cash report pending", tone: "preparing", icon: "pending", recorded: false };
  if (status === "none" && data.cashState === "no_collection") return { label: "No cash collection needed", tone: "ready", icon: "none", recorded: false };
  return { label: "Cash information unavailable · Requires review", tone: "issue", icon: "issue", recorded: false };
}
