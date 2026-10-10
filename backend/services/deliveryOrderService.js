import mongoose from "mongoose";
import Order from "../models/Order.js";
import { DELIVERY_PROVIDERS } from "../config/sales.js";
import { calculateCartSubtotal, cartLineToOrderItem, resolveCartLines } from "./catalogService.js";
import { runInventoryTransaction } from "./inventoryStockService.js";
import { nextOrderNumber } from "./orderNumberService.js";
import { recordAuditLog } from "./auditLogService.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { OrderEngineError, resolveOrderInput } from "../config/orderContract.js";
import { creationIdentity, findCreationReplay, persistOrderWithInventory } from "./orderEngineService.js";

export class DeliveryOrderValidationError extends Error {
  constructor(message, status = 400, fields = undefined) {
    super(message);
    this.name = "DeliveryOrderValidationError";
    this.status = status;
    this.fields = fields;
  }
}

const MAX_MONEY = 1_000_000;
const cleanText = (value, length) => typeof value === "string" ? value.trim().slice(0, length) : "";

export const normalizeExternalOrderId = (value) => cleanText(value, 100).toUpperCase();

export const validateDeliveryOrderInput = (payload = {}, now = new Date()) => {
  const provider = cleanText(payload.provider, 30).toLowerCase();
  if (!DELIVERY_PROVIDERS.includes(provider)) throw new DeliveryOrderValidationError("Choose a supported delivery platform", 400, { provider: "Invalid platform" });

  const externalOrderId = normalizeExternalOrderId(payload.externalOrderId);
  if (!externalOrderId || !/^[A-Z0-9][A-Z0-9._\/-]{1,99}$/.test(externalOrderId)) {
    throw new DeliveryOrderValidationError("Enter a valid external order ID", 400, { externalOrderId: "Use 2-100 letters, numbers, dots, slashes, underscores or hyphens" });
  }

  const orderOccurredAt = new Date(payload.orderOccurredAt);
  if (Number.isNaN(orderOccurredAt.getTime())) throw new DeliveryOrderValidationError("Choose a valid original order date and time", 400, { orderOccurredAt: "Invalid date" });
  if (orderOccurredAt.getTime() > now.getTime() + 5 * 60 * 1000) throw new DeliveryOrderValidationError("Original order time cannot be in the future", 400, { orderOccurredAt: "Future dates are not allowed" });

  const entryStatus = cleanText(payload.entryStatus, 20).toLowerCase();
  if (!["completed", "cancelled"].includes(entryStatus)) throw new DeliveryOrderValidationError("Status must be completed or cancelled", 400, { entryStatus: "Invalid status" });

  const platformTotal = Number(payload.platformTotal);
  if (!Number.isFinite(platformTotal) || platformTotal < 0 || platformTotal > MAX_MONEY) {
    throw new DeliveryOrderValidationError("Platform total must be a valid non-negative SAR amount", 400, { platformTotal: "Invalid total" });
  }

  const branch = cleanText(payload.branch, 160);
  if (!branch) throw new DeliveryOrderValidationError("Branch is required", 400, { branch: "Required" });

  return {
    provider,
    externalOrderId,
    orderOccurredAt,
    entryStatus,
    platformTotal: Number(platformTotal.toFixed(2)),
    branch,
    notes: cleanText(payload.notes, 500),
    differenceReason: cleanText(payload.differenceReason, 300),
  };
};

export const findDeliveryOrderDuplicate = ({ provider, externalOrderId }) => Order.findOne({
  manualEntry: true,
  deliveryProvider: String(provider || "").toLowerCase(),
  externalOrderId: normalizeExternalOrderId(externalOrderId),
}).select("_id orderNumber deliveryProvider externalOrderId status orderOccurredAt").lean();

