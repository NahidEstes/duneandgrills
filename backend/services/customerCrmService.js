import mongoose from "mongoose";
import { NON_REVENUE_ORDER_STATUSES, ORDER_STATUSES } from "../config/orderStatuses.js";
import { SALES_SOURCES } from "../config/sales.js";
import CustomerNote from "../models/CustomerNote.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import { ensurePointsBalance } from "./rewardService.js";
import { recordAuditLog } from "./auditLogService.js";
import { ADMIN_DAY_MS, parseRiyadhDate } from "../utils/adminDate.js";
import { ValidationError } from "../utils/inventoryValidation.js";

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const revenueCondition = { $not: [{ $in: ["$status", NON_REVENUE_ORDER_STATUSES] }] };

const parsePagination = (query = {}, defaultLimit = 20) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

const customerObjectId = (value) => {
  if (!mongoose.isValidObjectId(value)) throw new ValidationError("Invalid customer id");
  return new mongoose.Types.ObjectId(value);
};

const requireCustomer = async (value) => {
  const customer = await User.findOne({ _id: customerObjectId(value), role: "customer" })
    .select("name email phone address avatar pointsBalance createdAt updatedAt")
    .lean();
  if (!customer) {
    const error = new Error("Customer not found");
    error.status = 404;
    throw error;
  }
  return customer;
};

const orderSummaryLookup = {
  from: Order.collection.name,
  let: { customerId: "$_id" },
  pipeline: [
    { $match: { $expr: { $eq: ["$user", "$$customerId"] } } },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        validOrders: { $sum: { $cond: [revenueCondition, 1, 0] } },
        totalSpent: { $sum: { $cond: [revenueCondition, "$totalAmount", 0] } },
        lastOrderAt: { $max: "$createdAt" },
      },
    },
  ],
  as: "orderSummaryRows",
};

export const listCustomerDirectory = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query, 20);
  const match = { role: "customer" };
  if (query.search?.trim()) {
    const expression = new RegExp(escapeRegex(query.search.trim().slice(0, 120)), "i");
    match.$or = [{ name: expression }, { email: expression }, { phone: expression }];
  }
  const activity = ["all", "with-orders", "no-orders"].includes(query.activity)
    ? query.activity
    : "all";
  const sortOptions = {
    newest: { createdAt: -1, _id: -1 },
    name: { name: 1, _id: 1 },
    spending: { "orderSummary.totalSpent": -1, createdAt: -1 },
    orders: { "orderSummary.totalOrders": -1, createdAt: -1 },
    recent: { "orderSummary.lastOrderAt": -1, createdAt: -1 },
  };
  const sort = sortOptions[query.sort] || sortOptions.newest;

  const [result] = await User.aggregate([
    { $match: match },
    { $lookup: orderSummaryLookup },
    {
      $set: {
        orderSummary: {
          $ifNull: [
            { $arrayElemAt: ["$orderSummaryRows", 0] },
            { totalOrders: 0, validOrders: 0, totalSpent: 0, lastOrderAt: null },
          ],
        },
      },
    },
    ...(activity === "with-orders" ? [{ $match: { "orderSummary.totalOrders": { $gt: 0 } } }] : []),
    ...(activity === "no-orders" ? [{ $match: { "orderSummary.totalOrders": 0 } }] : []),
    { $sort: sort },
    {
      $facet: {
        rows: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              name: 1,
              email: 1,
              phone: 1,
              address: 1,
              avatar: 1,
              createdAt: 1,
              pointsBalance: {
                $max: [{ $ifNull: ["$pointsBalance", { $ifNull: ["$rewardPoints", 0] }] }, 0],
              },
              totalOrders: "$orderSummary.totalOrders",
              validOrders: "$orderSummary.validOrders",
              totalSpent: { $round: ["$orderSummary.totalSpent", 2] },
              lastOrderAt: "$orderSummary.lastOrderAt",
            },
          },
        ],
        count: [{ $count: "total" }],
      },
    },
  ]);

  const total = result?.count?.[0]?.total || 0;
  return {
    data: result?.rows || [],
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    filters: { activity, sort: query.sort || "newest" },
  };
};

