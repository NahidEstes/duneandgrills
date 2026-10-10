import { ORDER_TYPES } from "../config/orders.js";
import { SALES_SOURCES } from "../config/sales.js";
import Order from "../models/Order.js";
import MenuItem from "../models/MenuItem.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { orderContract } from "../config/orderContract.js";
import { transitionOrder } from "./orderEngineService.js";

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
  category: item.category || "",
  kitchenStation: item.kitchenStation || "Unassigned",
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
    ...orderContract(value),
    orderType: value.orderType,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    acceptedAt: value.acceptedAt || null,
    preparationStartedAt: value.preparationStartedAt || null,
    readyAt: value.readyAt || null,
    estimatedPreparationMinutes: value.estimatedPreparationMinutes || null,
    preparationDueAt: value.preparationDueAt || null,
    isOverdue: Boolean(dueAt && ["confirmed", "preparing"].includes(value.status) && dueAt < now),
    customerName: value.customer?.name || "",
    pickupToken: value.pickupToken || "",
    pickupNote: value.pickupNote || "",
    notes: [value.notes, value.kitchenNotes].filter(Boolean).join("\n"),
    kitchenNotes: value.kitchenNotes || "",
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
  { source, orderType, search, category, station } = {},
  now = new Date(),
  { readyRetentionMinutes = KITCHEN_READY_RETENTION_MINUTES } = {}
) => {
  if (source && source !== "all" && !SALES_SOURCES.includes(source)) throw new ValidationError("Invalid order source");
  if (orderType && orderType !== "all" && !ORDER_TYPES.includes(orderType)) throw new ValidationError("Invalid order type");

  const readyCutoff = new Date(now.getTime() - readyRetentionMinutes * 60 * 1000);
  const filters = [{ manualEntry: { $ne: true } }, {
    $or: [
      { status: { $in: ["pending", "confirmed", "preparing", "ready", "out-for-delivery"] } },
      { status: "delivered", updatedAt: { $gte: readyCutoff } },
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
    .select("orderNumber source orderType status createdAt updatedAt acceptedAt preparationStartedAt readyAt estimatedPreparationMinutes preparationDueAt customer.name pickupToken pickupNote notes kitchenNotes items")
    .sort({ createdAt: 1 })
    .lean();
  const ids = [...new Set(orders.flatMap(order => order.items.map(item => item.menuItem).filter(Boolean)).map(String))];
  const catalog = await MenuItem.find({ _id: { $in: ids } }).select("category kitchenStation").lean();
  const byId = new Map(catalog.map(item => [String(item._id), item]));
  for (const order of orders) for (const item of order.items) {
    const current = byId.get(String(item.menuItem));
    item.category ||= current?.category || (item.productType === "combo" ? "Combos" : "Uncategorized");
    item.kitchenStation ||= current?.kitchenStation || "Unassigned";
  }
  return orders.filter(order => (!category || category === "all" || order.items.some(item => item.category === category)) && (!station || station === "all" || order.items.some(item => item.kitchenStation === station))).map(order => serializeKitchenOrder(order, now));
};

export const transitionKitchenOrder = async ({ orderId, nextStatus, actor, estimatedPreparationMinutes, expectedStatus,
  defaultPreparationMinutes = KITCHEN_DEFAULT_PREPARATION_MINUTES, correlationId }) => {
  const { order } = await transitionOrder({ orderId, nextStatus, actor, estimatedPreparationMinutes, expectedStatus, defaultPreparationMinutes, correlationId, workflow: "kitchen" });
  return serializeKitchenOrder(order);
};
