import mongoose from "mongoose";
import { ORDER_TYPES } from "../config/orders.js";
import { SALES_SOURCES } from "../config/sales.js";
import Order from "../models/Order.js";
import { pickAuditFields, recordAuditLog } from "./auditLogService.js";
import { ValidationError } from "../utils/inventoryValidation.js";

export const KITCHEN_STATUSES = ["pending", "confirmed", "preparing", "ready"];
export const KITCHEN_TRANSITIONS = Object.freeze({
  confirmed: { from: "pending", timestamp: "acceptedAt" },
  preparing: { from: "confirmed", timestamp: "preparationStartedAt" },
  ready: { from: "preparing", timestamp: "readyAt" },
});

const boundedEnvironmentInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
};

export const KITCHEN_DEFAULT_PREPARATION_MINUTES = boundedEnvironmentInteger(
  process.env.KITCHEN_DEFAULT_PREP_MINUTES,
  20,
  1,
  240
);
export const KITCHEN_READY_RETENTION_MINUTES = boundedEnvironmentInteger(
  process.env.KITCHEN_READY_RETENTION_MINUTES,
  30,
  5,
  240
);

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cleanKitchenItem = (item) => ({
  name: item.name,
  quantity: item.quantity,
  productType: item.productType,
  selectedAddOns: (item.selectedAddOns || []).map((addOn) => ({ name: addOn.name, quantity: addOn.quantity || 1 })),
  spiceLevel: item.spiceLevel || "",
  itemNote: item.itemNote || "",
  comboItems: (item.comboItems || []).map((entry) => ({
    name: entry.name,
    quantity: entry.quantity,
  })),
});

export const serializeKitchenOrder = (order, now = new Date()) => {
  const value = typeof order?.toObject === "function" ? order.toObject() : order;
  const dueAt = value.preparationDueAt ? new Date(value.preparationDueAt) : null;
  return {
    _id: value._id,
    orderNumber: value.orderNumber,
    source: value.source || "website",
    orderType: value.orderType,
    status: value.status,
    createdAt: value.createdAt,
    acceptedAt: value.acceptedAt || null,
    preparationStartedAt: value.preparationStartedAt || null,
    readyAt: value.readyAt || null,
    estimatedPreparationMinutes: value.estimatedPreparationMinutes || null,
    preparationDueAt: value.preparationDueAt || null,
    isOverdue: Boolean(dueAt && ["confirmed", "preparing"].includes(value.status) && dueAt < now),
    customerName: value.customer?.name || "",
    notes: value.notes || "",
    items: (value.items || []).map(cleanKitchenItem),
  };
};

export const resolveKitchenTransition = (currentStatus, nextStatus) => {
  const transition = KITCHEN_TRANSITIONS[nextStatus];
  if (!transition) throw new ValidationError("Kitchen status must be confirmed, preparing or ready");
  if (currentStatus === nextStatus) {
    const error = new Error(`Order is already ${nextStatus}`);
    error.status = 409;
    throw error;
  }
  if (currentStatus !== transition.from) {
    const error = new Error(`Order must be ${transition.from} before it can become ${nextStatus}`);
    error.status = 409;
    throw error;
  }
  return transition;
};

export const listKitchenOrders = async (
  { source, orderType, search } = {},
  now = new Date(),
  { readyRetentionMinutes = KITCHEN_READY_RETENTION_MINUTES } = {}
) => {
  if (source && source !== "all" && !SALES_SOURCES.includes(source)) throw new ValidationError("Invalid order source");
  if (orderType && orderType !== "all" && !ORDER_TYPES.includes(orderType)) throw new ValidationError("Invalid order type");

  const readyCutoff = new Date(now.getTime() - readyRetentionMinutes * 60 * 1000);
  const filters = [{
    $or: [
      { status: { $in: ["pending", "confirmed", "preparing"] } },
      {
        status: "ready",
        $or: [
          { readyAt: { $gte: readyCutoff } },
          { readyAt: null, updatedAt: { $gte: readyCutoff } },
        ],
      },
    ],
  }];
  if (source && source !== "all") {
    filters.push(source === "website"
      ? { $or: [{ source: "website" }, { source: { $exists: false } }] }
      : { source });
  }
  if (orderType && orderType !== "all") filters.push({ orderType });
  if (search?.trim()) {
    filters.push({ orderNumber: new RegExp(escapeRegex(search.trim().slice(0, 80)), "i") });
  }

  const orders = await Order.find({ $and: filters })
    .select("orderNumber source orderType status createdAt updatedAt acceptedAt preparationStartedAt readyAt estimatedPreparationMinutes preparationDueAt customer.name notes items.name items.quantity items.productType items.comboItems.name items.comboItems.quantity")
    .sort({ createdAt: 1 })
    .lean();
  return orders.map((order) => serializeKitchenOrder(order, now));
};

export const transitionKitchenOrder = async ({
  orderId,
  nextStatus,
  actor,
  estimatedPreparationMinutes,
  defaultPreparationMinutes = KITCHEN_DEFAULT_PREPARATION_MINUTES,
}) => {
  if (!mongoose.isValidObjectId(orderId)) throw new ValidationError("Invalid order id");
  const current = await Order.findById(orderId)
    .select("orderNumber status acceptedAt preparationStartedAt readyAt estimatedPreparationMinutes preparationDueAt")
    .lean();
  if (!current) {
    const error = new Error("Order not found");
    error.status = 404;
    throw error;
  }
  const transition = resolveKitchenTransition(current.status, nextStatus);
  const now = new Date();
  const set = { status: nextStatus, [transition.timestamp]: now };

  if (nextStatus === "confirmed") {
    const requested = estimatedPreparationMinutes === undefined || estimatedPreparationMinutes === ""
      ? null
      : Number(estimatedPreparationMinutes);
    if (requested !== null && (!Number.isInteger(requested) || requested < 1 || requested > 240)) {
      throw new ValidationError("Estimated preparation time must be between 1 and 240 minutes");
    }
    const minutes = requested || current.estimatedPreparationMinutes || defaultPreparationMinutes;
    set.estimatedPreparationMinutes = minutes;
    set.preparationDueAt = current.preparationDueAt || new Date(now.getTime() + minutes * 60 * 1000);
  } else if (nextStatus === "preparing" && !current.preparationDueAt) {
    const minutes = current.estimatedPreparationMinutes || defaultPreparationMinutes;
    set.estimatedPreparationMinutes = minutes;
    set.preparationDueAt = new Date(now.getTime() + minutes * 60 * 1000);
  }

  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: transition.from },
    {
      $set: set,
      $push: {
        statusHistory: {
          status: nextStatus,
          reason: "Kitchen workflow",
          changedBy: actor._id,
          changedAt: now,
        },
      },
    },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) {
    const latest = await Order.findById(orderId).select("status").lean();
    const error = new Error(latest ? `Order status already changed to ${latest.status}` : "Order not found");
    error.status = latest ? 409 : 404;
    throw error;
  }

  const auditFields = ["status", "acceptedAt", "preparationStartedAt", "readyAt", "estimatedPreparationMinutes", "preparationDueAt"];
  await recordAuditLog({
    actor,
    action: "KITCHEN_ORDER_STATUS_CHANGED",
    entityType: "Order",
    entityId: updated._id,
    entityLabel: `Order #${updated.orderNumber}`,
    before: pickAuditFields(current, auditFields),
    after: pickAuditFields(updated, auditFields),
    metadata: { workflow: "kitchen", from: current.status, to: nextStatus },
  });
  return serializeKitchenOrder(updated, now);
};
