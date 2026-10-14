import { emptyDeliveryQuery } from "./deliveryWorkspace.js";
import { deliverySortLabels, deliveryStatusLabel } from "./deliveryManagementPresentation.js";

export const managementTabs = [{ key: "active", label: "Active Deliveries" }, { key: "cash", label: "Cash & Settlement" }, { key: "history", label: "History" }];
export const cashLabels = { collection_pending: "Collection pending", awaiting_confirmation: "Rider reported · Cashier pending", discrepancy: "Discrepancy · Requires review", confirmed: "Cashier confirmed", no_collection: "No collection needed", unavailable: "Unavailable · Requires review" };
export const attentionLabels = { ready_unassigned: "Food ready · no rider", pickup_delayed: "Pickup delayed", delivery_delayed: "Delivery delayed", issue: "Unresolved issue", no_cash_report: "Delivered · cash not reported", awaiting_cash: "Reported · cashier pending", discrepancy: "Discrepancy review", timing_unavailable: "Timing unavailable" };
export const activeAttentionKeys = ["ready_unassigned", "pickup_delayed", "delivery_delayed", "issue", "timing_unavailable"];
export function managementFilterQuery(workspace, values = {}) { return { ...emptyDeliveryQuery(workspace), ...values, workspace, page: 1 }; }
export function removeManagementFilter(query, key) {
  const defaults = emptyDeliveryQuery(query.workspace);
  return { ...query, ...(key === "date" ? { datePeriod: "all", dateBasis: defaults.dateBasis, from: "", to: "" } : { [key]: defaults[key] }), page: 1 };
}
export function appliedDeliveryChips(query, canManage, riders = []) {
  const defaults = emptyDeliveryQuery(query.workspace), chips = [];
  const add = (key, label) => chips.push({ key, label });
  if (query.search) add("search", `Order: ${query.search}`);
  if (query.status !== "all") add("status", deliveryStatusLabel(query.status));
  if (query.attention !== "all") add("attention", query.attention === "needs_attention" ? "Needs Attention" : attentionLabels[query.attention]);
  if (query.cashStatus !== "all") add("cashStatus", query.cashStatus === "confirmed_today" ? "Confirmed today · Riyadh" : cashLabels[query.cashStatus]);
  if (query.datePeriod !== "all" || query.dateBasis !== defaults.dateBasis) add("date", `${query.dateBasis === "delivered" ? "Delivered" : "Enrolled"}: ${query.datePeriod === "custom" ? `${query.from} – ${query.to}` : query.datePeriod} · Riyadh`);
  if (canManage && query.riderId !== "all") add("riderId", query.riderId === "unassigned" ? "No rider assigned" : `Rider: ${riders.find(row => row.id === query.riderId)?.name || "Selected rider"}`);
  if (query.sort !== defaults.sort) add("sort", deliverySortLabels[query.sort]);
  return chips;
}
export function deliveryStageDuration(row, now) {
  let recorded, label;
  if (row.deliveryStatus === "issue") { recorded = row.issue?.reportedAt; label = "Issue open"; }
  else if (row.deliveryStatus === "picked_up") { recorded = row.pickedUpAt; label = "In transit"; }
  else if (row.deliveryStatus === "assigned") { recorded = row.restaurantStatus === "ready" ? row.pickupClock : row.assignedAt; label = row.restaurantStatus === "ready" ? "Pickup wait" : "Assigned"; }
  else if (row.deliveryStatus === "unassigned" && row.restaurantStatus === "ready") { recorded = row.readyAt; label = "Food ready"; }
  const start = recorded && new Date(recorded).getTime(), end = now && new Date(now).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "Timing unavailable";
  const minutes = Math.floor((end - start) / 60000);
  const duration = minutes < 1 ? "< 1 min" : minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${Math.floor(minutes / 1440)}d ${Math.floor(minutes % 1440 / 60)}h`;
  return `${label} · ${duration}`;
}
export function previewManagementRows(rows, query) {
  return rows.filter(row => (query.workspace === "active" ? row.deliveryStatus !== "delivered" : row.deliveryStatus === "delivered")
    && (query.status === "all" || row.deliveryStatus === query.status)
    && (!query.search || row.orderNumber.toLowerCase().includes(query.search.toLowerCase()))
    && (query.riderId === "all" || (query.riderId === "unassigned" ? !row.riderId : row.riderId === query.riderId)));
}
