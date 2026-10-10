import mongoose from "mongoose";
import PosHeldSale from "../models/PosHeldSale.js";
import { resolveCartLines, calculateCartSubtotal } from "../services/catalogService.js";
import { getEffectiveRestaurantSettings } from "../services/restaurantSettingsService.js";
import { resolvePosDiscount } from "../services/posDiscountService.js";
import { recordAuditLog } from "../services/auditLogService.js";
import { resolvePosTerminal, terminalSnapshot } from "../services/posTerminalService.js";

class DraftError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const clean = (value, maximum) => typeof value === "string" ? value.trim().slice(0, maximum) : "";
const elevated = (user) => ["manager", "admin"].includes(user?.role);
const canAccess = (draft, user) => elevated(user) || String(draft.cashier?._id || draft.cashier) === String(user._id);
const requestItems = (lines) => lines.map((line) => ({
  productId: line.product._id,
  productType: line.productType,
  quantity: line.quantity,
  name: line.product.name,
  image: line.product.image || "",
  price: Number((Number(line.unitPrice || 0)).toFixed(2)),
  customization: {
    selectedAddOns: (line.customization?.selectedAddOns || []).map((addOn) => ({ addOn: addOn.addOn, name: addOn.name, image: addOn.image || "", price: addOn.price, quantity: addOn.quantity })),
    spiceLevel: line.customization?.spiceLevel || "",
    note: line.customization?.note || "",
    key: line.customization?.key || "",
  },
}));

const normalizePayload = async (body, user) => {
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > 100) throw new DraftError("A held sale cannot contain more than 100 lines");
  const catalogLines = items.length ? await resolveCartLines(items) : [];
  const settings = await getEffectiveRestaurantSettings();
  const subtotal = calculateCartSubtotal(catalogLines);
  const discount = resolvePosDiscount({ subtotal, discount: body.discount, settings: settings.posCheckout, role: user.role });
  const customerId = body.customerId || null;
  if (customerId && !mongoose.isValidObjectId(customerId)) throw new DraftError("Selected customer is invalid");
  return {
    items: requestItems(catalogLines),
    orderNote: clean(body.orderNote, 500),
    discount: { type: discount.type, value: discount.value, reason: discount.reason },
    customerId,
    customer: { name: clean(body.customer?.name, 100), phone: clean(body.customer?.phone, 30), pickupNote: clean(body.customer?.pickupNote, 240), address: clean(body.customer?.address, 500) },
    orderType: ["takeaway", "delivery"].includes(body.orderType) ? body.orderType : "dine-in",
    checkoutOptions: { couponCode: clean(body.checkoutOptions?.couponCode, 40), rewardId: clean(body.checkoutOptions?.rewardId, 24), orderOrigin: body.checkoutOptions?.orderOrigin === "phone" ? "phone" : "counter", paymentReference: clean(body.checkoutOptions?.paymentReference, 160) },
    paymentMethod: ["cash", "card", "other"].includes(body.paymentMethod) ? body.paymentMethod : "cash",
    cashReceived: Math.max(0, Number(body.cashReceived) || 0),
    label: clean(body.label, 100),
    subtotal,
    discountAmount: discount.amount,
    total: Number((subtotal - discount.amount).toFixed(2)),
    approvalRequired: discount.approvalRequired,
    expiryHours: settings.posCheckout.heldSaleExpiryHours,
  };
};

const serialize = (draft, computed = {}) => {
  const source = typeof draft.toObject === "function" ? draft.toObject() : draft;
  return { ...source, ...computed };
};

const expireOld = () => PosHeldSale.updateMany({ status: { $in: ["working", "held"] }, expiresAt: { $lte: new Date() } }, { $set: { status: "expired" } });

