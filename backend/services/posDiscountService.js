import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../models/User.js";
import PosDiscountApproval from "../models/PosDiscountApproval.js";
import { createPinLookup, normalizePin } from "./attendanceService.js";
import { recordAuditLog } from "./auditLogService.js";

export class PosDiscountError extends Error {
  constructor(message, status = 400) { super(message); this.name = "PosDiscountError"; this.status = status; }
}

const clean = (value, maximum = 160) => typeof value === "string" ? value.trim().slice(0, maximum) : "";
const money = (value) => Number(Number(value).toFixed(2));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

export const resolvePosDiscount = ({ subtotal, discount = {}, settings, role }) => {
  const type = discount.type === "percentage" ? "percentage" : "fixed";
  const value = Number(discount.value || 0);
  const reason = clean(discount.reason);
  if (!Number.isFinite(value) || value < 0) throw new PosDiscountError("Discount value must be zero or greater");
  if (value > 0 && !reason) throw new PosDiscountError("Discount reason is required");
  if (value > 0 && !settings.discountsEnabled) throw new PosDiscountError("POS discounts are disabled", 403);
  if (type === "percentage" && value > 100) throw new PosDiscountError("Percentage discount cannot exceed 100%");
  const amount = money(Math.min(subtotal, type === "percentage" ? subtotal * value / 100 : value));
  const privileged = ["manager", "admin"].includes(role);
  const approvalRequired = amount > 0 && !privileged && (
    (type === "percentage" && value > settings.cashierMaxPercentage)
    || amount > settings.cashierMaxAmount
    || (settings.managerApprovalThreshold > 0 && amount >= settings.managerApprovalThreshold)
  );
  return { type, value: money(value), reason, amount, approvalRequired };
};

export const posDiscountFingerprint = ({ cashierId, items, discount }) => hash(JSON.stringify({
  cashierId: String(cashierId),
  items: (items || []).map((line) => ({
    productId: String(line.productId || ""), productType: line.productType || "menuItem", quantity: Number(line.quantity || 0),
    customization: line.customization || {},
  })),
  type: discount.type, value: discount.value, amount: discount.amount, reason: discount.reason,
}));

export const approvePosDiscount = async ({ cashier, pin, items, discount, correlationId }) => {
  const normalizedPin = normalizePin(pin);
  const approver = await User.findOne({
    pinLookup: createPinLookup(normalizedPin), role: { $in: ["manager", "admin"] }, isActive: { $ne: false },
  }).select("name role +pinHash");
  if (!approver?.pinHash || !(await bcrypt.compare(normalizedPin, approver.pinHash))) throw new PosDiscountError("Manager approval PIN is invalid", 401);
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const fingerprint = posDiscountFingerprint({ cashierId: cashier._id, items, discount });
  const approval = await PosDiscountApproval.create({
    tokenHash: hash(rawToken), fingerprint, cashier: cashier._id, approver: approver._id,
    discountType: discount.type, discountValue: discount.value, discountAmount: discount.amount,
    reason: discount.reason, expiresAt: new Date(Date.now() + 5 * 60_000),
  });
  await recordAuditLog({ actor: approver, action: "POS_DISCOUNT_APPROVED", entityType: "PosDiscountApproval", entityId: approval._id, entityLabel: discount.reason, related: { cashier: cashier._id }, after: { discountType: discount.type, discountValue: discount.value, discountAmount: discount.amount }, correlationId });
  return { token: rawToken, expiresAt: approval.expiresAt, approver: { _id: approver._id, name: approver.name, role: approver.role } };
};

export const consumePosDiscountApproval = async ({ token, cashierId, items, discount, orderId, session }) => {
  if (!token) throw new PosDiscountError("Manager approval is required for this discount", 403);
  const fingerprint = posDiscountFingerprint({ cashierId, items, discount });
  const now = new Date();
  const approval = await PosDiscountApproval.findOneAndUpdate(
    { tokenHash: hash(String(token)), fingerprint, cashier: cashierId, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now, order: orderId } },
    { new: true, ...(session ? { session } : {}) }
  );
  if (!approval) throw new PosDiscountError("Manager approval expired or does not match this sale", 403);
  return approval;
};
