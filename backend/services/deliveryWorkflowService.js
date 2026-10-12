import crypto from "node:crypto";
import mongoose from "mongoose";
import Delivery from "../models/Delivery.js";
import DeliveryRequest from "../models/DeliveryRequest.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import { assertDeliveryEnabled } from "./riderAccessService.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { orderText } from "../config/orderContract.js";
import { runInventoryTransaction } from "./inventoryStockService.js";
import { recordAuditLog } from "./auditLogService.js";
import { transitionOrderInSession } from "./orderEngineService.js";
import { recordOrderPaymentInSession } from "./orderPaymentService.js";
import { findOpenShift } from "./posShiftService.js";
import { toHalala, fromHalala } from "../utils/money.js";
import { eligibleDeliveryOrder, outstandingDeliveryHalala, deliveryError, serializeDelivery } from "./deliveryContractService.js";
import { readDeliveryTimeline } from "./deliveryTimelineService.js";

const capability = (actor, cap) => {
  if (!actor?._id) throw deliveryError("Staff sign-in required", 401);
  if (!hasCapability(actor.role, cap)) throw deliveryError("Not authorized for this delivery action", 403);
};
const objectId = value => { if (!mongoose.isValidObjectId(value)) throw deliveryError("Delivery unavailable", 404); return value; };
const reasonText = value => { const reason = orderText(value, "Reason"); if (!reason) throw deliveryError("A reason is required (do not include customer contact information)"); return reason; };
const revisionOf = payload => { if (!Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0) throw deliveryError("An expected revision is required"); return payload.expectedRevision; };
const digest = value => crypto.createHash("sha256").update(value).digest("hex");

// Serialize the complete action with both order and delivery revisions. No offline queue.
async function requestOnce({ scope, action, actor, payload }, work) {
  await assertDeliveryEnabled();
  const key = orderText(payload.idempotencyKey, "Request identifier", 120);
  if (!/^[A-Za-z0-9._:-]{16,120}$/.test(key)) throw deliveryError("A unique request identifier is required");
  const id = digest(`${scope}:${key}`);
  const fingerprint = digest(JSON.stringify({ action, actor: String(actor._id), contents: Object.fromEntries(Object.keys(payload).sort().map(key => [key, payload[key]])) }));
  const replay = async session => {
    const prior = await DeliveryRequest.findById(id).session(session || null).lean();
    if (!prior) return null;
    if (String(prior.actor) !== String(actor._id) || prior.fingerprint !== fingerprint) throw deliveryError("Request identifier was used with different contents", 409);
    return { ...prior.result, duplicate: true };
  };
  try {
    return await runInventoryTransaction(async session => {
      if (!session) throw deliveryError("Delivery workflow requires a MongoDB replica set", 503);
      await assertDeliveryEnabled(session, { lock: true });
      const prior = await replay(session); if (prior) return prior;
      await DeliveryRequest.create([{ _id: id, actor: actor._id, fingerprint }], { session });
      const result = await work(session, id);
      await DeliveryRequest.updateOne({ _id: id }, { $set: { result } }, { session });
      return { ...result, duplicate: false };
    });
  } catch (error) {
    if (error.code === 11000) { const prior = await replay(); if (prior) return prior; }
    throw error;
  }
}

