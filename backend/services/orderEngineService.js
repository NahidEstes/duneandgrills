import crypto from "node:crypto";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import OrderRequestFence from "../models/OrderRequestFence.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { calculateOrderPoints } from "../config/rewards.js";
import { ORDER_STATUSES } from "../config/orderStatuses.js";
import { OrderEngineError, orderContract, orderText, resolveOrderTransition } from "../config/orderContract.js";
import { deductOrderInventory, restoreOrderInventory } from "./orderInventoryService.js";
import { runInventoryTransaction } from "./inventoryStockService.js";
import { creditOrderPoints, reverseOrderPoints, restoreRedemption } from "./rewardService.js";
import { pickAuditFields, recordAuditLog } from "./auditLogService.js";
import { awardCompletedOrderPoints } from "./orderPaymentService.js";

const stable = value => value && typeof value.toJSON === "function" ? stable(value.toJSON()) : Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, stable(value[key])])) : value;
const digest = value => crypto.createHash("sha256").update(value).digest("hex");

export const creationIdentity = ({ payload, key, channel, actor, orderType }) => {
  if (key === undefined || key === "") return {};
  if (typeof key === "string") key = key.trim();
  if (typeof key !== "string" || !/^[A-Za-z0-9._:-]{1,120}$/.test(key)) throw new OrderEngineError("Invalid order request identifier");
  if (!actor && key.length < 16) throw new OrderEngineError("Guest request identifier must contain at least 16 characters");
  const owner = String(actor?._id || "guest");
  // Revision/approval tokens coordinate a draft; they are not sale contents.
  const { idempotencyKey, sourceChannel, fulfillmentType, heldSaleRevision, discountApprovalToken, correlationId, ...contents } = payload;
  const normalized = { ...contents, orderType, notes: orderText(payload.notes, "Order notes"), kitchenNotes: orderText(payload.kitchenNotes, "Kitchen notes") };
  return {
    idempotencyKey: channel === "pos" ? key : `${channel}:${owner}:${digest(key)}`,
    creationRequestHash: digest(JSON.stringify(stable(normalized))),
    channel, owner,
  };
};

const assertFenceOwner = (fence, identity) => {
  if (fence.channel !== identity.channel || fence.owner !== identity.owner) throw new OrderEngineError("Order request identifier belongs to another actor", 403);
  if (fence.requestHash && fence.requestHash !== identity.creationRequestHash) throw new OrderEngineError("Order request identifier was already used with different contents", 409);
};

export const findCreationReplay = async (identity, session = null) => {
  if (!identity.idempotencyKey) return null;
  const order = await Order.findOne({ idempotencyKey: identity.idempotencyKey }).select("+creationRequestHash").session(session);
  if (!order) {
    const fence = await OrderRequestFence.findById(digest(identity.idempotencyKey)).session(session);
    if (fence) {
      assertFenceOwner(fence, identity);
      if (fence.state === "cancelled") throw new OrderEngineError("This order request was safely cancelled. Submit a new request", 410);
    }
    return null;
  }
  const owner = identity.channel === "customer" ? String(order.user || "guest") : String(order.createdBy || "guest");
  if (orderContract(order).sourceChannel !== identity.channel || owner !== identity.owner) throw new OrderEngineError("Order request identifier belongs to another actor", 403);
  if (order.creationRequestHash && order.creationRequestHash !== identity.creationRequestHash) throw new OrderEngineError("Order request identifier was already used with different contents", 409);
  return order;
};

export const trackingTokenForIdentity = identity => crypto.createHmac("sha256", process.env.JWT_SECRET).update(`order-tracking:${identity.idempotencyKey}`).digest("base64url");

// Serialize abandonment with creation, even when the original HTTP request is
// still running. If creation won, return its order instead of cancelling a sale.
export const cancelCreationRequest = async ({ identity, actor, correlationId = "" }) => {
  if (!identity.idempotencyKey) throw new OrderEngineError("Order request identifier is required");
  const readOutcome = async session => {
    const fence = await OrderRequestFence.findById(digest(identity.idempotencyKey)).session(session || null);
    if (fence) { assertFenceOwner(fence, identity); if (fence.state === "cancelled") return { cancelled: true }; }
    const order = await findCreationReplay(identity, session || null);
    return order ? { cancelled: false, order } : null;
  };
  try {
    return await runInventoryTransaction(async session => {
      if (!session) throw new OrderEngineError("Order reconciliation requires a MongoDB replica set", 503);
      const outcome = await readOutcome(session);
      if (outcome) return outcome;
      const [fence] = await OrderRequestFence.create([{ _id: digest(identity.idempotencyKey), channel: identity.channel, owner: identity.owner, requestHash: identity.creationRequestHash, state: "cancelled" }], { session });
      await recordAuditLog({ actor, action: "ORDER_REQUEST_CANCELLED", entityType: "OrderRequest", entityLabel: fence._id, correlationId, metadata: { channel: identity.channel } }, { session });
      return { cancelled: true };
    });
  } catch (error) {
    const outcome = await readOutcome();
    if (outcome) return outcome;
    throw error;
  }
};

