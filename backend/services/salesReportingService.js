import Order from "../models/Order.js";
import Refund from "../models/Refund.js";
import { ADMIN_DAY_MS, ADMIN_TIMEZONE, toRiyadhDateKey } from "../utils/adminDate.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { SALES_SOURCES } from "../config/sales.js";

export const SALES_REPORT_DEFINITIONS = Object.freeze({
  timezone: ADMIN_TIMEZONE,
  salesAttribution: "Order date (original orderOccurredAt for historical delivery entries, otherwise createdAt). Refunds/voids adjust the original order cohort, regardless of completion date.",
  cashAttribution: "Payment/refund/void event date. POS capture uses sale creation; online/COD collections use the payment record timestamp. Refunds use completedAt and voids use voidedAt. Unknown historical dates are not inferred.",
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

// Restrict dashboard enrichment to the selected/comparison order cohorts and
// current dated cash events. The union retains refunds of much older orders.
// Deduplication happens before refund lookup, so a cohort + event order counts once.
function dashboardCandidates(range, previous) {
  const dateMatch = period => ({ $gte: period.start, $lt: period.end });
  const cohorts = [range, previous].filter(Boolean);
  const orderDates = cohorts.flatMap(period => [
    { orderOccurredAt: dateMatch(period) },
    { orderOccurredAt: null, createdAt: dateMatch(period) },
  ]);
  return [
    { $match: { $or: [...orderDates, { source: "pos", createdAt: dateMatch(range) }, { "paymentRecords.recordedAt": dateMatch(range) }, { voidedAt: dateMatch(range) }] } },
    { $unionWith: { coll: Refund.collection.name, pipeline: [
      { $match: { status: "completed", completedAt: dateMatch(range) } },
      { $group: { _id: "$order" } },
      { $lookup: { from: Order.collection.name, localField: "_id", foreignField: "_id", as: "order" } },
      { $unwind: "$order" }, { $replaceRoot: { newRoot: "$order" } },
    ] } },
    { $group: { _id: "$_id", order: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$order" } },
  ];
}

export async function buildSalesReport({ query = {}, range = null, orderFilter = {}, dashboardPeriods = null, dashboardMode = false } = {}) {
  const seriesRange = dashboardPeriods?.current || range;
  const activityRange = seriesRange;
  const periodMatch = period => [{ $match: { reportOrderAt: { $gte: period.start, $lt: period.end } } }];
  const cohortMatch = range ? [{ $match: { reportOrderAt: { $gte: range.start, $lt: range.end } } }] : [];
  const breakdown = (field) => [...cohortMatch, { $group: { _id: field, orders: { $sum: 1 }, ...metrics } }, { $sort: { netSales: -1 } }];
  const candidates = dashboardMode && range ? dashboardCandidates(range, dashboardPeriods?.previous) : [];
  const [result] = await Order.aggregate([
    ...candidates,
    { $match: { $and: [salesSourceFilter(query), orderFilter] } },
    { $project: { source: 1, orderType: 1, status: 1, createdAt: 1, orderOccurredAt: 1, totalAmount: 1, paymentStatus: 1, deliveryPaymentType: 1, voidedAt: 1, paymentMethod: 1, paymentRecords: 1, refundedAmountHalala: 1, refundedAmount: 1, discountAmount: 1, "items.productType": 1, "items.menuItem": 1, "items.combo": 1, "items.name": 1, "items.quantity": 1, "items.price": 1 } },
    { $lookup: {
      from: Refund.collection.name, let: { orderId: "$_id" }, as: "reportRefunds",
      pipeline: [
        { $match: { status: "completed", $expr: { $eq: ["$order", "$$orderId"] } } },
        { $group: { _id: null, amount: { $sum: "$amountHalala" },
          datedAmount: { $sum: { $cond: [inRange("$completedAt", activityRange), "$amountHalala", 0] } },
          cashAmount: { $sum: { $cond: [{ $and: [inRange("$completedAt", activityRange), { $eq: ["$method", "cash"] }] }, "$amountHalala", 0] } },
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
      reportPaymentAt: { $cond: ["$reportCaptured", { $ifNull: [{ $first: "$paymentRecords.recordedAt" }, { $cond: [{ $eq: ["$source", "pos"] }, "$createdAt", null] }] }, null] },
    } },
    { $set: { reportNet: { $subtract: [{ $subtract: ["$reportGross", "$reportRefund"] }, "$reportVoid"] } } },
    { $facet: {
      summary: [...cohortMatch, { $group: { _id: null, totalOrders: { $sum: 1 }, capturedOrders: { $sum: { $cond: ["$reportCaptured", 1, 0] } }, ...metrics } }],
      series: seriesRange ? [...periodMatch(seriesRange), { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$reportOrderAt", timezone: ADMIN_TIMEZONE } }, orders: { $sum: 1 }, ...metrics } }, { $sort: { _id: 1 } }] : [{ $match: { _id: null } }],
      ...(dashboardPeriods ? {
        currentSummary: [...periodMatch(dashboardPeriods.current), { $group: { _id: null, ...metrics } }],
        previousSummary: [...periodMatch(dashboardPeriods.previous), { $group: { _id: null, ...metrics } }],
        orderCounts: [{ $group: { _id: null,
          currentOrders: { $sum: { $cond: [inRange("$reportOrderAt", dashboardPeriods.current), 1, 0] } },
          previousOrders: { $sum: { $cond: [inRange("$reportOrderAt", dashboardPeriods.previous), 1, 0] } },
          currentCompleted: { $sum: { $cond: [{ $and: [inRange("$reportOrderAt", dashboardPeriods.current), { $eq: ["$status", "delivered"] }] }, 1, 0] } },
          previousCompleted: { $sum: { $cond: [{ $and: [inRange("$reportOrderAt", dashboardPeriods.previous), { $eq: ["$status", "delivered"] }] }, 1, 0] } },
        } }],
      } : dashboardMode ? {} : { sources: breakdown({ $ifNull: ["$source", "website"] }), orderTypes: breakdown("$orderType") }),
      statuses: [...cohortMatch, { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { count: -1 } }],
      items: dashboardMode ? [{ $match: { _id: null } }] : [...cohortMatch, { $match: { reportCaptured: true, reportIsVoid: false } }, { $unwind: "$items" },
        { $group: {
          _id: { type: "$items.productType", product: { $ifNull: ["$items.menuItem", "$items.combo"] }, name: "$items.name" },
          quantity: { $sum: "$items.quantity" }, revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        } }, { $sort: { quantity: -1, revenue: -1 } }, ...(dashboardPeriods ? [{ $limit: 5 }] : [])],
      activity: [{ $group: {
        _id: null,
        collectedAmount: { $sum: { $cond: [inRange("$reportPaymentAt", activityRange), "$reportCollected", 0] } },
        cashCollected: { $sum: { $cond: [{ $and: [inRange("$reportPaymentAt", activityRange), { $eq: ["$paymentMethod", "cash"] }] }, "$reportCollected", 0] } },
        completedRefunds: { $sum: { $divide: [{ $ifNull: [{ $first: "$reportRefunds.datedAmount" }, 0] }, 100] } },
        cashRefunds: { $sum: { $divide: [{ $ifNull: [{ $first: "$reportRefunds.cashAmount" }, 0] }, 100] } },
        voidAmount: { $sum: { $cond: [inRange("$voidedAt", activityRange), "$reportVoid", 0] } },
        cashVoids: { $sum: { $cond: [{ $and: [inRange("$voidedAt", activityRange), { $eq: ["$paymentMethod", "cash"] }] }, "$reportVoid", 0] } },
        unknownPaymentDateAmount: { $sum: { $cond: [{ $and: [{ $eq: ["$reportPaymentAt", null] }, ...(dashboardMode ? [inRange("$reportOrderAt", range)] : [])] }, "$reportCollected", 0] } },
        unknownRefundDateAmount: { $sum: { $cond: [dashboardMode ? inRange("$reportOrderAt", range) : true, { $add: [
          { $max: [{ $subtract: ["$reportRefund", { $divide: [{ $ifNull: [{ $first: "$reportRefunds.amount" }, 0] }, 100] }] }, 0] },
          { $divide: [{ $ifNull: [{ $first: "$reportRefunds.undatedAmount" }, 0] }, 100] },
        ] }, 0] } },
      } }],
    } },
  ]);
  const summary = result.summary[0] || {};
  const activity = result.activity[0] || Object.fromEntries([
    "collectedAmount", "cashCollected", "completedRefunds", "cashRefunds", "voidAmount", "cashVoids",
    "unknownPaymentDateAmount", "unknownRefundDateAmount",
  ].map(key => [key, 0]));
  const cashActivity = Object.fromEntries(Object.entries(activity).filter(([k]) => k !== "_id").map(([k, v]) => [k, round(v)]));
  if (dashboardMode) cashActivity.unknownDateScope = "Selected order-date cohort";
  cashActivity.netCollected = round(cashActivity.collectedAmount - cashActivity.completedRefunds - cashActivity.voidAmount);
  cashActivity.netCash = round(cashActivity.cashCollected - cashActivity.cashRefunds - cashActivity.cashVoids);
  const rows = new Map(result.series.map(row => [row._id, row]));
  const series = seriesRange ? Array.from({ length: seriesRange.days }, (_, index) => {
    const date = toRiyadhDateKey(new Date(seriesRange.start.getTime() + index * ADMIN_DAY_MS));
    const row = rows.get(date) || {};
    return { date, orders: row.orders || 0, ...serializeMetrics(row) };
  }) : [];
  const items = result.items.map(row => ({ ...row._id, productType: row._id.type, quantity: row.quantity, revenue: round(row.revenue) }));
  return {
    summary: { ...serializeMetrics(summary), totalOrders: summary.totalOrders || 0, capturedOrders: summary.capturedOrders || 0,
      averageOrderValue: round((summary.grossSales || 0) / Math.max(summary.capturedOrders || 0, 1)) },
    series, cashActivity, definitions: SALES_REPORT_DEFINITIONS,
    sourceBreakdown: (result.sources || []).map(row => ({ source: row._id || "website", orders: row.orders, ...serializeMetrics(row) })),
    orderTypeBreakdown: (result.orderTypes || []).map(row => ({ orderType: row._id || "unknown", orders: row.orders, ...serializeMetrics(row) })),
    statusBreakdown: result.statuses.map(row => ({ status: row._id, count: row.count })),
    bestSelling: items.slice(0, 8), leastSelling: [...items].sort((a, b) => a.quantity - b.quantity || a.revenue - b.revenue).slice(0, 8),
    ...(dashboardPeriods ? { dashboard: { currentSummary: serializeMetrics(result.currentSummary[0]), previousSummary: serializeMetrics(result.previousSummary[0]), orderCounts: result.orderCounts[0] || {} } } : {}),
    itemAttribution: "Captured, non-voided item quantities and line values before order discounts/refunds; not net sales or returned-item quantities.",
  };
}