export const createHistoricalDeliveryOrder = async ({ payload, actor, restaurantSettings, now = new Date() }) => {
  if (!actor || !hasCapability(actor.role, CAPABILITIES.POS_OPERATE)) throw new OrderEngineError("Not authorized to enter delivery orders", 403);
  const contract = resolveOrderInput(payload, "admin");
  if (contract.orderType !== "delivery") throw new OrderEngineError("Delivery platform entries require delivery fulfillment");
  const input = validateDeliveryOrderInput(payload, now);
  const identity = creationIdentity({ payload, key: payload.idempotencyKey, channel: "admin", actor, orderType: "delivery" });
  const replay = await findCreationReplay(identity);
  if (replay) { replay.$locals.duplicate = true; return replay; }
  if (restaurantSettings?.orders?.channels?.[input.provider] === false) {
    throw new DeliveryOrderValidationError(`${input.provider} order entry is disabled in Restaurant Settings`, 503);
  }

  const duplicate = await findDeliveryOrderDuplicate(input);
  if (duplicate) {
    const error = new DeliveryOrderValidationError(`This ${input.provider} order is already saved as #${duplicate.orderNumber}`, 409);
    error.existingOrder = duplicate;
    throw error;
  }

  const catalogLines = await resolveCartLines(payload.items);
  const systemTotal = calculateCartSubtotal(catalogLines);
  const totalDifference = Number((input.platformTotal - systemTotal).toFixed(2));
  if (Math.abs(totalDifference) >= 0.01 && !input.differenceReason) {
    throw new DeliveryOrderValidationError("Explain the difference between platform and system totals", 400, { differenceReason: "Required when totals differ" });
  }

  const orderId = new mongoose.Types.ObjectId();
  const orderNumber = await nextOrderNumber();
  try {
    const order = await runInventoryTransaction(async (session) => {
      const completed = input.entryStatus === "completed";
      const created = await persistOrderWithInventory({ actor, session, catalogLines, deduct: completed, correlationId: payload.correlationId, fields: {
        _id: orderId,
        orderNumber,
        idempotencyKey: identity.idempotencyKey || `delivery-import:${input.provider}:${input.externalOrderId}`,
        creationRequestHash: identity.creationRequestHash,
        source: input.provider,
        createdBy: actor._id,
        manualEntry: true,
        deliveryProvider: input.provider,
        externalOrderId: input.externalOrderId,
        orderOccurredAt: input.orderOccurredAt,
        branch: input.branch,
        deliveryPaymentType: "aggregator_prepaid",
        customer: { name: `${input.provider.charAt(0).toUpperCase()}${input.provider.slice(1)} Customer`, phone: "Not collected", address: "" },
        items: catalogLines.map(cartLineToOrderItem),
        orderType: "delivery",
        subtotal: systemTotal,
        originalSubtotal: systemTotal,
        discountAmount: 0,
        deliveryFee: 0,
        totalAmount: systemTotal,
        platformTotal: input.platformTotal,
        totalDifference,
        differenceReason: input.differenceReason,
        status: completed ? "delivered" : "cancelled",
        paymentMethod: "other",
        paymentStatus: completed ? "paid" : "voided",
        eligiblePointsAmount: 0,
        pointsEarned: 0,
        notes: input.notes,
        kitchenNotes: contract.kitchenNotes,
        cancellationReason: completed ? "" : (input.notes || "Cancelled on delivery platform"),
        inventoryStatus: completed ? "pending" : "not_required",
        statusHistory: [{ status: completed ? "delivered" : "cancelled", reason: "Historical delivery platform entry", changedBy: actor._id, changedAt: now }],
      } });
      const transactions = created.inventoryTransactions;

      await recordAuditLog({
        actor,
        action: "DELIVERY_ORDER_MANUALLY_ENTERED",
        entityType: "Order",
        entityId: created._id,
        entityLabel: `Order #${created.orderNumber}`,
        correlationId: payload.correlationId || "",
        after: {
          provider: input.provider,
          externalOrderId: input.externalOrderId,
          orderOccurredAt: input.orderOccurredAt,
          branch: input.branch,
          entryStatus: input.entryStatus,
          systemTotal,
          platformTotal: input.platformTotal,
          totalDifference,
          differenceReason: input.differenceReason,
          inventoryStatus: created.inventoryStatus,
          inventoryTransactions: transactions,
          items: created.items,
        },
        metadata: { manualEntry: true, inventoryDeducted: completed && transactions.length > 0 },
        related: { order: created._id, inventoryTransactions: transactions },
      }, { session });
      return created;
    });
    return order;
  } catch (error) {
    const replay = await findCreationReplay(identity);
    if (replay) { replay.$locals.duplicate = true; return replay; }
    if (error?.code === 11000) {
      const existing = await findDeliveryOrderDuplicate(input);
      if (existing) {
        const duplicateError = new DeliveryOrderValidationError(`This ${input.provider} order is already saved as #${existing.orderNumber}`, 409);
        duplicateError.existingOrder = existing;
        throw duplicateError;
      }
    }
    throw error;
  }
};
