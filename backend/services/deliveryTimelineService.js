import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { deliveryError, outstandingDeliveryHalala } from "./deliveryContractService.js";

const labels = {
  enrolled: "Enrolled", assign: "Assigned", pickup: "Picked up", issue: "Delivery issue reported",
  resolve_issue: "Issue resolved", deliver: "Delivered", report_cash: "Cash reported · not a payment",
  acknowledge_cash: "Discrepancy acknowledged · not a payment", confirm_cash: "Cashier receipt confirmed",
};
const auditActions = Object.keys(labels).map(key => key === "enrolled" ? "DELIVERY_ENROLLED" : `DELIVERY_${key.toUpperCase()}`);
const stamp = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;
const ref = value => typeof value === "string" ? value : value?.toHexString?.() || null;

// Pure adapter: private records in, allowlisted presentation out. Never backfills history.
export function buildDeliveryTimeline(delivery, order, audits = [], users = [], { truncated = false } = {}) {
  const events = [], limitations = [];
  const add = (action, at, data = {}) => events.push({ id: `record:${events.length}:${action}`, action, label: labels[action], at: stamp(at), source: "delivery", ...data });
  add("enrolled", delivery.createdAt, { reason: delivery.enrollmentReason || "" });
  const assignments = delivery.assignmentHistory || [];
  for (const [index, entry] of assignments.entries()) add("assign", entry.at, { label: index ? "Reassigned" : "Assigned", actorId: ref(entry.actor), riderId: ref(entry.rider), reason: entry.reason || "" });
  if (!assignments.length && (delivery.assignedAt || delivery.assignedBy)) add("assign", delivery.assignedAt, { actorId: ref(delivery.assignedBy), riderId: ref(delivery.rider) });
  if (delivery.pickedUpAt) add("pickup", delivery.pickedUpAt);
  const issues = [...(delivery.issueHistory || [])];
  const sameIssue = (a, b) => stamp(a.reportedAt) === stamp(b.reportedAt) && ref(a.reportedBy) === ref(b.reportedBy) && a.reason === b.reason && a.previousStatus === b.previousStatus;
  if (delivery.issue?.reportedAt && !issues.some(entry => sameIssue(entry, delivery.issue))) issues.push(delivery.issue);
  for (const issue of issues) {
    add("issue", issue.reportedAt, { actorId: ref(issue.reportedBy), reason: issue.reason || "", fromStatus: issue.previousStatus, toStatus: "issue" });
    if (issue.resolvedAt) add("resolve_issue", issue.resolvedAt, { actorId: ref(issue.resolvedBy), reason: issue.resolution || "", fromStatus: "issue", toStatus: issue.previousStatus });
  }
  if (delivery.deliveredAt) add("deliver", delivery.deliveredAt);
  const cash = delivery.cashReport || {};
  if (cash.reportedAt) add("report_cash", cash.reportedAt, { actorId: ref(cash.reportedBy), reason: cash.reason || "", amountHalala: cash.amountHalala });
  if (cash.acknowledgedAt) add("acknowledge_cash", cash.acknowledgedAt, { actorId: ref(cash.acknowledgedBy), reason: cash.acknowledgmentReason || "" });
  if (cash.confirmedAt) add("confirm_cash", cash.confirmedAt, { actorId: ref(cash.confirmedBy), amountHalala: cash.amountHalala });

  // Transaction audit stamps can be milliseconds later than the recorded action.
  // Match one-to-one by action, recorded actor/rider and closest transaction time.
  const sortedAudits = [...audits].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || ref(a._id).localeCompare(ref(b._id)));
  const matches = new Map(), used = new Set();
  const compatible = (event, audit) => event.action === (audit.action === "DELIVERY_ENROLLED" ? "enrolled" : audit.action?.slice(9).toLowerCase())
    && (!event.actorId || !audit.actor || event.actorId === ref(audit.actor))
    && (!event.riderId || !ref(audit.related?.rider) || event.riderId === ref(audit.related.rider));
  const pairs = sortedAudits.flatMap(audit => events.filter(event => compatible(event, audit) && event.at && stamp(audit.createdAt))
    .map(event => ({ audit, event, distance: Math.abs(new Date(event.at) - new Date(audit.createdAt)) })).filter(pair => pair.distance <= 60000));
  for (const { audit, event } of pairs.sort((a, b) => a.distance - b.distance || ref(a.audit._id).localeCompare(ref(b.audit._id)))) {
    if (!matches.has(ref(audit._id)) && !used.has(event.id)) { matches.set(ref(audit._id), event); used.add(event.id); }
  }
  for (const audit of sortedAudits) {
    if (matches.has(ref(audit._id))) continue;
    const event = events.find(event => !event.at && !used.has(event.id) && compatible(event, audit));
    if (event) { matches.set(ref(audit._id), event); used.add(event.id); }
  }
  for (const audit of sortedAudits) {
    const action = audit.action === "DELIVERY_ENROLLED" ? "enrolled" : audit.action?.slice(9).toLowerCase();
    if (!labels[action]) continue;
    let event = matches.get(ref(audit._id));
    if (!event) {
      event = { id: `audit:${audit._id}`, action, label: action === "assign" && audit.before?.status === "assigned" ? "Reassigned" : labels[action], at: stamp(audit.createdAt), source: "audit", timestampBasis: "Audit recorded time" };
      events.push(event);
    } else {
      if (!event.at) { event.at = stamp(audit.createdAt); event.timestampBasis = "Audit recorded time; action timestamp unavailable"; }
      if (action === "assign" && audit.before?.status === "assigned") event.label = "Reassigned";
    }
    event.actorId ||= ref(audit.actor);
    if (audit.actorName) event.actor = { name: audit.actorName, role: audit.actorRole || null, source: "audit snapshot" };
    if (audit.before?.status) event.fromStatus = audit.before.status;
    if (audit.after?.status) event.toStatus = audit.after.status;
    if (audit.after?.cashStatus) event.recordedCashStatus = audit.after.cashStatus;
    if (Number.isInteger(audit.after?.revision)) event.revision = audit.after.revision;
    event.riderId ||= ref(audit.related?.rider);
    // Delivery records hold private reasons. Generic audit redactions are not reasons.
  }
  const people = new Map(users.map(user => [ref(user._id), user]));
  for (const event of events) {
    const person = people.get(event.actorId), rider = people.get(event.riderId);
    if (!event.actor && person) event.actor = { name: person.name, role: person.role, source: "current profile of recorded actor" };
    if (rider) event.riderName = rider.name;
    if (!event.at) limitations.push(`${event.label}: historical timestamp was not recorded.`);
  }
  const progressed = ["picked_up", "delivered"].includes(delivery.status) || (delivery.status === "issue" && delivery.issue?.previousStatus === "picked_up");
  const expected = ["enrolled", ...(delivery.rider || progressed ? ["assign"] : []), ...(progressed ? ["pickup"] : []), ...(delivery.status === "issue" ? ["issue"] : []), ...(delivery.status === "delivered" ? ["deliver"] : []), ...(cash.status && cash.status !== "none" ? ["report_cash"] : []), ...(cash.status === "confirmed" ? ["confirm_cash"] : [])];
  for (const action of expected) if (!events.some(event => event.action === action)) limitations.push(`${labels[action]}: no historical event timestamp or audit entry is available.`);
  if (events.some(event => !event.actor)) limitations.push("Actor was not recorded or is unavailable for some events; no actor has been inferred from the current rider.");
  if (truncated) limitations.push("Only the latest 500 audit events are available here; recorded assignment/issue histories are still included.");
  events.sort((a, b) => (a.at ? new Date(a.at).getTime() : Infinity) - (b.at ? new Date(b.at).getTime() : Infinity) || (a.revision != null && b.revision != null ? a.revision - b.revision : 0) || Object.keys(labels).indexOf(a.action) - Object.keys(labels).indexOf(b.action) || a.id.localeCompare(b.id));
  const pending = delivery.status === "unassigned" ? ["Assignment pending", "Pickup pending", "Delivery pending"]
    : delivery.status === "assigned" ? ["Pickup pending", "Delivery pending"] : delivery.status === "picked_up" ? ["Delivery pending"]
      : delivery.status === "issue" ? ["Issue resolution pending"] : [];
  if (delivery.status === "delivered" && cash.status === "none" && outstandingDeliveryHalala(order) > 0) pending.push("Cash report pending · payment not confirmed");
  if (cash.status === "unconfirmed") pending.push("Cashier receipt confirmation pending");
  if (cash.status === "discrepancy") pending.push("Cash discrepancy requires review · acknowledgment does not confirm payment");
  return { events, pending, limitations: [...new Set(limitations)], timezone: "Asia/Riyadh" };
}

