import Order from "../models/Order.js";
import Delivery from "../models/Delivery.js";
import InventoryItem from "../models/InventoryItem.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { riderConfiguration } from "../config/rider.js";
import { orderAttentionFilter } from "./operationalAttentionService.js";
import { deliveryHealthPipeline } from "./deliveryHealthService.js";
import { getInventoryHealth } from "./inventoryHealthService.js";

const LIMIT = 12;
const has = (role, permission) => hasCapability(role, permission);
export const prioritySort = (a, b) => a.priority - b.priority || (a.since ? new Date(a.since).getTime() : Infinity) - (b.since ? new Date(b.since).getTime() : Infinity) || a.key.localeCompare(b.key);

export function orderDeliveryActionStages({ role, settings, now }) {
  const pendingBefore = new Date(now.getTime() - settings.preparation.pendingAttentionMinutes * 60000);
  const pending = { $and: [{ $eq: ["$status", "pending"] }, { $lt: [{ $ifNull: ["$kitchenReleaseAt", "$createdAt"] }, pendingBefore] }] };
  const overdue = { $and: [{ $ne: [{ $ifNull: ["$preparationDueAt", null] }, null] }, { $lt: ["$preparationDueAt", now] }] };
  const stages = [
    { $match: { $and: [{ $or: [orderAttentionFilter("pending_age", settings, now), orderAttentionFilter("preparation_overdue", settings, now)] }, { status: { $in: ["pending", "confirmed", "preparing"] } }] } },
    { $project: { key: { $concat: ["order:", { $toString: "$_id" }] }, recordId: "$_id", orderNumber: 1, deliveryId: { $literal: null },
      priority: { $cond: [overdue, 1, 2] }, since: { $cond: [overdue, "$preparationDueAt", { $ifNull: ["$kitchenReleaseAt", "$createdAt"] }] }, actionRank: { $literal: 4 },
      reasons: { $concatArrays: [{ $cond: [pending, ["Pending beyond the configured waiting threshold"], []] }, { $cond: [overdue, ["Preparation past its recorded deadline"], []] }] },
    } },
  ];
  const deliveryEnabled = settings.riderDelivery?.enabled === true || riderConfiguration().workflowEnabled;
  if (deliveryEnabled && has(role, CAPABILITIES.DELIVERY_MANAGE)) {
    const health = deliveryHealthPipeline(now);
    stages.push({ $unionWith: { coll: Delivery.collection.name, pipeline: [
      { $lookup: { from: Order.collection.name, localField: "order", foreignField: "_id", as: "orderRecord" } }, { $unwind: "$orderRecord" }, ...health.stages,
      { $match: { $or: ["ready_unassigned", "pickup_delayed", "delivery_delayed", "issue", "no_cash_report", "awaiting_cash", "discrepancy"].map(key => ({ [`attentionFlags.${key}`]: true })) } },
      { $project: { key: { $concat: ["order:", { $toString: "$order" }] }, recordId: "$order", deliveryId: "$_id", orderNumber: "$orderRecord.orderNumber",
        priority: { $cond: [{ $or: ["$attentionFlags.issue", "$attentionFlags.discrepancy"] }, 0, 1] },
        actionRank: { $switch: { branches: [{ case: { $eq: ["$status", "delivered"] }, then: 1 }, { case: "$attentionFlags.ready_unassigned", then: 2 }], default: 3 } },
        since: { $switch: { branches: [
          { case: "$attentionFlags.issue", then: "$issue.reportedAt" },
          { case: { $eq: ["$status", "delivered"] }, then: { $ifNull: ["$cashReport.reportedAt", "$deliveredAt"] } },
          { case: "$attentionFlags.ready_unassigned", then: "$orderRecord.readyAt" },
          { case: "$attentionFlags.pickup_delayed", then: "$pickupClock" },
        ], default: "$pickedUpAt" } },
        reasons: { $concatArrays: [
          { $cond: ["$attentionFlags.ready_unassigned", ["Food ready; no rider assigned"], []] },
          { $cond: ["$attentionFlags.pickup_delayed", ["Ready order waiting for assigned rider pickup"], []] },
          { $cond: ["$attentionFlags.delivery_delayed", ["Delivery exceeds the configured transit threshold"], []] },
          { $cond: ["$attentionFlags.issue", ["Unresolved delivery issue; manager review required"], []] },
          { $cond: ["$attentionFlags.no_cash_report", ["Delivered; customer collection has not been reported"], []] },
          { $cond: ["$attentionFlags.awaiting_cash", ["Rider reported collection; cashier receipt is not confirmed"], []] },
          { $cond: ["$attentionFlags.discrepancy", { $cond: [{ $ne: [{ $ifNull: ["$cashReport.acknowledgedAt", null] }, null] }, ["Cash discrepancy acknowledged; receipt/payment still not confirmed"], ["Cash discrepancy requires cashier/manager review"]] }, []] },
        ] },
        reportedCashHalala: { $cond: [{ $in: ["$healthCash", ["awaiting_confirmation", "discrepancy"]] }, "$cashReport.amountHalala", null] },
        ledgerOutstandingHalala: "$healthBalance", cashierAcknowledgedAt: "$cashReport.acknowledgedAt",
      } },
    ] } });
  }
  stages.push(
    { $group: { _id: "$key", recordId: { $first: "$recordId" }, orderNumber: { $first: "$orderNumber" }, deliveryId: { $max: "$deliveryId" }, priority: { $min: "$priority" }, since: { $min: "$since" }, actionRank: { $min: "$actionRank" }, reasons: { $push: "$reasons" }, reportedCashHalala: { $max: "$reportedCashHalala" }, ledgerOutstandingHalala: { $max: "$ledgerOutstandingHalala" }, cashierAcknowledgedAt: { $max: "$cashierAcknowledgedAt" } } },
    { $set: { key: "$_id", reasons: { $reduce: { input: "$reasons", initialValue: [], in: { $setUnion: ["$$value", "$$this"] } } } } },
    { $facet: { count: [{ $count: "total" }], rows: [{ $sort: { priority: 1, since: 1, _id: 1 } }, { $limit: LIMIT }] } },
  );
  return stages;
}