export const getCustomerOverview = async (customerId) => {
  let customer = await requireCustomer(customerId);
  if (customer.pointsBalance === undefined) {
    await ensurePointsBalance(customer._id);
    customer = await requireCustomer(customerId);
  }
  const _id = customerObjectId(customerId);
  const [analytics] = await Order.aggregate([
    { $match: { user: _id } },
    {
      $facet: {
        all: [{
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            completedOrders: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
            cancelledOrRefundedOrders: { $sum: { $cond: [{ $in: ["$status", ["cancelled", "refunded"]] }, 1, 0] } },
            lastOrderAt: { $max: "$createdAt" },
          },
        }],
        valid: [
          { $match: { status: { $nin: NON_REVENUE_ORDER_STATUSES } } },
          { $group: { _id: null, orders: { $sum: 1 }, totalSpent: { $sum: "$totalAmount" }, firstOrderAt: { $min: "$createdAt" }, lastOrderAt: { $max: "$createdAt" } } },
        ],
      },
    },
  ]);
  const all = analytics?.all?.[0] || {};
  const valid = analytics?.valid?.[0] || {};
  const validOrders = valid.orders || 0;
  const totalSpent = Number((valid.totalSpent || 0).toFixed(2));
  const spanDays = validOrders > 1
    ? (new Date(valid.lastOrderAt) - new Date(valid.firstOrderAt)) / ADMIN_DAY_MS
    : null;

  return {
    customer,
    analytics: {
      totalOrders: all.totalOrders || 0,
      validOrders,
      completedOrders: all.completedOrders || 0,
      cancelledOrRefundedOrders: all.cancelledOrRefundedOrders || 0,
      totalSpent,
      averageOrderValue: Number((totalSpent / Math.max(validOrders, 1)).toFixed(2)),
      lastOrderAt: all.lastOrderAt || null,
      averageDaysBetweenOrders: spanDays === null ? null : Number((spanDays / (validOrders - 1)).toFixed(1)),
    },
  };
};

const addOrderDateFilter = (filter, query) => {
  if (!query.from && !query.to) return;
  filter.createdAt = {};
  if (query.from) filter.createdAt.$gte = parseRiyadhDate(query.from, "From date");
  if (query.to) filter.createdAt.$lt = new Date(parseRiyadhDate(query.to, "To date").getTime() + ADMIN_DAY_MS);
  if (filter.createdAt.$gte && filter.createdAt.$lt && filter.createdAt.$gte >= filter.createdAt.$lt) {
    throw new ValidationError("From date must be before or equal to To date");
  }
};

