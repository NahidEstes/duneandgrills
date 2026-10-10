import { createCustomerOrder } from "../services/customerOrderService.js";
import { transitionOrder, transitionOrders } from "../services/orderEngineService.js";
import { resolveFulfillmentStatus } from "../config/orderContract.js";
import { repeatOrderLines } from "../services/orderRepeatService.js";
import mongoose from "mongoose";
import { orderAttentionFilter } from "../services/operationalAttentionService.js";
import Order from "../models/Order.js";
import crypto from "crypto";
import { getPublicOrderConfig } from "../config/orders.js";
import { PAYMENT_METHODS, SALES_SOURCES } from "../config/sales.js";
import { ADMIN_DAY_MS, parseRiyadhDate, startOfRiyadhDay } from "../utils/adminDate.js";
import { buildSalesReport } from "../services/salesReportingService.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { getEffectiveRestaurantSettings } from "../services/restaurantSettingsService.js";
import { ORDER_STATUSES as ORDER_STATUS_VALUES } from "../config/orderStatuses.js";
import { RECENT_ORDER_FIELDS, serializeAdminOrder, serializeCustomerOrder, serializeGuestTrackingOrder } from "../services/orderSerializer.js";
import { hasCapability, CAPABILITIES } from "../config/permissions.js";

const ORDER_STATUSES = new Set(ORDER_STATUS_VALUES);
const errorStatus = error => error.status || (["ValidationError", "CastError"].includes(error.name) ? 400 : 500);

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const addDateFilter = (filter, query) => {
  if (!query.from && !query.to) return;
  const conditions = [];
  if (query.from) {
    conditions.push({ $gte: [{ $ifNull: ["$orderOccurredAt", "$createdAt"] }, parseRiyadhDate(query.from, "From date")] });
  }
  if (query.to) {
    conditions.push({ $lt: [{ $ifNull: ["$orderOccurredAt", "$createdAt"] }, new Date(parseRiyadhDate(query.to, "To date").getTime() + ADMIN_DAY_MS)] });
  }
  const lower = query.from ? parseRiyadhDate(query.from, "From date") : null;
  const upper = query.to ? new Date(parseRiyadhDate(query.to, "To date").getTime() + ADMIN_DAY_MS) : null;
  if (lower && upper && lower >= upper) {
    throw new ValidationError("From date must be before or equal to To date");
  }
  filter.$expr = conditions.length === 1 ? conditions[0] : { $and: conditions };
};

const buildOrderFilter = (query, { includeStatus = true } = {}) => {
  const filter = {};
  if (includeStatus && query.status && query.status !== "all") {
    if (!ORDER_STATUSES.has(query.status)) throw new ValidationError("Unsupported order status");
    filter.status = query.status;
  }
  if (query.source && SALES_SOURCES.includes(query.source)) {
    if (query.source === "website") filter.$or = [{ source: "website" }, { source: { $exists: false } }];
    else filter.source = query.source;
  }
  if (query.orderType && ["dine-in", "pickup", "takeaway", "delivery"].includes(query.orderType)) filter.orderType = query.orderType;
  if (query.paymentMethod && PAYMENT_METHODS.includes(query.paymentMethod)) filter.paymentMethod = query.paymentMethod;
  addDateFilter(filter, query);
  if (query.search?.trim()) {
    const value = new RegExp(escapeRegex(query.search.trim()), "i");
    const searchFilter = [{ orderNumber: value }, { externalOrderId: value }, { "customer.name": value }, { "customer.phone": value }, { "customer.email": value }];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchFilter }];
      delete filter.$or;
    } else filter.$or = searchFilter;
  }
  return filter;
};


