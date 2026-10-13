import RestaurantSettings from "../models/RestaurantSettings.js";
import { managementDeliveryQuery } from "./deliveryQueryService.js";
import { deliveryError } from "./deliveryContractService.js";
import { CASH_LABELS } from "./deliveryHealthService.js";

export function riderHistoryQuery(query, now = new Date()) {
  const history = query.history === "true";
  if (query.history && !["true", "false"].includes(query.history)) throw deliveryError("Invalid history filter");
  if (!history && ["datePeriod", "from", "to", "cashStatus"].some(key => query[key] && query[key] !== "all")) throw deliveryError("Date/cash filters require delivery history");
  const cashStatus = query.cashStatus || "all";
  if (cashStatus !== "all" && !Object.hasOwn(CASH_LABELS, cashStatus)) throw deliveryError("Invalid cash filter");
  // Reuse the validated Riyadh calendar ranges, never accept rider/management filters.
  const date = managementDeliveryQuery({ role: "rider" }, { dateBasis: "delivered", datePeriod: query.datePeriod, from: query.from, to: query.to }, now);
  return { ...date.match, ...(cashStatus !== "all" ? { healthCash: cashStatus } : {}) };
}

export async function restaurantContact() {
  // lean reads only an actually stored restaurant number, not schema defaults or staff phones.
  const stored = await RestaurantSettings.findOne({ key: "default" }).select("location.phone").lean();
  const phone = stored?.location?.phone;
  return typeof phone === "string" && /^[+\d][\d ()-]{6,19}$/.test(phone) ? { phone } : null;
}

export function riderTimeline(delivery, actorId) {
  const own = value => value && String(value) === String(actorId);
  const recorded = value => value && Number.isFinite(new Date(value).getTime()) ? value : null;
  const steps = [
    ["Assigned", delivery.assignedAt], ["Picked Up", delivery.pickedUpAt], ["Delivered", delivery.deliveredAt],
    ["Cash Reported", own(delivery.cashReport?.reportedBy) ? delivery.cashReport.reportedAt : null],
    ["Cash Confirmed", delivery.cashReport?.status === "confirmed" ? delivery.cashReport.confirmedAt : null],
  ].map(([label, at]) => ({ label, at: recorded(at) }));
  const issues = [...(delivery.issueHistory || []), delivery.issue].filter(row => row && own(row.reportedBy));
  const seen = new Set(), events = [];
  for (const issue of issues) {
    const key = String(issue.reportedAt);
    if (seen.has(key)) continue;
    seen.add(key);
    if (recorded(issue.reportedAt)) events.push({ label: "Issue reported", at: issue.reportedAt, reason: issue.reason, previousStatus: issue.previousStatus });
    // Manager resolution text/identity remains private; only recorded outcome/time is shown.
    if (recorded(issue.resolvedAt)) events.push({ label: "Issue resolved — delivery resumed", at: issue.resolvedAt, previousStatus: issue.previousStatus });
  }
  return { steps, events: events.sort((a, b) => new Date(a.at) - new Date(b.at)) };
}
