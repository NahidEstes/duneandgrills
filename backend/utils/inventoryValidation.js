import mongoose from "mongoose";
import { INVENTORY_UNITS } from "../models/InventoryItem.js";
import { PURCHASE_ORDER_STATUSES } from "../models/PurchaseOrder.js";
import { STOCK_MOVEMENT_TYPES } from "../models/StockTransaction.js";

export class ValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.name = "ValidationError";
    this.status = 400;
    this.fields = fields;
  }
}

const text = (value) => (typeof value === "string" ? value.trim() : "");
const number = (value) => (value === "" || value == null ? NaN : Number(value));

export const assertObjectId = (value, label = "id") => {
  if (!mongoose.isValidObjectId(value)) throw new ValidationError(`Invalid ${label}`);
  return value;
};

export const validateItemPayload = (payload, { partial = false } = {}) => {
  const result = {};
  const requiredText = ["name", "sku", "unit", "category"];
  for (const field of requiredText) {
    if (!partial || field in payload) {
      const value = text(payload[field]);
      if (!value) throw new ValidationError(`${field} is required`, { [field]: "Required" });
      result[field] = field === "sku" ? value.toUpperCase() : value;
    }
  }
  if (result.unit && !INVENTORY_UNITS.includes(result.unit)) {
    throw new ValidationError(`unit must be one of: ${INVENTORY_UNITS.join(", ")}`);
  }
  if (result.category) assertObjectId(result.category, "category");
  if ("supplier" in payload) {
    result.supplier = payload.supplier ? assertObjectId(payload.supplier, "supplier") : null;
  }
  for (const field of ["reorderLevel", "unitCost"]) {
    if (!partial || field in payload) {
      const value = number(payload[field] ?? 0);
      if (!Number.isFinite(value) || value < 0) throw new ValidationError(`${field} must be zero or greater`);
      result[field] = value;
    }
  }
  if ("openingStock" in payload) {
    const value = number(payload.openingStock);
    if (!Number.isFinite(value) || value < 0) throw new ValidationError("openingStock must be zero or greater");
    result.openingStock = value;
  }
  for (const field of ["storageLocation", "externalId"]) {
    if (field in payload) result[field] = text(payload[field]) || null;
  }
  for (const field of ["tracksExpiry", "isActive", "allowNegativeStock"]) {
    if (field in payload) result[field] = Boolean(payload[field]);
  }
  if ("expiryDate" in payload) {
    const parsed = payload.expiryDate ? new Date(payload.expiryDate) : null;
    if (parsed && Number.isNaN(parsed.getTime())) throw new ValidationError("expiryDate is invalid");
    result.expiryDate = parsed;
  }
  return result;
};

export const validateMovementPayload = (payload) => {
  const movementType = text(payload.movementType).toUpperCase();
  if (!STOCK_MOVEMENT_TYPES.includes(movementType) || movementType === "OPENING_BALANCE") {
    throw new ValidationError("Invalid movement type");
  }
  assertObjectId(payload.item, "item");
  const quantity = number(payload.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) throw new ValidationError("quantity must be zero or greater");
  if (movementType !== "ADJUSTMENT" && quantity <= 0) throw new ValidationError("quantity must be greater than zero");
  const reason = text(payload.reason);
  if (!reason) throw new ValidationError("reason is required");
  return {
    item: payload.item,
    movementType,
    quantity,
    reason,
    notes: text(payload.notes),
    allowNegativeStock: Boolean(payload.allowNegativeStock),
  };
};

export const validatePurchaseOrderPayload = (payload, { partial = false } = {}) => {
  const result = {};
  if (!partial || "supplier" in payload) result.supplier = assertObjectId(payload.supplier, "supplier");
  if (!partial || "items" in payload) {
    if (!Array.isArray(payload.items) || payload.items.length === 0) throw new ValidationError("At least one purchase item is required");
    result.items = payload.items.map((line, index) => {
      assertObjectId(line.item, `items[${index}].item`);
      const quantity = number(line.quantity);
      const unitCost = number(line.unitCost);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new ValidationError(`items[${index}].quantity must be greater than zero`);
      if (!Number.isFinite(unitCost) || unitCost < 0) throw new ValidationError(`items[${index}].unitCost must be zero or greater`);
      const expiryDate = line.expiryDate ? new Date(line.expiryDate) : null;
      if (expiryDate && Number.isNaN(expiryDate.getTime())) throw new ValidationError(`items[${index}].expiryDate is invalid`);
      return { item: line.item, quantity, unitCost, expiryDate };
    });
  }
  if ("tax" in payload || !partial) {
    const tax = number(payload.tax ?? 0);
    if (!Number.isFinite(tax) || tax < 0) throw new ValidationError("tax must be zero or greater");
    result.tax = tax;
  }
  for (const field of ["notes"]) if (field in payload) result[field] = text(payload[field]);
  if ("expectedAt" in payload) {
    const expectedAt = payload.expectedAt ? new Date(payload.expectedAt) : null;
    if (expectedAt && Number.isNaN(expectedAt.getTime())) throw new ValidationError("expectedAt is invalid");
    result.expectedAt = expectedAt;
  }
  if ("status" in payload) {
    if (!PURCHASE_ORDER_STATUSES.includes(payload.status)) throw new ValidationError("Invalid purchase order status");
    result.status = payload.status;
  }
  return result;
};

export const parsePagination = (query, defaultLimit = 20) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

export const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
