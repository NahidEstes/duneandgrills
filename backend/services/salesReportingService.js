import Order from "../models/Order.js";
import Refund from "../models/Refund.js";
import { ADMIN_DAY_MS, ADMIN_TIMEZONE, toRiyadhDateKey } from "../utils/adminDate.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { SALES_SOURCES } from "../config/sales.js";

export const SALES_REPORT_DEFINITIONS = Object.freeze({
  timezone: ADMIN_TIMEZONE,
  salesAttribution: "Order date (original orderOccurredAt for historical delivery entries, otherwise createdAt). Refunds/voids adjust the original order cohort, regardless of completion date.",
  cashAttribution: "Payment/refund/void event date. POS capture is recorded at sale creation; completed refunds use completedAt and voids use voidedAt. Unknown historical payment/refund dates are not inferred from updatedAt or order date.",
  orderedAmount: "All order totals, including unpaid, pending and cancelled orders; not collected money.",
  grossSales: "Recorded captured order totals before completed refunds and captured-payment voids, after discounts; aggregator-prepaid sales are included but not restaurant collections.",
  collectedAmount: "Recorded captures before reversals, excluding aggregator-prepaid orders. Cash/Card/Other records are not bank/provider settlement verification.",
  completedRefunds: "Actual completed Refund amounts, reconciled with legacy completed-refund counters once, never inferred from order status alone.",
  netSales: "Gross sales minus completed refunds minus the remaining captured amount voided; not profit. Discounts are already included in order totals.",
});

export const salesSourceFilter = (query = {}) => {
  const match = {};
  if (query.source && query.source !== "all") {
    if (!SALES_SOURCES.includes(query.source)) throw new ValidationError("Invalid sales source");
    match.source = query.source === "website" ? { $in: ["website", null] } : query.source;
  }
  if (query.orderType && query.orderType !== "all") {
    if (!["dine-in", "takeaway", "pickup", "delivery"].includes(query.orderType)) throw new ValidationError("Invalid order type");
    match.orderType = query.orderType;
  }
  return match;
};

const inRange = (field, range) => range ? { $and: [{ $gte: [field, range.start] }, { $lt: [field, range.end] }] } : { $ne: [field, null] };
const sumMoney = (field) => ({ $sum: field });
const metrics = {
  orderedAmount: sumMoney("$totalAmount"), grossSales: sumMoney("$reportGross"),
  collectedAmount: sumMoney("$reportCollected"), completedRefunds: sumMoney("$reportRefund"),
  voidAmount: sumMoney("$reportVoid"), netSales: sumMoney("$reportNet"),
  aggregatorPrepaidAmount: sumMoney("$reportAggregator"), discountTotal: sumMoney("$reportDiscount"),
};
const round = (n) => Number(Number(n || 0).toFixed(2));
const serializeMetrics = (row = {}) => ({
  ...Object.fromEntries(Object.keys(metrics).map(key => [key, round(row[key])])),
  // Compatibility aliases have identical definitions, not a second calculation.
  revenue: round(row.netSales), totalRevenue: round(row.netSales), refundTotal: round(row.completedRefunds),
});