export async function enrollDelivery({ actor, orderId, payload, correlationId }) {
  capability(actor, CAPABILITIES.DELIVERY_MANAGE); await assertDeliveryEnabled(); objectId(orderId);
  revisionOf(payload); const reason = reasonText(payload.reason);
  return requestOnce({ scope: `enroll:${orderId}`, action: "enroll", actor, payload }, async session => {
    const order = await Order.findById(orderId).session(session);
    if (!eligibleDeliveryOrder(order, { enrolled: false }) || ["out-for-delivery", "delivered"].includes(order.status)) throw deliveryError("Only a current, non-platform restaurant delivery order can be enrolled", 409);
    const exists = await Delivery.findOne({ order: orderId }).session(session);
    if (exists) throw deliveryError("Order already enrolled; open its delivery record", 409);
    const claim = await Order.updateOne({ _id: orderId, __v: payload.expectedRevision }, { $set: { deliveryMode: "restaurant" }, $inc: { __v: 1 } }, { session });
    if (!claim.matchedCount) throw deliveryError("Order changed; reload its current revision", 409);
    const [delivery] = await Delivery.create([{ order: orderId, pickupInstructions: orderText(payload.pickupInstructions, "Pickup instructions", 300) || undefined,
      deliveryNote: orderText(payload.deliveryNote, "Delivery note", 300), enrollmentReason: reason }], { session });
    await recordAuditLog({ actor, action: "DELIVERY_ENROLLED", entityType: "Order", entityId: order._id, correlationId,
      reason: "Authorized restaurant-delivery enrollment", after: { deliveryMode: "restaurant", delivery: delivery._id } }, { session });
    return { id: String(delivery._id), revision: 0, status: delivery.status };
  });
}

const ownScope = (actor, id) => ({ _id: objectId(id), ...(actor.role === "rider" ? { rider: actor._id } : actor.role === "cashier" ? { status: "delivered" } : {}) });
export async function getWorkflowDelivery(actor, id) {
  await assertDeliveryEnabled();
  capability(actor, actor.role === "rider" ? CAPABILITIES.RIDER_DELIVERY_OPERATE : CAPABILITIES.DELIVERY_CASH_CONFIRM);
  const delivery = await Delivery.findOne(ownScope(actor, id)).lean();
  if (!delivery) throw deliveryError("Delivery unavailable", 404);
  const [order, rider] = await Promise.all([Order.findById(delivery.order).lean(), delivery.rider ? User.findById(delivery.rider).select("name").lean() : null]);
  if (!order) throw deliveryError("Delivery unavailable", 404);
  return { ...serializeDelivery(delivery, order, rider, { detail: true }),
    ...(actor.role !== "rider" ? { timeline: await readDeliveryTimeline(actor, delivery, order) } : {}) };
}

export async function setRiderAvailability({ actor, payload, correlationId }) {
  capability(actor, CAPABILITIES.RIDER_DELIVERY_OPERATE);
  if (actor.role !== "rider" || typeof payload.available !== "boolean") throw deliveryError("Only a rider can update their own availability", 403);
  revisionOf(payload);
  return requestOnce({ scope: `availability:${actor._id}`, action: "availability", actor, payload }, async session => {
    const result = await User.updateOne({ _id: actor._id, role: "rider", isActive: { $ne: false },
      $or: [{ riderAvailabilityRevision: payload.expectedRevision }, ...(payload.expectedRevision === 0 ? [{ riderAvailabilityRevision: { $exists: false } }] : [])] },
    { $set: { riderAvailable: payload.available }, $inc: { riderAvailabilityRevision: 1 } }, { session });
    if (!result.matchedCount) throw deliveryError("Availability changed; reload the rider dashboard", 409);
    await recordAuditLog({ actor, action: "RIDER_AVAILABILITY_CHANGED", entityType: "User", entityId: actor._id,
      after: { available: payload.available }, correlationId }, { session });
    return { available: payload.available, revision: payload.expectedRevision + 1 };
  });
}