export const listHeldSales = async (req, res, next) => {
  try {
    await expireOld();
    const filter = { status: req.query.includeWorking === "true" ? { $in: ["working", "held"] } : "held" };
    if (!elevated(req.user)) filter.cashier = req.user._id;
    if (req.query.terminal) filter.terminal = (await resolvePosTerminal(req.query.terminal)).code;
    const rows = await PosHeldSale.find(filter).populate("cashier", "name role").sort({ updatedAt: -1 }).limit(100).lean();
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};

export const getHeldSale = async (req, res, next) => {
  try {
    await expireOld();
    const draft = await PosHeldSale.findById(req.params.id).populate("cashier", "name role");
    if (!draft || !canAccess(draft, req.user)) throw new DraftError("Held sale was not found", 404);
    if (!["working", "held"].includes(draft.status)) throw new DraftError(`This sale is ${draft.status}`, 409);
    res.json({ success: true, data: serialize(draft) });
  } catch (error) { next(error); }
};

export const createHeldSale = async (req, res, next) => {
  try {
    const data = await normalizePayload(req.body, req.user);
    const terminal = await resolvePosTerminal(req.body.terminal);
    const expiresAt = new Date(Date.now() + data.expiryHours * 60 * 60_000);
    const draft = await PosHeldSale.create({ ...data, cashier: req.user._id, terminal: terminal.code, terminalRef: terminal._id, terminalSnapshot: terminalSnapshot(terminal), status: req.body.hold === true ? "held" : "working", expiresAt });
    if (draft.status === "held") await recordAuditLog({ actor: req.user, action: "POS_SALE_HELD", entityType: "PosHeldSale", entityId: draft._id, entityLabel: draft.label || "Held sale", after: { itemCount: draft.items.length, total: data.total } });
    res.status(201).json({ success: true, data: serialize(draft, data) });
  } catch (error) { next(error); }
};

export const updateHeldSale = async (req, res, next) => {
  try {
    const revision = Number(req.body.revision);
    if (!Number.isInteger(revision) || revision < 0) throw new DraftError("Held sale revision is required");
    const existing = await PosHeldSale.findById(req.params.id);
    if (!existing || !canAccess(existing, req.user)) throw new DraftError("Held sale was not found", 404);
    if (!["working", "held"].includes(existing.status)) throw new DraftError(`This sale is ${existing.status}`, 409);
    const terminal = await resolvePosTerminal(req.body.terminal || existing.terminal);
    if (terminal.code !== existing.terminal) throw new DraftError("Held sale cannot move between terminals", 409);
    const data = await normalizePayload(req.body, req.user);
    const nextStatus = req.body.hold === true ? "held" : req.body.resume === true ? "working" : existing.status;
    const updated = await PosHeldSale.findOneAndUpdate(
      { _id: existing._id, revision, status: existing.status },
      { $set: { ...data, status: nextStatus, expiresAt: new Date(Date.now() + data.expiryHours * 60 * 60_000) }, $inc: { revision: 1 } },
      { new: true, runValidators: true }
    );
    if (!updated) throw new DraftError("This sale changed on another device. Reload it before continuing.", 409);
    if (nextStatus === "held" && existing.status !== "held") await recordAuditLog({ actor: req.user, action: "POS_SALE_HELD", entityType: "PosHeldSale", entityId: updated._id, entityLabel: updated.label || "Held sale", after: { itemCount: updated.items.length, total: data.total } });
    if (nextStatus === "working" && existing.status === "held") await recordAuditLog({ actor: req.user, action: "POS_SALE_RESUMED", entityType: "PosHeldSale", entityId: updated._id, entityLabel: updated.label || "Held sale" });
    res.json({ success: true, data: serialize(updated, data) });
  } catch (error) { next(error); }
};

export const cancelHeldSale = async (req, res, next) => {
  try {
    const draft = await PosHeldSale.findById(req.params.id);
    if (!draft || !canAccess(draft, req.user)) throw new DraftError("Held sale was not found", 404);
    if (!["working", "held"].includes(draft.status)) throw new DraftError(`This sale is ${draft.status}`, 409);
    draft.status = "cancelled"; draft.cancelledAt = new Date(); draft.revision += 1; await draft.save();
    await recordAuditLog({ actor: req.user, action: "POS_HELD_SALE_CANCELLED", entityType: "PosHeldSale", entityId: draft._id, entityLabel: draft.label || "Held sale", reason: clean(req.body.reason, 160) || "Cancelled from POS" });
    res.json({ success: true, data: draft });
  } catch (error) { next(error); }
};