export async function buildSalesReport({ query = {}, range = null, orderFilter = {} } = {}) {
  const cohortMatch = range ? [{ $match: { reportOrderAt: { $gte: range.start, $lt: range.end } } }] : [];
  const breakdown = (field) => [...cohortMatch, { $group: { _id: field, orders: { $sum: 1 }, ...metrics } }, { $sort: { netSales: -1 } }];
  const [result] = await Order.aggregate([
    { $match: { $and: [salesSourceFilter(query), orderFilter] } },
    { $lookup: {
      from: Refund.collection.name, let: { orderId: "$_id" }, as: "reportRefunds",
      pipeline: [
        { $match: { status: "completed", $expr: { $eq: ["$order", "$$orderId"] } } },
        { $group: { _id: null, amount: { $sum: "$amountHalala" },
          datedAmount: { $sum: { $cond: [inRange("$completedAt", range), "$amountHalala", 0] } },
          cashAmount: { $sum: { $cond: [{ $and: [inRange("$completedAt", range), { $eq: ["$method", "cash"] }] }, "$amountHalala", 0] } },
          undatedAmount: { $sum: { $cond: [{ $eq: [{ $ifNull: ["$completedAt", null] }, null] }, "$amountHalala", 0] } },
        } },
      ],
    } },
    { $set: {
      reportOrderAt: { $ifNull: ["$orderOccurredAt", "$createdAt"] },
      reportRefund: { $divide: [{ $max: [
        { $ifNull: [{ $first: "$reportRefunds.amount" }, 0] },
        { $ifNull: ["$refundedAmountHalala", 0] },
        { $round: [{ $multiply: [{ $ifNull: ["$refundedAmount", 0] }, 100] }, 0] },
      ] }, 100] },
      reportIsVoid: { $ne: [{ $ifNull: ["$voidedAt", null] }, null] },
      reportIsAggregator: { $eq: ["$deliveryPaymentType", "aggregator_prepaid"] },
    } },
    { $set: { reportCaptured: { $or: [
      { $in: ["$paymentStatus", ["paid", "partially_refunded", "refunded"]] }, "$reportIsVoid", { $gt: ["$reportRefund", 0] },
    ] } } },
    { $set: {
      reportGross: { $cond: ["$reportCaptured", "$totalAmount", 0] },
      reportCollected: { $cond: [{ $and: ["$reportCaptured", { $not: ["$reportIsAggregator"] }] }, "$totalAmount", 0] },
      reportAggregator: { $cond: [{ $and: ["$reportCaptured", "$reportIsAggregator"] }, "$totalAmount", 0] },
      reportVoid: { $cond: ["$reportIsVoid", { $max: [{ $subtract: ["$totalAmount", "$reportRefund"] }, 0] }, 0] },
      reportDiscount: { $cond: ["$reportCaptured", { $ifNull: ["$discountAmount", 0] }, 0] },
      // Existing POS creates paid records atomically. Other channels have no capture timestamp/ledger.
      reportPaymentAt: { $cond: [{ $and: ["$reportCaptured", { $eq: ["$source", "pos"] }] }, "$createdAt", null] },
    } },
    { $set: { reportNet: { $subtract: [{ $subtract: ["$reportGross", "$reportRefund"] }, "$reportVoid"] } } },
    { $facet: {
      summary: [...cohortMatch, { $group: { _id: null, totalOrders: { $sum: 1 }, capturedOrders: { $sum: { $cond: ["$reportCaptured", 1, 0] } }, ...metrics } }],
      series: range ? [...cohortMatch, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$reportOrderAt", timezone: ADMIN_TIMEZONE } }, orders: { $sum: 1 }, ...metrics } }, { $sort: { _id: 1 } }] : [{ $match: { _id: null } }],
      sources: breakdown({ $ifNull: ["$source", "website"] }), orderTypes: breakdown("$orderType"),
      statuses: [...cohortMatch, { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { count: -1 } }],
      items: [...cohortMatch, { $match: { reportCaptured: true, reportIsVoid: false } }, { $unwind: "$items" },
        { $group: {
          _id: { type: "$items.productType", product: { $ifNull: ["$items.menuItem", "$items.combo"] }, name: "$items.name" },
          quantity: { $sum: "$items.quantity" }, revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        } }, { $sort: { quantity: -1, revenue: -1 } }],
      activity: [{ $group: {
        _id: null,
        collectedAmount: { $sum: { $cond: [inRange("$reportPaymentAt", range), "$reportCollected", 0] } },
        cashCollected: { $sum: { $cond: [{ $and: [inRange("$reportPaymentAt", range), { $eq: ["$paymentMethod", "cash"] }] }, "$reportCollected", 0] } },
        completedRefunds: { $sum: { $divide: [{ $ifNull: [{ $first: "$reportRefunds.datedAmount" }, 0] }, 100] } },
        cashRefunds: { $sum: { $divide: [{ $ifNull: [{ $first: "$reportRefunds.cashAmount" }, 0] }, 100] } },
        voidAmount: { $sum: { $cond: [inRange("$voidedAt", range), "$reportVoid", 0] } },
        cashVoids: { $sum: { $cond: [{ $and: [inRange("$voidedAt", range), { $eq: ["$paymentMethod", "cash"] }] }, "$reportVoid", 0] } },
        unknownPaymentDateAmount: { $sum: { $cond: [{ $eq: ["$reportPaymentAt", null] }, "$reportCollected", 0] } },
        unknownRefundDateAmount: { $sum: { $add: [
          { $max: [{ $subtract: ["$reportRefund", { $divide: [{ $ifNull: [{ $first: "$reportRefunds.amount" }, 0] }, 100] }] }, 0] },
          { $divide: [{ $ifNull: [{ $first: "$reportRefunds.undatedAmount" }, 0] }, 100] },
        ] } },
      } }],
    } },
  ]);
  const summary = result.summary[0] || {};
  const activity = result.activity[0] || {};
  const cashActivity = Object.fromEntries(Object.entries(activity).filter(([k]) => k !== "_id").map(([k, v]) => [k, round(v)]));
  cashActivity.netCollected = round(cashActivity.collectedAmount - cashActivity.completedRefunds - cashActivity.voidAmount);
  cashActivity.netCash = round(cashActivity.cashCollected - cashActivity.cashRefunds - cashActivity.cashVoids);
  const rows = new Map(result.series.map(row => [row._id, row]));
  const series = range ? Array.from({ length: range.days }, (_, index) => {
    const date = toRiyadhDateKey(new Date(range.start.getTime() + index * ADMIN_DAY_MS));
    const row = rows.get(date) || {};
    return { date, orders: row.orders || 0, ...serializeMetrics(row) };
  }) : [];
  const items = result.items.map(row => ({ ...row._id, productType: row._id.type, quantity: row.quantity, revenue: round(row.revenue) }));
  return {
    summary: { ...serializeMetrics(summary), totalOrders: summary.totalOrders || 0, capturedOrders: summary.capturedOrders || 0,
      averageOrderValue: round((summary.grossSales || 0) / Math.max(summary.capturedOrders || 0, 1)) },
    series, cashActivity, definitions: SALES_REPORT_DEFINITIONS,
    sourceBreakdown: result.sources.map(row => ({ source: row._id || "website", orders: row.orders, ...serializeMetrics(row) })),
    orderTypeBreakdown: result.orderTypes.map(row => ({ orderType: row._id || "unknown", orders: row.orders, ...serializeMetrics(row) })),
    statusBreakdown: result.statuses.map(row => ({ status: row._id, count: row.count })),
    bestSelling: items.slice(0, 8), leastSelling: [...items].sort((a, b) => a.quantity - b.quantity || a.revenue - b.revenue).slice(0, 8),
    itemAttribution: "Captured, non-voided item quantities and line values before order discounts/refunds; not net sales or returned-item quantities.",
  };
}