// @desc    Get server-authoritative order types and delivery pricing
// @route   GET /api/orders/config
// @access  Public
export const getOrderConfig = async (_req, res) => {
  try {
    const settings = await getEffectiveRestaurantSettings();
    res.status(200).json({ success: true, data: getPublicOrderConfig(settings.orders) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Order configuration is temporarily unavailable", error: error.message });
  }
};

// Generates a human-readable, date-based order number like 2026082301
// (YYYYMMDD + sequence number for that day)
// const generateOrderNumber = async () => {
//   const now = new Date();
//   const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
//     2,
//     "0"
//   )}${String(now.getDate()).padStart(2, "0")}`;

//   const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
//   const endOfDay = new Date(startOfDay);
//   endOfDay.setDate(endOfDay.getDate() + 1);

//   const countToday = await Order.countDocuments({
//     createdAt: { $gte: startOfDay, $lt: endOfDay },
//   });

//   const sequence = String(countToday + 1).padStart(2, "0");
//   return `${datePart}${sequence}`;
// };
// Atomically increments today's counter and returns a unique, sequential
// order number like "20260823001". Using findOneAndUpdate with $inc means
// MongoDB guarantees each caller gets a different number, even if many
// orders are placed at the exact same moment.
// @desc    Create a new order
// @route   POST /api/orders
// @access  Public
export const createOrder = async (req, res) => {
  try {
    const result = await createCustomerOrder({ payload: req.body, actor: req.user, channel: req.orderChannel || "customer", key: req.body.idempotencyKey ?? req.headers?.["idempotency-key"], correlationId: req.correlationId });
    res.status(result.duplicate ? 200 : 201).json({ success: true, data: serializeCustomerOrder(result.order), trackingToken: result.trackingToken, ...(result.duplicate ? { duplicate: true } : {}) });
  } catch (error) {
    res.status(errorStatus(error)).json({ success: false, message: error.message || "Failed to create order" });
  }
};

export const repeatCustomerOrder = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: "Order not found" });
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    res.json({ success: true, ...await repeatOrderLines(order) });
  } catch (error) { res.status(errorStatus(error)).json({ success: false, message: error.message }); }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Admin
// export const getOrders = async (req, res) => {
//   try {
//     const orders = await Order.find().sort({ createdAt: -1 });
//     res.status(200).json({ success: true, count: orders.length, data: orders });
//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch orders",
//       error: err.message,
//     });
//   }
// };

// @desc    Get all orders (optionally filter by status)
// @route   GET /api/orders?status=pending
// @access  Admin/Manager
export const getOrders = async (req, res) => {
  try {
    let filter = buildOrderFilter(req.query);
    if (req.query.attention) filter = { $and: [filter, orderAttentionFilter(req.query.attention, await getEffectiveRestaurantSettings())] };
    res.setHeader("Cache-Control", "private, no-store");
    const recent = req.query.view === "recent";
    const page = recent ? 1 : Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = recent ? 7 : Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || (req.query.page ? 20 : 100)));
    const query = Order.find(filter);
    if (recent) query.select(RECENT_ORDER_FIELDS);
    else query.populate("createdBy", "name role");
    const [orders, total] = await Promise.all([
      query.sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);
    res.status(200).json({
      success: true,
      count: total,
      data: orders.map(order => serializeAdminOrder(order)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit), hasMore: page * limit < total },
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        success: false,
        message: err.status ? err.message : "Failed to fetch orders",
        error: err.message,
      });
  }
};

// @desc    Revenue & order stats for the dashboard
// @route   GET /api/orders/stats
// @access  Admin/Manager
export const getOrderStats = async (req, res) => {
  try {
    const startOfToday = startOfRiyadhDay();

    let filter = buildOrderFilter(req.query, { includeStatus: false });
    if (req.query.attention) filter = { $and: [filter, orderAttentionFilter(req.query.attention, await getEffectiveRestaurantSettings())] };
    const [report, today] = await Promise.all([
      buildSalesReport({ query: req.query, orderFilter: filter }),
      buildSalesReport({ query: req.query, orderFilter: filter, range: { start: startOfToday, end: new Date(startOfToday.getTime() + ADMIN_DAY_MS), days: 1 } }),
    ]);
    const statusCounts = Object.fromEntries(report.statusBreakdown.map(row => [row.status, row.count]));

    res.status(200).json({
      success: true,
      data: {
        ...report.summary,
        grossRevenue: report.summary.grossSales,
        totalRefunds: report.summary.completedRefunds,
        todayOrders: today.summary.totalOrders,
        todayRevenue: today.summary.netSales,
        todayGrossRevenue: today.summary.grossSales,
        todayRefunds: today.summary.completedRefunds,
        definitions: report.definitions,
        cashActivity: report.cashActivity,
        statusCounts,
      },
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        success: false,
        message: err.status ? err.message : "Failed to fetch stats",
        error: err.message,
      });
  }
};

