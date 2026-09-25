import mongoose from "mongoose";
import { INVENTORY_UNITS, PURCHASE_UNITS } from "../models/InventoryItem.js";
import { PURCHASE_ORDER_STATUSES } from "../models/PurchaseOrder.js";
import { STOCK_MOVEMENT_TYPES, WASTE_REASON_CODES } from "../models/StockTransaction.js";

const INVENTORY_SKU_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,49}$/;

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
  if (result.sku && !INVENTORY_SKU_PATTERN.test(result.sku)) {
    throw new ValidationError("SKU may contain only uppercase letters, numbers and hyphens", { sku: "Invalid SKU format" });
  }
  if ("purchaseUnit" in payload) {
    const purchaseUnit = text(payload.purchaseUnit);
    if (purchaseUnit && !PURCHASE_UNITS.includes(purchaseUnit)) {
      throw new ValidationError(`purchaseUnit must be one of: ${PURCHASE_UNITS.join(", ")}`);
    }
    result.purchaseUnit = purchaseUnit || null;
  }
  if ("purchaseConversionFactor" in payload) {
    const factor = number(payload.purchaseConversionFactor);
    if (!Number.isFinite(factor) || factor <= 0) {
      throw new ValidationError("purchaseConversionFactor must be greater than zero");
    }
    result.purchaseConversionFactor = factor;
  }
  if (result.category) assertObjectId(result.category, "category");
  if ("supplier" in payload) {
    result.supplier = payload.supplier ? assertObjectId(payload.supplier, "supplier") : null;
  }
  for (const field of ["reorderLevel", "targetStock", "safetyStock", "leadTimeDays", "unitCost"]) {
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
  for (const field of ["storageLocation", "supplierItemCode", "externalId"]) {
    if (field in payload) result[field] = text(payload[field]) || null;
  }
  for (const field of ["tracksExpiry", "isActive", "allowNegativeStock", "reorderEnabled"]) {
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
  const unitCost = payload.unitCost === "" || payload.unitCost == null ? null : number(payload.unitCost);
  if (unitCost != null && (!Number.isFinite(unitCost) || unitCost < 0)) {
    throw new ValidationError("unitCost must be zero or greater");
  }
  for (const field of ["minimumOrderQuantity", "orderMultiple"]) {
    if (!partial || field in payload) {
      const value = number(payload[field] ?? 1);
      if (!Number.isFinite(value) || value <= 0) throw new ValidationError(`${field} must be greater than zero`);
      result[field] = value;
    }
  }
  const expiryDate = payload.expiryDate ? new Date(payload.expiryDate) : null;
  if (expiryDate && Number.isNaN(expiryDate.getTime())) throw new ValidationError("expiryDate is invalid");
  const receivedAt = payload.receivedAt ? new Date(payload.receivedAt) : null;
  if (receivedAt && Number.isNaN(receivedAt.getTime())) throw new ValidationError("receivedAt is invalid");
  const supplier = payload.supplier ? assertObjectId(payload.supplier, "supplier") : null;
  return {
    item: payload.item,
    movementType,
    quantity,
    reason,
    notes: text(payload.notes),
    allowNegativeStock: Boolean(payload.allowNegativeStock),
    unitCost,
    expiryDate,
    lotNumber: text(payload.lotNumber) || null,
    receivedAt,
    supplier,
  };
};

export const validateWastePayload = (payload) => {
  const movementType = text(payload.movementType).toUpperCase();
  if (!["WASTE", "DAMAGED"].includes(movementType)) {
    throw new ValidationError("Waste record type must be WASTE or DAMAGED");
  }
  assertObjectId(payload.item, "item");
  const quantity = number(payload.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new ValidationError("quantity must be greater than zero");
  }
  const reasonCode = text(payload.reasonCode).toUpperCase();
  if (!WASTE_REASON_CODES.includes(reasonCode)) throw new ValidationError("Invalid waste reason");
  const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) throw new ValidationError("recorded date is invalid");
  if (occurredAt.getTime() > Date.now() + 60000) throw new ValidationError("recorded date cannot be in the future");
  return {
    item: payload.item,
    movementType,
    quantity,
    reasonCode,
    reason: text(payload.reason) || reasonCode.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase()),
    notes: text(payload.notes),
    occurredAt,
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
  for (const field of ["tax", "discount", "additionalCharges"]) {
    if (field in payload || !partial) {
      const value = number(payload[field] ?? 0);
      if (!Number.isFinite(value) || value < 0) throw new ValidationError(`${field} must be zero or greater`);
      if (field === "leadTimeDays" && value > 3650) throw new ValidationError("leadTimeDays must be 3650 or less");
      result[field] = value;
    }
  }
  for (const field of ["notes", "priceOverrideReason"]) if (field in payload) result[field] = text(payload[field]);
  if ("expectedAt" in payload) {
    const expectedAt = payload.expectedAt ? new Date(payload.expectedAt) : null;
    if (expectedAt && Number.isNaN(expectedAt.getTime())) throw new ValidationError("expectedAt is invalid");
    result.expectedAt = expectedAt;
  }
  if ("status" in payload && !PURCHASE_ORDER_STATUSES.includes(payload.status)) throw new ValidationError("Invalid purchase order status");
  return result;
};

export const parsePagination = (query, defaultLimit = 20) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

export const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