// Call inside the channel's existing transaction; preserve its payment/shift hooks.
export const persistOrderWithInventory = async ({ fields, catalogLines, actor, session, deduct = true, correlationId = "" }) => {
  if (!session) throw new OrderEngineError("The unified order engine requires a MongoDB replica set", 503);
  if (fields.idempotencyKey) {
    const channel = orderContract(fields).sourceChannel;
    await OrderRequestFence.create([{ _id: digest(fields.idempotencyKey), channel, owner: String((channel === "customer" ? fields.user : fields.createdBy) || "guest"), requestHash: fields.creationRequestHash, state: "committed", order: fields._id }], { session });
  }
  const [order] = await Order.create([{
    ...fields,
    statusHistory: fields.statusHistory || [{ status: fields.status || "pending", reason: "Order created", changedBy: actor?._id || null }],
  }], { session });
  const transactions = deduct ? await deductOrderInventory({ catalogLines, orderId: order._id, orderNumber: order.orderNumber, source: order.source, actorId: actor?._id || null, session }) : [];
  order.inventoryTransactions = transactions.map(row => row._id);
  order.inventoryStatus = transactions.length ? "deducted" : "not_required";
  order.inventoryDeductedAt = transactions.length ? new Date() : null;
  await order.save({ session });
  await recordAuditLog({ actor, action: "ORDER_CREATED", entityType: "Order", entityId: order._id, entityLabel: order.orderNumber, correlationId,
    after: { ...orderContract(order), paymentStatus: order.paymentStatus, inventoryStatus: order.inventoryStatus },
  }, { session });
  return order;
};

const auditFields = ["status", "paymentStatus", "inventoryStatus", "cancellationReason", "estimatedPreparationMinutes", "preparationDueAt", "acceptedAt", "preparationStartedAt", "readyAt"];