export async function readDeliveryTimeline(actor, delivery, order) {
  if (!actor?._id || actor.role === "rider" || (actor.role === "cashier" && delivery.status !== "delivered") || !hasCapability(actor.role, CAPABILITIES.DELIVERY_CASH_CONFIRM)) throw deliveryError("Private delivery history access denied", 403);
  const audits = await AuditLog.find({ action: { $in: auditActions }, $or: [
    { entityType: "Delivery", entityId: delivery._id },
    { entityType: "Order", entityId: order._id, action: "DELIVERY_ENROLLED" },
  ] }).select("actor actorName actorRole action related.rider before.status after.status after.cashStatus after.revision createdAt").sort({ createdAt: -1, _id: -1 }).limit(501).lean();
  const ids = new Set([delivery.assignedBy, delivery.rider, ...(delivery.assignmentHistory || []).flatMap(entry => [entry.actor, entry.rider]),
    ...[...(delivery.issueHistory || []), delivery.issue || {}].flatMap(entry => [entry.reportedBy, entry.resolvedBy]),
    delivery.cashReport?.reportedBy, delivery.cashReport?.acknowledgedBy, delivery.cashReport?.confirmedBy, ...audits.map(entry => entry.actor)].filter(Boolean).map(String));
  const users = await User.find({ _id: { $in: [...ids] } }).select("name role").lean();
  return buildDeliveryTimeline(delivery, order, audits.slice(0, 500), users, { truncated: audits.length > 500 });
}
