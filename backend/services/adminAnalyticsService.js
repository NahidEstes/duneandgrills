import Order from "../models/Order.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { NON_REVENUE_ORDER_STATUSES } from "../config/orderStatuses.js";

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const riyadhParts = (date) => {
  const shifted = new Date(date.getTime() + RIYADH_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
};

const riyadhBoundary = (year, month, day) => new Date(Date.UTC(year, month, day) - RIYADH_OFFSET_MS);

const parseDateInput = (value, end = false) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) throw new ValidationError("Custom dates must use YYYY-MM-DD");
  const [year, month, day] = value.split("-").map(Number);
  const date = riyadhBoundary(year, month - 1, day);
  const parts = riyadhParts(date);
  if (Number.isNaN(date.getTime()) || parts.year !== year || parts.month !== month - 1 || parts.day !== day) {
    throw new ValidationError("Invalid analytics date");
  }
  return end ? new Date(date.getTime() + DAY_MS) : date;
};

export const resolveAnalyticsRange = ({ period = "week", from, to }, now = new Date()) => {
  const parts = riyadhParts(now);
  const today = riyadhBoundary(parts.year, parts.month, parts.day);
  let start;
  let end = new Date(today.getTime() + DAY_MS);
  if (period === "today") start = today;
  else if (period === "week") start = new Date(today.getTime() - 6 * DAY_MS);
  else if (period === "month") start = riyadhBoundary(parts.year, parts.month, 1);
  else if (period === "custom") {
    if (!from || !to) throw new ValidationError("Choose both From and To dates");
    start = parseDateInput(from);
    end = parseDateInput(to, true);
  } else throw new ValidationError("period must be today, week, month or custom");
  if (start >= end) throw new ValidationError("From date must be before or equal to To date");
  const days = Math.ceil((end - start) / DAY_MS);
  if (days > 366) throw new ValidationError("Analytics date range cannot exceed 366 days");
  return { start, end, days, period };
};

const dateKey = (date) => new Date(date.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);

const buildSeries = (rows, start, days) => {
  const values = new Map(rows.map((row) => [row._id, row]));
  return Array.from({ length: days }, (_, index) => {
    const key = dateKey(new Date(start.getTime() + index * DAY_MS));
    const row = values.get(key);
    return { date: key, orders: row?.orders || 0, revenue: Number((row?.revenue || 0).toFixed(2)) };
  });
};

export const buildAdminAnalytics = async (query = {}) => {
  const range = resolveAnalyticsRange(query);
  const match = { createdAt: { $gte: range.start, $lt: range.end } };
  if (query.source && query.source !== "all") {
    match.source = query.source === "website" ? { $in: ["website", null] } : query.source;
  }
  if (query.orderType && query.orderType !== "all") match.orderType = query.orderType;
  const revenueCondition = { $not: [{ $in: ["$status", NON_REVENUE_ORDER_STATUSES] }] };

  const [result] = await Order.aggregate([
    { $match: match },
    {
      $facet: {
        summary: [{
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            revenueOrders: { $sum: { $cond: [revenueCondition, 1, 0] } },
            totalRevenue: { $sum: { $cond: [revenueCondition, "$totalAmount", 0] } },
            discountTotal: { $sum: { $cond: [revenueCondition, { $ifNull: ["$discountAmount", 0] }, 0] } },
            refundTotal: { $sum: { $cond: [{ $or: [{ $eq: ["$status", "refunded"] }, { $eq: ["$paymentStatus", "refunded"] }] }, "$totalAmount", 0] } },
          },
        }],
        series: [
          { $match: { status: { $nin: NON_REVENUE_ORDER_STATUSES } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Riyadh" } }, orders: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
          { $sort: { _id: 1 } },
        ],
        sources: [
          { $group: { _id: { $ifNull: ["$source", "website"] }, orders: { $sum: 1 }, revenue: { $sum: { $cond: [revenueCondition, "$totalAmount", 0] } } } },
          { $sort: { revenue: -1 } },
        ],
        orderTypes: [
          { $group: { _id: "$orderType", orders: { $sum: 1 }, revenue: { $sum: { $cond: [revenueCondition, "$totalAmount", 0] } } } },
          { $sort: { revenue: -1 } },
        ],
        statuses: [{ $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { count: -1 } }],
        items: [
          { $match: { status: { $nin: NON_REVENUE_ORDER_STATUSES } } },
          { $unwind: "$items" },
          { $group: { _id: { type: "$items.productType", product: { $ifNull: ["$items.menuItem", "$items.combo"] }, name: "$items.name" }, quantity: { $sum: "$items.quantity" }, revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } } } },
          { $sort: { quantity: -1, revenue: -1 } },
        ],
      },
    },
  ]);

  const summary = result.summary[0] || {};
  const items = result.items.map((row) => ({
    productType: row._id.type,
    product: row._id.product,
    name: row._id.name,
    quantity: row.quantity,
    revenue: Number(row.revenue.toFixed(2)),
  }));
  const serializeBreakdown = (rows, label) => rows.map((row) => ({
    [label]: row._id || "unknown",
    orders: row.orders,
    revenue: Number(row.revenue.toFixed(2)),
  }));

  return {
    generatedAt: new Date(),
    range: { ...range, from: dateKey(range.start), to: dateKey(new Date(range.end.getTime() - DAY_MS)) },
    filters: { source: query.source || "all", orderType: query.orderType || "all" },
    summary: {
      totalOrders: summary.totalOrders || 0,
      totalRevenue: Number((summary.totalRevenue || 0).toFixed(2)),
      averageOrderValue: Number(((summary.totalRevenue || 0) / Math.max(summary.revenueOrders || 0, 1)).toFixed(2)),
      discountTotal: Number((summary.discountTotal || 0).toFixed(2)),
      refundTotal: Number((summary.refundTotal || 0).toFixed(2)),
    },
    series: buildSeries(result.series, range.start, range.days),
    sourceBreakdown: serializeBreakdown(result.sources, "source"),
    orderTypeBreakdown: serializeBreakdown(result.orderTypes, "orderType"),
    statusBreakdown: result.statuses.map((row) => ({ status: row._id, count: row.count })),
    bestSelling: items.slice(0, 8),
    leastSelling: [...items].sort((left, right) => left.quantity - right.quantity || left.revenue - right.revenue).slice(0, 8),
  };
};