export const transitionOrderInSession = async ({ orderId, nextStatus, actor, reason, estimatedPreparationMinutes, expectedStatus, workflow = "admin", defaultPreparationMinutes = 20, correlationId = "", session }) => {
  const capability = workflow === "kitchen" ? CAPABILITIES.KITCHEN_OPERATE : workflow === "handoff" ? CAPABILITIES.ORDERS_HANDOFF : CAPABILITIES.ORDERS_MANAGE;
  if (!actor || !hasCapability(actor.role, capability)) throw new OrderEngineError("Not authorized to change order fulfillment", 403);
  if (!mongoose.isValidObjectId(orderId)) throw new OrderEngineError("Invalid order id");
  if (!session) throw new OrderEngineError("Order transitions require a MongoDB replica set", 503);
  const order = await Order.findById(orderId).session(session);
  if (!order) throw new OrderEngineError("Order not found", 404);
  if (expectedStatus !== undefined && !ORDER_STATUSES.includes(expectedStatus)) throw new OrderEngineError("Invalid expected status");
  if (expectedStatus !== undefined && order.status !== expectedStatus) throw new OrderEngineError(`Order status already changed to ${order.status}`, 409);
  const result = resolveOrderTransition(order, nextStatus, workflow);
  const normalizedReason = orderText(reason, "Status reason");
  if (nextStatus === "cancelled" && !normalizedReason) throw new OrderEngineError("Cancellation reason is required");
  let minutes = estimatedPreparationMinutes;
  if (minutes !== undefined && minutes !== null && minutes !== "") {
    minutes = Number(minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) throw new OrderEngineError("Estimated preparation time must be between 1 and 240 minutes");
    if (!["pending", "confirmed", "preparing"].includes(nextStatus)) throw new OrderEngineError("Preparation estimates can only change on active preparation orders");
  } else minutes = null;
  const estimateChanged = minutes && minutes !== order.estimatedPreparationMinutes;
  if (result.duplicate && !estimateChanged) return { order, duplicate: true };
  const before = pickAuditFields(order, auditFields);
  const previousStatus = order.status;
  const now = new Date();
  // Claim the order before side effects; transaction conflicts serialize kitchen,
  // admin, refund and void writes without erasing another workflow's history.
  const revision = Number(order.__v || 0);
  const versionFilter = order.__v === undefined ? { __v: { $exists: false } } : { __v: revision };
  const claim = await Order.updateOne({ _id: order._id, status: previousStatus, ...versionFilter }, { $inc: { __v: 1 } }, { session });
  if (!claim.matchedCount) throw new OrderEngineError("Order changed before this update; reload it", 409);
  order.__v = revision + 1;
  order.status = nextStatus;
  if (nextStatus === "cancelled") order.cancellationReason = normalizedReason;
  if (nextStatus === "confirmed" && !order.acceptedAt) order.acceptedAt = now;
  if (nextStatus === "preparing" && !order.preparationStartedAt) order.preparationStartedAt = now;
  if (nextStatus === "ready" && !order.readyAt) order.readyAt = now;
  if (minutes) order.estimatedPreparationMinutes = minutes;
  if (["confirmed", "preparing"].includes(nextStatus) && (!order.preparationDueAt || estimateChanged)) {
    order.estimatedPreparationMinutes ||= defaultPreparationMinutes;
    order.preparationDueAt = new Date(now.getTime() + order.estimatedPreparationMinutes * 60_000);
  }
  if (["cancelled", "failed"].includes(nextStatus)) {
    if (["pending", "confirmed"].includes(previousStatus) && !order.preparationStartedAt && order.inventoryStatus === "deducted") {
      const restored = await restoreOrderInventory({ transactionIds: order.inventoryTransactions, orderId: order._id, orderNumber: order.orderNumber, actorId: actor._id, status: nextStatus, session });
      order.inventoryRestorationTransactions = restored.map(row => row._id);
      order.inventoryStatus = "restored"; order.inventoryRestoredAt = now;
    }
    if (order.user) {
      if (!order.pointsReversedAt && await reverseOrderPoints({ userId: order.user, orderId: order._id, orderNumber: order.orderNumber, session })) order.pointsReversedAt = now;
      if (order.rewardRedemption?.redemptionId) await restoreRedemption({ userId: order.user, redemptionId: order.rewardRedemption.redemptionId, expectedStatuses: ["applied"], status: "restored", description: `${order.rewardRedemption.title} returned after Order #${order.orderNumber} was ${nextStatus}`, session });
    }
  }
  // Fulfillment never captures or refunds money. POS awards at captured sale time.
  if (nextStatus === "delivered" && order.rewardAccrualPolicy === "completion") await awardCompletedOrderPoints(order, session);
  if (nextStatus === "delivered" && !order.rewardAccrualPolicy && order.source !== "pos" && order.user && !order.pointsAwardedAt) {
    const points = calculateOrderPoints(order.eligiblePointsAmount ?? order.totalAmount);
    const credited = await creditOrderPoints({ userId: order.user, orderId: order._id, orderNumber: order.orderNumber, points, session });
    if (credited) { order.pointsEarned = points; order.pointsAwardedAt = now; }
  }
  if (!result.duplicate) order.statusHistory.push({ status: nextStatus, reason: normalizedReason || (workflow === "kitchen" ? "Kitchen workflow" : ""), changedBy: actor._id, changedAt: now });
  await order.save({ session });
  await recordAuditLog({ actor, action: result.duplicate ? "ORDER_PREPARATION_UPDATED" : workflow === "kitchen" ? "KITCHEN_ORDER_STATUS_CHANGED" : "ORDER_STATUS_CHANGED", entityType: "Order", entityId: order._id, entityLabel: order.orderNumber, correlationId,
    before, after: pickAuditFields(order, auditFields), metadata: { workflow, from: previousStatus, to: nextStatus, reason: normalizedReason },
  }, { session });
  return { order, duplicate: false };
};

export const transitionOrder = options => runInventoryTransaction(session => transitionOrderInSession({ ...options, session }));

export const transitionOrders = options => runInventoryTransaction(async session => {
  const results = [];
  // Deliberately sequential on one session; any failure rolls back the whole batch.
  for (const orderId of [...options.orderIds].sort()) results.push(await transitionOrderInSession({ ...options, expectedStatus: options.expectedStatuses?.[orderId] ?? options.expectedStatus, orderId, session }));
  return results;
});
