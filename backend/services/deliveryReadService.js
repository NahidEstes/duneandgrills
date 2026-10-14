import mongoose from "mongoose";
import Delivery from "../models/Delivery.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { startOfRiyadhDay, ADMIN_DAY_MS } from "../utils/adminDate.js";
import { escapeRegex } from "../utils/inventoryValidation.js";
import { assertDeliveryEnabled } from "./riderAccessService.js";
import { deliveryError, serializeDelivery } from "./deliveryContractService.js";
import { ATTENTION_KEYS, CASH_LABELS, deliveryHealthPipeline } from "./deliveryHealthService.js";
import { managementDeliveryQuery, activeAttentionMatch } from "./deliveryQueryService.js";
import { riderHistoryQuery, restaurantContact } from "./riderReadPresentation.js";

export const DELIVERY_STATES = Object.freeze(["unassigned", "assigned", "picked_up", "delivered", "issue"]);
export async function listWorkflowDeliveries(actor, query = {}) {
  const config = await assertDeliveryEnabled();
  const rider = actor?.role === "rider";
  if (!actor?._id || !hasCapability(actor.role, rider ? CAPABILITIES.RIDER_DELIVERY_OPERATE : CAPABILITIES.DELIVERY_CASH_CONFIRM)) throw deliveryError("Delivery access denied", 403);
  if (Object.keys(query).some(key => !["status", "search", "page", "limit", "history", "cashStatus", "datePeriod", "from", "to", ...(!rider ? ["workspace", "attention", "dateBasis", "riderId", "sort"] : [])].includes(key))) throw deliveryError("Unsupported delivery filter");
  const attention = query.attention || "all", cashStatus = query.cashStatus || "all";
  if (attention !== "all" && attention !== "needs_attention" && !ATTENTION_KEYS.includes(attention)) throw deliveryError("Invalid attention filter");
  if (cashStatus !== "all" && cashStatus !== "confirmed_today" && !Object.hasOwn(CASH_LABELS, cashStatus)) throw deliveryError("Invalid cash filter");
  const status = query.status || "all";
  if (status !== "all" && !DELIVERY_STATES.includes(status)) throw deliveryError("Invalid delivery status");
  const search = query.search || "";
  if (typeof search !== "string" || search.length > 80) throw deliveryError("Search must be at most 80 characters");
  const page = Number(query.page || 1), limit = Number(query.limit || 20);
  if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw deliveryError("Invalid pagination");
  const scope = rider ? { rider: new mongoose.Types.ObjectId(String(actor._id)) }
    : actor.role === "cashier" ? { status: "delivered", "cashReport.status": { $in: ["unconfirmed", "discrepancy", "confirmed"] } } : {};
  const rowMatch = { ...(rider ? { status: query.history === "true" ? "delivered" : { $ne: "delivered" } } : status === "all" ? {} : { status }),
    ...(search.trim() ? { "orderRecord.orderNumber": { $regex: escapeRegex(search.trim()), $options: "i" } } : {}) };
  const today = startOfRiyadhDay(), tomorrow = new Date(today.getTime() + ADMIN_DAY_MS);
  const now = new Date(), health = deliveryHealthPipeline(now);
  const management = !rider ? managementDeliveryQuery(actor, query, now) : null;
  if (rider) rowMatch.$and = [riderHistoryQuery(query, now), ...(status !== "all" ? [{ status }] : [])];
  if (management) {
    // Intersect stage-sort scope with explicit status rather than overwriting it.
    rowMatch.$and = [management.match];
  }
  if (!rider && attention === "needs_attention") rowMatch.$and.push(activeAttentionMatch());
  else if (!rider && attention !== "all") rowMatch[`attentionFlags.${attention}`] = true;
  if (!rider && cashStatus !== "all") rowMatch.healthCash = cashStatus === "confirmed_today" ? "confirmed" : cashStatus;
  if (cashStatus === "confirmed_today") rowMatch["cashReport.confirmedAt"] = { $gte: health.today, $lt: health.tomorrow };
  const [facet] = await Delivery.aggregate([
    { $match: scope },
    { $lookup: { from: "orders", localField: "order", foreignField: "_id", as: "orderRecord", pipeline: [{ $project: { orderNumber: 1, customer: { name: 1, address: 1 }, status: 1, totalAmount: 1, paymentStatus: 1, paymentRecords: 1, refundReservedHalala: 1, deliveryMode: 1, orderType: 1, source: 1, manualEntry: 1, deliveryProvider: 1, deliveryPaymentType: 1, inventoryStatus: 1, restoredItemQuantities: 1, readyAt: 1, __v: 1 } }] } },
    { $unwind: "$orderRecord" },
    ...health.stages,
    { $facet: {
      counts: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
      deliveredToday: [{ $match: { status: "delivered", deliveredAt: { $gte: today, $lt: tomorrow } } }, { $count: "count" }],
      rows: [{ $match: rowMatch }, ...(management ? management.stages : [{ $sort: { updatedAt: -1, _id: -1 } }]), { $skip: (page - 1) * limit }, { $limit: limit },
        { $lookup: { from: "users", localField: "rider", foreignField: "_id", as: "riderRecord", pipeline: [{ $project: { name: 1 } }] } }],
      total: [{ $match: rowMatch }, { $count: "count" }],
      ...(rider ? {
        pendingCash: [{ $match: { status: "delivered", healthCash: { $in: ["collection_pending", "awaiting_confirmation", "discrepancy"] } } },
          { $group: { _id: "$healthCash", count: { $sum: 1 }, amountHalala: { $sum: { $cond: [{ $eq: ["$healthCash", "collection_pending"] }, "$healthBalance", "$cashReport.amountHalala"] } } } }],
        pendingRows: [{ $match: { status: "delivered", healthCash: { $in: ["collection_pending", "awaiting_confirmation", "discrepancy"] } } },
          { $sort: { deliveredAt: -1, _id: -1 } }, { $limit: 5 }],
      } : {}),
      ...(!rider && hasCapability(actor.role, CAPABILITIES.DELIVERY_MANAGE) ? {
        riderFilters: [{ $match: { rider: { $ne: null } } }, { $group: { _id: "$rider" } },
          { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user", pipeline: [{ $project: { name: 1 } }] } },
          { $set: { name: { $ifNull: [{ $arrayElemAt: ["$user.name", 0] }, "Former rider"] } } }, { $sort: { name: 1, _id: 1 } }, { $limit: 101 }],
      } : {}),
      ...(!rider ? {
        activeAttention: [{ $match: activeAttentionMatch() }, { $count: "count" }],
        attention: [{ $group: { _id: null, ...Object.fromEntries(ATTENTION_KEYS.map(key => [key, { $sum: { $cond: [`$attentionFlags.${key}`, 1, 0] } }])) } }],
        cash: [{ $group: { _id: "$healthCash", count: { $sum: 1 }, amountHalala: { $sum: { $switch: { branches: [
          { case: { $eq: ["$healthCash", "collection_pending"] }, then: "$healthBalance" },
          { case: { $in: ["$healthCash", ["awaiting_confirmation", "discrepancy"]] }, then: "$cashReport.amountHalala" },
        ], default: 0 } } }, ledgerOutstandingHalala: { $sum: { $ifNull: ["$healthBalance", 0] } } } }],
        deliveredCash: [{ $match: { status: "delivered" } }, { $group: { _id: "$healthCash", count: { $sum: 1 }, amountHalala: { $sum: { $switch: { branches: [
          { case: { $eq: ["$healthCash", "collection_pending"] }, then: "$healthBalance" },
          { case: { $in: ["$healthCash", ["awaiting_confirmation", "discrepancy"]] }, then: "$cashReport.amountHalala" },
        ], default: 0 } } } } }],
        confirmedToday: [{ $match: { status: "delivered", healthCash: "confirmed", "cashReport.confirmedAt": { $gte: health.today, $lt: health.tomorrow } } }, { $group: { _id: null, count: { $sum: 1 }, amountHalala: { $sum: "$cashReport.amountHalala" } } }],
      } : {}),
    } },
  ]);
  const counts = Object.fromEntries(DELIVERY_STATES.map(status => [status, facet.counts.find(row => row._id === status)?.count || 0]));
  counts.active = counts.assigned + counts.picked_up + counts.issue;
  counts.deliveredToday = facet.deliveredToday[0]?.count || 0;
  const profile = rider ? await User.findById(actor._id).select("name email phone avatar employeeId role riderAvailable riderAvailabilityRevision").lean() : null;
  // Count only this rider's recorded assignment events, including earlier assignments.
  // It is independent of page/status filters and does not decrease on completion/reassignment.
  const assignments = rider ? await Delivery.aggregate([
    { $match: { "assignmentHistory.rider": actor._id } }, { $unwind: "$assignmentHistory" },
    { $match: { "assignmentHistory.rider": actor._id } }, { $count: "count" },
  ]) : [];
  return { success: true, ...config,
    counts, deliveries: facet.rows.map(row => ({ ...serializeDelivery(row, row.orderRecord, row.riderRecord[0]), ...(!rider ? { attention: Object.keys(row.attentionFlags).filter(key => row.attentionFlags[key]), pickupClock: row.pickupClock } : {}) })),
    ...(rider ? { assignmentCount: assignments[0]?.count || 0, restaurantContact: await restaurantContact(),
      pendingCash: { groups: Object.fromEntries(["collection_pending", "awaiting_confirmation", "discrepancy"].map(key => {
        const group = facet.pendingCash.find(row => row._id === key);
        return [key, { count: group?.count || 0, amountHalala: group?.amountHalala || 0 }];
      })), deliveries: facet.pendingRows.map(row => serializeDelivery(row, row.orderRecord)), limit: 5 },
    } : {}),
    ...(!rider ? { health: { scope: actor.role === "cashier" ? "Delivered cash reports visible to cashier" : "All authorized restaurant deliveries; independent of table filters and pagination", updatedAt: now,
      thresholds: health.thresholds, activeAttentionCount: facet.activeAttention[0]?.count || 0, attention: Object.fromEntries(ATTENTION_KEYS.map(key => [key, facet.attention[0]?.[key] || 0])),
      cash: Object.fromEntries(Object.keys(CASH_LABELS).map(key => [key, { count: facet.cash.find(row => row._id === key)?.count || 0, amountHalala: facet.cash.find(row => row._id === key)?.amountHalala || 0, ledgerOutstandingHalala: facet.cash.find(row => row._id === key)?.ledgerOutstandingHalala || 0 }])),
      deliveredCash: Object.fromEntries(Object.keys(CASH_LABELS).map(key => [key, { count: facet.deliveredCash.find(row => row._id === key)?.count || 0, amountHalala: facet.deliveredCash.find(row => row._id === key)?.amountHalala || 0 }])),
      confirmedToday: { count: facet.confirmedToday[0]?.count || 0, amountHalala: facet.confirmedToday[0]?.amountHalala || 0, start: health.today, endExclusive: health.tomorrow },
    } } : {}),
    pagination: { page, limit, total: facet.total[0]?.count || 0 },
    ...(management ? { appliedFilters: management.applied } : {}),
    ...(facet.riderFilters ? { riderFilters: facet.riderFilters.slice(0, 100).map(row => ({ id: String(row._id), name: row.name })), riderFiltersHasMore: facet.riderFilters.length > 100 } : {}),
    ...(profile ? { profile: { id: String(profile._id), name: profile.name, role: profile.role, employeeId: profile.employeeId, email: profile.email, phone: profile.phone, avatar: profile.avatar || "" },
      availability: profile.riderAvailable === true, availabilityRevision: profile.riderAvailabilityRevision || 0 } : {}), serverNow: now };
}

export async function listAssignableRiders(actor) {
  await assertDeliveryEnabled();
  if (!hasCapability(actor?.role, CAPABILITIES.DELIVERY_MANAGE)) throw deliveryError("Assignment access denied", 403);
  const users = await User.find({ role: "rider", isActive: { $ne: false } }).select("name employeeId riderAvailable riderAvailabilityRevision").sort({ name: 1, _id: 1 }).limit(100).lean();
  const counts = await Delivery.aggregate([{ $match: { rider: { $in: users.map(user => user._id) }, status: { $in: ["assigned", "picked_up", "issue"] } } }, { $group: { _id: "$rider", count: { $sum: 1 } } }]);
  return users.map(user => ({ id: String(user._id), name: user.name, employeeId: user.employeeId,
    available: user.riderAvailable === true, activeCount: counts.find(row => String(row._id) === String(user._id))?.count || 0 }));
}

export async function findEnrollmentOrder(actor, number) {
  await assertDeliveryEnabled();
  if (!hasCapability(actor?.role, CAPABILITIES.DELIVERY_MANAGE)) throw deliveryError("Assignment access denied", 403);
  if (typeof number !== "string" || !number.trim() || number.length > 80) throw deliveryError("Enter an exact existing order number");
  const order = await Order.findOne({ orderNumber: number.trim().toUpperCase() }).select("orderNumber orderType source manualEntry deliveryProvider deliveryMode status paymentStatus __v").lean();
  if (!order) throw deliveryError("Order unavailable", 404);
  return { id: String(order._id), orderNumber: order.orderNumber, revision: order.__v || 0, status: order.status, orderType: order.orderType, source: order.source };
}