export function actionDestination(row) {
  if (row.deliveryId) return { label: row.actionRank === 1 ? "Review cash" : row.actionRank === 2 ? "Assign rider" : "Review delivery", href: `/admin/deliveries?${new URLSearchParams({ workspace: row.actionRank === 1 ? "cash" : "active", search: row.orderNumber })}` };
  return { label: "Review order", href: `/admin?${new URLSearchParams({ tab: "orders", order: row.recordId })}` };
}

export function inventoryPriorityActions(health) {
  return health.rows.filter(row => row.isActive !== false && ["out", "low", "blocked", "expiring"].some(key => row.stockHealth[key])).map(row => ({
    key: `stock:${row._id}`, recordId: String(row._id), recordNumber: row.sku || "SKU unavailable", name: row.name,
    priority: row.stockHealth.blocked ? 0 : row.stockHealth.out ? 1 : 2, since: null,
    reasons: [row.stockHealth.out ? "No saleable stock" : row.stockHealth.low ? "Saleable stock at or below reorder level" : null, row.stockHealth.blocked ? `Blocked stock: ${row.blockedReasons.join(", ")}` : null, row.stockHealth.expiring ? "Stock approaching expiry" : null].filter(Boolean),
    action: { label: "Open stock item", href: `/inventory/stock-items?edit=${encodeURIComponent(row._id)}` },
  }));
}

export async function getPriorityActions({ role, settings, categories, now }) {
  const sources = {}, actions = [];
  if (has(role, CAPABILITIES.ORDERS_READ_ALL)) {
    try {
      const [result] = await Order.aggregate(orderDeliveryActionStages({ role, settings, now }));
      sources.ordersAndDeliveries = { status: "success", total: result?.count[0]?.total || 0 };
      actions.push(...(result?.rows || []).map(row => ({ ...row, recordId: String(row.recordId), deliveryId: row.deliveryId ? String(row.deliveryId) : undefined, recordNumber: row.orderNumber, action: actionDestination(row) })));
    } catch { sources.ordersAndDeliveries = { status: "unavailable" }; }
  }
  if (has(role, CAPABILITIES.INVENTORY_READ)) {
    try {
      // Empty stock needs no expiry-setting/batch reads. Nonempty stock reuses
      // one bulk eligibility calculation, not a query for every alert/item.
      const items = await InventoryItem.find({ isActive: true }).select("name sku currentStock reorderLevel tracksExpiry expiryDate isActive unit").lean();
      const rows = items.length ? inventoryPriorityActions(await getInventoryHealth({ items, now })) : [];
      sources.stock = { status: "success", total: rows.length }; actions.push(...rows.sort(prioritySort).slice(0, LIMIT));
    }
    catch { sources.stock = { status: "unavailable" }; }
  }
  for (const category of ["purchase_approval", "invoice_review", "invoice_overdue"]) {
    const data = categories[category];
    if (data.status === "restricted") continue;
    sources[category] = { status: data.status, ...(data.status === "success" ? { total: data.total } : {}) };
    if (data.status !== "success") continue;
    for (const item of data.items) {
      const status = { purchase_approval: "submitted", invoice_review: "review_required", invoice_overdue: "overdue" }[category], reference = item.orderNumber || item.internalReference;
      actions.push({ key: `${category === "purchase_approval" ? "purchase" : "invoice"}:${item._id}`, recordId: String(item._id), recordNumber: reference, priority: category === "purchase_approval" ? 2 : 1, since: item.dueDate || item.submittedAt || item.updatedAt || item.createdAt,
        reasons: [{ purchase_approval: "Submitted purchase order awaiting approval", invoice_review: "Supplier invoice requires match review", invoice_overdue: "Supplier invoice has an overdue unpaid balance" }[category]],
        action: { label: category === "purchase_approval" ? "Review purchase order" : "Review invoice", href: `/inventory/${category === "purchase_approval" ? "purchase-orders" : "supplier-invoices"}?${new URLSearchParams({ status, search: reference })}` },
      });
    }
  }
  const complete = Object.values(sources).every(source => source.status === "success"), knownTotal = Object.values(sources).reduce((sum, source) => sum + (source.total || 0), 0);
  return { total: complete ? knownTotal : null, knownTotal, complete, sources, limit: LIMIT, items: actions.sort(prioritySort).slice(0, LIMIT), deliveryEnabled: settings.riderDelivery?.enabled === true || riderConfiguration().workflowEnabled };
}
