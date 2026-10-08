import { ACTIVE_PREPARATION_STATUSES } from "./orderSerializer.js";
import { ValidationError } from "../utils/inventoryValidation.js";

export const ORDER_ATTENTION_CATEGORIES = Object.freeze(["pending_age", "preparation_overdue"]);

// Shared by the read-only dashboard and the destination order list.
export function orderAttentionFilter(category, settings, now = new Date()) {
  if (!ORDER_ATTENTION_CATEGORIES.includes(category)) throw new ValidationError("Unsupported attention filter");
  const live = { manualEntry: { $ne: true }, paymentStatus: { $ne: "voided" }, voidedAt: null };
  return category === "pending_age"
    ? { ...live, status: "pending", createdAt: { $lt: new Date(now.getTime() - settings.preparation.pendingAttentionMinutes * 60000) } }
    : { ...live, status: { $in: [...ACTIVE_PREPARATION_STATUSES] }, preparationDueAt: { $ne: null, $lt: now } };
}
