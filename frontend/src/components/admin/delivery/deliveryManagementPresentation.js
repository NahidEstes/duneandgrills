import { ORDER_STATUS_LABELS, orderPaymentLabel } from "../../../utils/adminOrders.js";
import { deliveryStatusLabel } from "../../rider/deliveryPresentation.js";

export const deliverySortLabels = { newest: "Newest enrolled first", oldest: "Oldest enrolled first", delivered_newest: "Recently delivered first", delivered_oldest: "Oldest delivered first", oldest_waiting: "Oldest waiting · ready/unassigned only", assigned_longest: "Assigned longest · assigned only", picked_up_longest: "Picked up longest · picked up only" };
export { ORDER_STATUS_LABELS, orderPaymentLabel, deliveryStatusLabel };
export const deliveryDateLabel = value => value && Number.isFinite(new Date(value).getTime()) ? `${new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })} Riyadh` : "Timestamp unavailable";
export function deliveryActionLabel(row, canManage) {
  if (row.canOperate === false) return "Review Required";
  if (canManage && row.deliveryStatus === "unassigned") return "Assign";
  if (canManage && row.deliveryStatus === "assigned") return "Reassign";
  if (row.deliveryStatus === "issue") return "Review Issue";
  if (["awaiting_confirmation", "discrepancy"].includes(row.cashState)) return "Review Cash";
  return "View Details";
}
export function canAssignDelivery(row, rider, reason) {
  return Boolean(row && row.canOperate !== false && ["unassigned", "assigned"].includes(row.deliveryStatus)
    && rider?.available && rider.id !== row.riderId && (!row.riderId || reason.trim()));
}
export function assignmentConfirmation(row, rider, reason) {
  if (!canAssignDelivery(row, rider, reason)) return null;
  return { id: row.id, revision: row.revision, orderRevision: row.orderRevision, orderNumber: row.orderNumber,
    currentStatus: row.deliveryStatus, riderId: rider.id, riderName: rider.name, reason: reason.trim() };
}
export function confirmationStillCurrent(confirmation, row, rider, reason) {
  return confirmation && JSON.stringify(confirmation) === JSON.stringify(assignmentConfirmation(row, rider, reason));
}
