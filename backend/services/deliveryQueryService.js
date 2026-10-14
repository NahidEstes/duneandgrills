import mongoose from "mongoose";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { ADMIN_DAY_MS, riyadhDateRange, startOfRiyadhDay } from "../utils/adminDate.js";
import { deliveryError } from "./deliveryContractService.js";

export const ACTIVE_DELIVERY_ATTENTION = Object.freeze(["ready_unassigned", "pickup_delayed", "delivery_delayed", "issue", "timing_unavailable"]);
export const activeAttentionMatch = () => ({ status: { $ne: "delivered" }, $or: ACTIVE_DELIVERY_ATTENTION.map(key => ({ [`attentionFlags.${key}`]: true })) });

const allowed = (value, choices, label) => {
  if (!choices.includes(value)) throw deliveryError(`Invalid ${label}`);
  return value;
};

// Management-only additions. Rider list/history retain their existing contract.
export function managementDeliveryQuery(actor, query, now = new Date()) {
  const workspace = allowed(query.workspace || "all", ["all", "active", "cash", "history"], "delivery workspace");
  if (workspace === "active" && !hasCapability(actor.role, CAPABILITIES.DELIVERY_MANAGE)) throw deliveryError("Active delivery management requires management access", 403);
  const datePeriod = allowed(query.datePeriod || "all", ["all", "today", "yesterday", "custom"], "date period");
  const dateBasis = allowed(query.dateBasis || "enrolled", ["enrolled", "delivered"], "date basis");
  const sort = allowed(query.sort || "newest", ["newest", "oldest", "delivered_newest", "delivered_oldest", "oldest_waiting", "assigned_longest", "picked_up_longest"], "sort");
  const riderId = query.riderId || "all";
  if (Object.hasOwn(query, "riderId") && !hasCapability(actor.role, CAPABILITIES.DELIVERY_MANAGE)) throw deliveryError("Rider filtering requires management access", 403);
  if (typeof riderId !== "string" || ( !["all", "unassigned"].includes(riderId) && !/^[a-fA-F0-9]{24}$/.test(riderId))) throw deliveryError("Invalid rider filter");
  if (datePeriod !== "custom" && (query.from || query.to)) throw deliveryError("Date bounds require Custom date range");
  let range;
  if (datePeriod === "custom") {
    if (!query.from || !query.to) throw deliveryError("Custom range requires both dates");
    range = riyadhDateRange({ from: query.from, to: query.to });
  } else if (datePeriod !== "all") {
    const start = new Date(startOfRiyadhDay(now).getTime() - (datePeriod === "yesterday" ? ADMIN_DAY_MS : 0));
    range = { $gte: start, $lt: new Date(start.getTime() + ADMIN_DAY_MS) };
  }
  const match = {
    ...(workspace === "active" ? { status: { $ne: "delivered" } } : ["cash", "history"].includes(workspace) ? { status: "delivered" } : {}),
    ...(range ? { [dateBasis === "enrolled" ? "createdAt" : "deliveredAt"]: range } : {}),
    ...(riderId === "all" ? {} : { rider: riderId === "unassigned" ? null : new mongoose.Types.ObjectId(riderId) }),
  };
  // Workspace and stage-sort constraints intersect; a contradictory query never escapes its tab.
  const stage = sort === "oldest_waiting" ? { status: "unassigned", "orderRecord.status": "ready", healthEligible: true }
    : sort === "assigned_longest" ? { status: "assigned", healthEligible: true }
      : sort === "picked_up_longest" ? { status: "picked_up", healthEligible: true } : null;
  if (stage) match.$and = [stage];
  const clock = sort === "oldest_waiting" ? "$orderRecord.readyAt" : sort === "assigned_longest" ? "$assignedAt" : sort === "picked_up_longest" ? "$pickedUpAt" : sort.startsWith("delivered_") ? "$deliveredAt" : "$createdAt";
  return { match, stages: [
    { $set: { managementSortClock: clock } },
    { $set: { managementClockMissing: { $cond: [{ $eq: [{ $type: "$managementSortClock" }, "date"] }, 0, 1] } } },
    { $sort: { managementClockMissing: 1, managementSortClock: ["newest", "delivered_newest"].includes(sort) ? -1 : 1, _id: ["newest", "delivered_newest"].includes(sort) ? -1 : 1 } },
  ], applied: { workspace, datePeriod, dateBasis, riderId, sort, ...(range ? { start: range.$gte, endExclusive: range.$lt } : {}) } };
}
