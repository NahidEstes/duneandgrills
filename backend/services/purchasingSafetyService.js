import { ValidationError } from "../utils/inventoryValidation.js";

export const purchaseQuantity = value => Number(Number(value || 0).toFixed(6));
export const purchasingManager = actor => ["admin", "manager"].includes(actor?.role);

export function requirePurchasingTransaction(session) {
  if (session) return;
  const error = new Error("Purchasing safety requires a MongoDB replica-set transaction. No receipt or invoice was saved");
  error.status = 503;
  throw error;
}

export function receiptKey(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 128) {
    throw new ValidationError("A receipt idempotency key of 1–128 characters is required");
  }
  return value.trim();
}