// @desc    Get a single order
// @route   GET /api/orders/:id
// @access  Private (owner or authorized staff)
export const getOrderById = async (req, res) => {
  try {
    res.setHeader("Cache-Control", "private, no-store");
    const order = await Order.findById(req.params.id);
    const canReadAll = hasCapability(req.user.role, CAPABILITIES.ORDERS_READ_ALL);
    const ownsOrder = order?.user && String(order.user) === String(req.user._id);
    if (!order || (!canReadAll && !ownsOrder)) return res.status(404).json({ success: false, message: "Order not found" });
    res.status(200).json({ success: true, data: canReadAll ? serializeAdminOrder(order) : serializeCustomerOrder(order) });
  } catch (err) {
    const invalidId = err.name === "CastError";
    res.status(invalidId ? 404 : 500).json({ success: false, message: invalidId ? "Order not found" : "Failed to fetch order" });
  }
};

export const trackGuestOrder = async (req, res) => {
  try {
    const token = String(req.headers["x-order-tracking-token"] || "");
    const tokenHash = token ? crypto.createHash("sha256").update(token).digest("hex") : "";
    const order = tokenHash ? await Order.findOne({ orderNumber: req.params.orderNumber, trackingTokenHash: tokenHash }).select("+trackingTokenHash") : null;
    if (!order) return res.status(404).json({ success: false, message: "Order could not be found" });
    res.json({ success: true, data: serializeGuestTrackingOrder(order) });
  } catch (_error) {
    res.status(404).json({ success: false, message: "Order could not be found" });
  }
};

// @route PATCH /api/orders/:id/status
export const updateOrderStatus = async (req, res) => {
  try {
    const result = await transitionOrder({ orderId: req.params.id, nextStatus: resolveFulfillmentStatus(req.body), actor: req.user, reason: req.body.reason,
      estimatedPreparationMinutes: req.body.estimatedPreparationMinutes, expectedStatus: req.body.expectedStatus, correlationId: req.correlationId });
    res.status(200).json({ success: true, data: serializeAdminOrder(result.order), ...(result.duplicate ? { duplicate: true } : {}) });
  } catch (error) {
    res.status(errorStatus(error)).json({ success: false, message: error.message || "Failed to update order" });
  }
};

export const bulkUpdateOrderStatus = async (req, res) => {
  try {
    const ids = [...new Set(Array.isArray(req.body.orderIds) ? req.body.orderIds.map(String) : [])];
    if (!ids.length || ids.length > 100 || ids.some(id => !mongoose.isValidObjectId(id))) throw new ValidationError("Choose between 1 and 100 valid orders");
    const results = await transitionOrders({ orderIds: ids, nextStatus: resolveFulfillmentStatus(req.body), actor: req.user, reason: req.body.reason,
      estimatedPreparationMinutes: req.body.estimatedPreparationMinutes, expectedStatus: req.body.expectedStatus, expectedStatuses: req.body.expectedStatuses, correlationId: req.correlationId });
    res.json({ success: true, count: results.length, data: results.map(result => serializeAdminOrder(result.order)) });
  } catch (error) {
    res.status(errorStatus(error)).json({ success: false, message: error.message || "Failed to update orders" });
  }
};

// @desc    Get logged-in user's own orders
// @route   GET /api/orders/my
// @access  Private (customer)
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("items.menuItem", "name image price isAvailable")
      .populate("items.combo", "name image comboPrice isAvailable status");
    res.status(200).json({ success: true, count: orders.length, data: orders.map(serializeCustomerOrder) });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch your orders",
      error: err.message,
    });
  }
};