const actions = {
  assign: CAPABILITIES.DELIVERY_MANAGE, resolve_issue: CAPABILITIES.DELIVERY_MANAGE,
  acknowledge_cash: CAPABILITIES.DELIVERY_MANAGE, confirm_cash: CAPABILITIES.DELIVERY_CASH_CONFIRM,
  pickup: CAPABILITIES.RIDER_DELIVERY_OPERATE, deliver: CAPABILITIES.RIDER_DELIVERY_OPERATE,
  issue: CAPABILITIES.RIDER_DELIVERY_OPERATE, report_cash: CAPABILITIES.RIDER_DELIVERY_OPERATE,
};
export async function actOnDelivery({ actor, id, action, payload, correlationId }) {
  if (!actions[action]) throw deliveryError("Unknown delivery action");
  capability(actor, actions[action]); await assertDeliveryEnabled(); objectId(id); revisionOf(payload);
  if (["pickup", "deliver", "issue", "report_cash"].includes(action) && actor.role !== "rider") throw deliveryError("Rider action requires the assigned rider", 403);
  // Scope checked before replay: a former rider cannot retrieve another rider's action result.
  if (!await Delivery.exists(ownScope(actor, id))) throw deliveryError("Delivery unavailable", 404);
  return requestOnce({ scope: `delivery:${id}`, action, actor, payload }, async (session, requestId) => {
    const delivery = await Delivery.findOne(ownScope(actor, id)).session(session);
    if (!delivery) throw deliveryError("Delivery unavailable", 404);
    if (delivery.revision !== payload.expectedRevision) throw deliveryError("Delivery changed; reload before acting", 409);
    const order = await Order.findById(delivery.order).session(session);
    if (!eligibleDeliveryOrder(order)) throw deliveryError("Order is no longer eligible for restaurant delivery", 409);
    const priorStatus = delivery.status;
    const claim = await Delivery.updateOne({ ...ownScope(actor, id), revision: payload.expectedRevision }, { $inc: { revision: 1 } }, { session });
    if (!claim.matchedCount) throw deliveryError("Delivery changed; reload before acting", 409);
    delivery.revision += 1;
    // Order claim serializes payment/refund/void races even for status-independent delivery actions.
    if (!["pickup", "deliver", "confirm_cash"].includes(action)) {
      const lock = await Order.updateOne({ _id: order._id, __v: order.__v }, { $inc: { __v: 1 } }, { session });
      if (!lock.matchedCount) throw deliveryError("Order changed; reload before acting", 409);
    }
    const now = new Date();
    if (action === "assign") {
      if (!["unassigned", "assigned"].includes(delivery.status)) throw deliveryError("After pickup/issue, resolve explicitly; reassignment is blocked", 409);
      if (!mongoose.isValidObjectId(payload.riderId)) throw deliveryError("Select an active available rider");
      if (delivery.rider && String(delivery.rider) === payload.riderId) throw deliveryError("Rider is already assigned", 409);
      const reason = delivery.rider ? reasonText(payload.reason) : orderText(payload.reason, "Assignment reason");
      if (delivery.assignmentHistory.length >= 100) throw deliveryError("Assignment history limit reached; authorized investigation required", 409);
      const rider = await User.updateOne({ _id: payload.riderId, role: "rider", isActive: { $ne: false }, riderAvailable: true }, { $inc: { riderAvailabilityRevision: 1 } }, { session });
      if (!rider.matchedCount) throw deliveryError("Rider is inactive or unavailable", 409);
      delivery.rider = payload.riderId; delivery.status = "assigned"; delivery.assignedAt = now; delivery.assignedBy = actor._id;
      delivery.assignmentHistory.push({ rider: payload.riderId, actor: actor._id, reason, at: now });
    } else if (action === "pickup" || action === "deliver") {
      const expected = action === "pickup" ? "assigned" : "picked_up";
      if (delivery.status !== expected) throw deliveryError(`Delivery must be ${expected} before ${action}`, 409);
      await transitionOrderInSession({ orderId: order._id, nextStatus: action === "pickup" ? "out-for-delivery" : "delivered", expectedStatus: action === "pickup" ? "ready" : "out-for-delivery", actor, workflow: "rider", session, correlationId });
      delivery.status = action === "pickup" ? "picked_up" : "delivered";
      if (action === "pickup") delivery.pickedUpAt = now; else delivery.deliveredAt = now;
    } else if (action === "issue") {
      if (!["assigned", "picked_up"].includes(delivery.status)) throw deliveryError("Only active deliveries can report an issue", 409);
      if (delivery.issueHistory.length >= 100) throw deliveryError("Issue history limit reached; authorized investigation required", 409);
      delivery.issue = { previousStatus: delivery.status, reason: reasonText(payload.reason), reportedAt: now, reportedBy: actor._id };
      delivery.status = "issue";
    } else if (action === "resolve_issue") {
      if (delivery.status !== "issue") throw deliveryError("No unresolved delivery issue", 409);
      delivery.issue.resolution = reasonText(payload.reason); delivery.issue.resolvedAt = now; delivery.issue.resolvedBy = actor._id;
      delivery.issueHistory.push(delivery.issue.toObject());
      delivery.status = delivery.issue.previousStatus; // Same rider and stage; never silently reassign/cancel/refund.
    } else if (action === "report_cash") {
      if (delivery.status !== "delivered" || delivery.cashReport.status !== "none") throw deliveryError("Cash may be reported once after delivery", 409);
      if (!["string", "number"].includes(typeof payload.amount) || !/^\d+(\.\d{1,2})?$/.test(String(payload.amount))) throw deliveryError("Reported cash must be a non-negative SAR amount with at most two decimals");
      const balance = outstandingDeliveryHalala(order), amount = toHalala(payload.amount, "Reported cash");
      if (balance === null || balance <= 0 || amount > balance) throw deliveryError("Reported cash exceeds the authoritative outstanding balance", 409);
      const reason = amount < balance ? reasonText(payload.reason) : orderText(payload.reason, "Cash report reason");
      delivery.cashReport = { status: amount < balance ? "discrepancy" : "unconfirmed", amountHalala: amount,
        balanceAtReportHalala: balance, reportedAt: now, reportedBy: actor._id, reason };
    } else if (action === "acknowledge_cash") {
      if (delivery.cashReport.status !== "discrepancy" || delivery.cashReport.acknowledgedAt) throw deliveryError("No unacknowledged cash discrepancy", 409);
      delivery.cashReport.acknowledgmentReason = reasonText(payload.reason);
      delivery.cashReport.acknowledgedAt = now; delivery.cashReport.acknowledgedBy = actor._id;
    } else if (action === "confirm_cash") {
      const serialized = serializeDelivery(delivery, order);
      if (!serialized.canConfirmCash || delivery.status !== "delivered") throw deliveryError(serialized.cashConfirmationGap || "Cash report is not confirmable", 409);
      const terminal = orderText(payload.terminal, "Cashier collection terminal", 60);
      if (!terminal || !await findOpenShift({ cashier: actor._id, terminal }, session)) throw deliveryError("Open your cashier shift on the selected terminal before confirming rider cash", 409);
      const paymentKey = `rider-cash:${requestId}`;
      await recordOrderPaymentInSession({ orderId: order._id, actor, payload: { idempotencyKey: paymentKey, method: "cash", amount: fromHalala(delivery.cashReport.amountHalala), terminal, reference: "" }, session, correlationId });
      delivery.cashReport.status = "confirmed"; delivery.cashReport.confirmedAt = now; delivery.cashReport.confirmedBy = actor._id; delivery.cashReport.paymentKey = paymentKey;
    }
    await delivery.save({ session });
    await recordAuditLog({ actor, action: `DELIVERY_${action.toUpperCase()}`, entityType: "Delivery", entityId: delivery._id, entityLabel: order.orderNumber,
      correlationId, related: { order: order._id, rider: delivery.rider },
      before: { status: priorStatus, revision: payload.expectedRevision },
      after: { status: delivery.status, revision: delivery.revision, cashStatus: delivery.cashReport.status },
      reason: payload.reason ? "Authorized explanation recorded in private delivery record" : "",
    }, { session });
    return { id: String(delivery._id), revision: delivery.revision, status: delivery.status };
  });
}