export const listCustomerOrders = async (customerId, query = {}) => {
  await requireCustomer(customerId);
  const { page, limit, skip } = parsePagination(query, 10);
  const filter = { user: customerObjectId(customerId) };
  if (query.status && query.status !== "all") {
    if (!ORDER_STATUSES.includes(query.status)) throw new ValidationError("Invalid order status");
    filter.status = query.status;
  }
  if (query.source && query.source !== "all") {
    if (!SALES_SOURCES.includes(query.source)) throw new ValidationError("Invalid order source");
    filter.source = query.source === "website" ? { $in: ["website", null] } : query.source;
  }
  addOrderDateFilter(filter, query);
  const select = "orderNumber source orderType customer items subtotal originalSubtotal discountAmount discountReason couponCode deliveryFee totalAmount paymentMethod paymentStatus status cancellationReason refundReason estimatedPreparationMinutes preparationDueAt acceptedAt preparationStartedAt readyAt statusHistory createdAt updatedAt";
  const [orders, total] = await Promise.all([
    Order.find(filter).select(select).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  return {
    data: orders.map((order) => ({
      ...order,
      itemsSummary: order.items.map((item) => `${item.name} ×${item.quantity}`).join(", "),
    })),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
};

export const listCustomerFavouriteItems = async (customerId) => {
  await requireCustomer(customerId);
  const rows = await Order.aggregate([
    { $match: { user: customerObjectId(customerId), status: { $nin: NON_REVENUE_ORDER_STATUSES } } },
    { $sort: { createdAt: 1 } },
    { $unwind: "$items" },
    {
      $set: {
        itemReference: { $ifNull: ["$items.menuItem", "$items.combo"] },
      },
    },
    {
      $group: {
        _id: {
          productType: "$items.productType",
          key: {
            $cond: [
              { $ne: ["$itemReference", null] },
              { $toString: "$itemReference" },
              "$items.name",
            ],
          },
        },
        product: { $last: "$itemReference" },
        name: { $last: "$items.name" },
        totalQuantity: { $sum: "$items.quantity" },
        orderIds: { $addToSet: "$_id" },
        totalSpending: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        lastPurchasedAt: { $max: "$createdAt" },
      },
    },
    { $sort: { totalQuantity: -1, totalSpending: -1, name: 1 } },
    { $limit: 50 },
    {
      $project: {
        _id: 0,
        productType: "$_id.productType",
        product: 1,
        name: 1,
        totalQuantity: 1,
        orderCount: { $size: "$orderIds" },
        totalSpending: { $round: ["$totalSpending", 2] },
        lastPurchasedAt: 1,
      },
    },
  ]);
  return rows;
};

export const listCustomerRewardHistory = async (customerId, query = {}) => {
  await requireCustomer(customerId);
  await ensurePointsBalance(customerId);
  const { page, limit, skip } = parsePagination(query, 15);
  const rewardTypes = ["EARN", "REDEEM", "REVERSAL"];
  if (query.type && query.type !== "all" && !rewardTypes.includes(query.type)) {
    throw new ValidationError("Invalid reward transaction type");
  }
  const [result] = await User.aggregate([
    { $match: { _id: customerObjectId(customerId), role: "customer" } },
    { $unwind: { path: "$pointTransactions", preserveNullAndEmptyArrays: false } },
    ...(query.type && query.type !== "all" ? [{ $match: { "pointTransactions.type": query.type } }] : []),
    {
      $facet: {
        rows: [
          { $sort: { "pointTransactions.createdAt": -1 } },
          { $skip: skip },
          { $limit: limit },
          { $lookup: { from: Order.collection.name, localField: "pointTransactions.order", foreignField: "_id", as: "relatedOrder" } },
          {
            $project: {
              _id: "$pointTransactions._id",
              type: "$pointTransactions.type",
              points: "$pointTransactions.points",
              description: "$pointTransactions.description",
              balanceAfter: "$pointTransactions.balanceAfter",
              createdAt: "$pointTransactions.createdAt",
              order: {
                $let: {
                  vars: { row: { $arrayElemAt: ["$relatedOrder", 0] } },
                  in: { _id: "$$row._id", orderNumber: "$$row.orderNumber" },
                },
              },
            },
          },
        ],
        count: [{ $count: "total" }],
      },
    },
  ]);
  const total = result?.count?.[0]?.total || 0;
  return {
    data: result?.rows || [],
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
};

const normalizeNoteText = (value) => {
  if (typeof value !== "string") throw new ValidationError("Note text is required");
  const text = value.trim();
  if (!text) throw new ValidationError("Note text cannot be empty");
  if (text.length > 1000) throw new ValidationError("Note text cannot exceed 1000 characters");
  return text;
};

const actorSnapshot = (actor) => ({
  name: String(actor?.name || "Staff").trim().slice(0, 120),
  role: String(actor?.role || "staff").trim().slice(0, 40),
});

export const listCustomerNotes = async (customerId) => {
  await requireCustomer(customerId);
  return CustomerNote.find({ customer: customerObjectId(customerId) })
    .select("text createdBy createdBySnapshot updatedBy updatedBySnapshot createdAt updatedAt")
    .sort({ createdAt: -1 })
    .lean();
};

export const createCustomerNote = async ({ customerId, text, actor }) => {
  const customer = await requireCustomer(customerId);
  const note = await CustomerNote.create({
    customer: customer._id,
    text: normalizeNoteText(text),
    createdBy: actor._id,
    createdBySnapshot: actorSnapshot(actor),
  });
  await recordAuditLog({
    actor,
    action: "CUSTOMER_NOTE_CREATED",
    entityType: "CustomerNote",
    entityId: note._id,
    entityLabel: `${customer.name} · internal note`,
    after: { text: note.text },
    metadata: { customerId: customer._id },
  });
  return note.toObject();
};

export const updateCustomerNote = async ({ customerId, noteId, text, actor }) => {
  const customer = await requireCustomer(customerId);
  if (!mongoose.isValidObjectId(noteId)) throw new ValidationError("Invalid note id");
  const note = await CustomerNote.findOne({ _id: noteId, customer: customer._id });
  if (!note) {
    const error = new Error("Customer note not found");
    error.status = 404;
    throw error;
  }
  const before = { text: note.text };
  const normalizedText = normalizeNoteText(text);
  if (normalizedText === note.text) return note.toObject();
  note.text = normalizedText;
  note.updatedBy = actor._id;
  note.updatedBySnapshot = actorSnapshot(actor);
  await note.save();
  await recordAuditLog({
    actor,
    action: "CUSTOMER_NOTE_UPDATED",
    entityType: "CustomerNote",
    entityId: note._id,
    entityLabel: `${customer.name} · internal note`,
    before,
    after: { text: note.text },
    metadata: { customerId: customer._id },
  });
  return note.toObject();
};

export const deleteCustomerNote = async ({ customerId, noteId, actor }) => {
  const customer = await requireCustomer(customerId);
  if (!mongoose.isValidObjectId(noteId)) throw new ValidationError("Invalid note id");
  const note = await CustomerNote.findOne({ _id: noteId, customer: customer._id });
  if (!note) {
    const error = new Error("Customer note not found");
    error.status = 404;
    throw error;
  }
  await CustomerNote.deleteOne({ _id: note._id });
  await recordAuditLog({
    actor,
    action: "CUSTOMER_NOTE_DELETED",
    entityType: "CustomerNote",
    entityId: note._id,
    entityLabel: `${customer.name} · internal note`,
    before: { text: note.text },
    metadata: { customerId: customer._id },
  });
  return { _id: note._id };
};
