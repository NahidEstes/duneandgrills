import mongoose from "mongoose";
import Order from "../models/Order.js";
import User from "../models/User.js";
import { getEffectiveRestaurantSettings } from "../services/restaurantSettingsService.js";
import { isPaymentMethod, isPosOrderType } from "../config/sales.js";
import { calculateCartSubtotal, cartLineToOrderItem, resolveCartLines } from "../services/catalogService.js";
import { deductOrderInventory } from "../services/orderInventoryService.js";
import { runInventoryTransaction } from "../services/inventoryStockService.js";
import { creditPosSaleRewards } from "../services/refundRestorationService.js";
import { nextOrderNumber } from "../services/orderNumberService.js";
import { findOpenShift, recordPosCashSale } from "../services/posShiftService.js";
import PosHeldSale from "../models/PosHeldSale.js";
import { consumePosDiscountApproval, resolvePosDiscount } from "../services/posDiscountService.js";
import { recordAuditLog } from "../services/auditLogService.js";
import PosTerminal from "../models/PosTerminal.js";
import { resolvePosTerminal, terminalSnapshot } from "../services/posTerminalService.js";
import { hasCapability, CAPABILITIES } from "../config/permissions.js";
import { parsePagination, ValidationError } from "../utils/inventoryValidation.js";

class PosValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const cleanText = (value, maxLength) => typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const buildCustomer = async (customerId, walkIn = {}) => {
  if (customerId) {
    if (!mongoose.isValidObjectId(customerId)) throw new PosValidationError("Selected customer is invalid");
    const customer = await User.findOne({ _id: customerId, role: "customer" }).select("name phone email address").lean();
    if (!customer) throw new PosValidationError("Selected customer was not found", 404);
    return {
      userId: customer._id,
      snapshot: { name: customer.name, phone: customer.phone || "Not provided", email: customer.email, address: customer.address || "" },
    };
  }
  return {
    userId: null,
    snapshot: {
      name: cleanText(walkIn.name, 100) || "Walk-in Customer",
      phone: cleanText(walkIn.phone, 30) || "Not provided",
      email: cleanText(walkIn.email, 160),
      address: "",
    },
  };
};

const populateSale = (query) => query
  .populate("user", "name phone email pointsBalance")
  .populate("createdBy", "name role")
  .populate("items.menuItem", "name image")
  .populate("items.combo", "name image");

export const createPosSale = async (req, res, next) => {
  let createdOrderId = null;
  let saleCommitted = false;
  try {
    const idempotencyKey = cleanText(req.body.idempotencyKey, 100);
    if (!idempotencyKey) throw new PosValidationError("Sale request identifier is required");
    const previous = await Order.findOne({ idempotencyKey });
    if (previous) {
      if (previous.source !== "pos" || String(previous.createdBy) !== String(req.user._id)) throw new PosValidationError("Sale identifier belongs to another cashier", 403);
      const populated = await populateSale(Order.findById(previous._id));
      return res.status(200).json({ success: true, data: populated, duplicate: true });
    }

    const restaurantSettings = await getEffectiveRestaurantSettings();
    if (!restaurantSettings.orders.channels.pos) {
      throw new PosValidationError("POS ordering is currently disabled in Restaurant Settings", 503);
    }
    const shiftConfig = restaurantSettings.posShifts || { enabled: false, requireOpenShift: false };
    const selectedTerminal = await resolvePosTerminal(req.body.terminal);
    const terminal = selectedTerminal.code;
    const openShift = shiftConfig.enabled ? await findOpenShift({ cashier: req.user._id, terminal }) : null;
    if (shiftConfig.enabled && shiftConfig.requireOpenShift && !openShift) {
      throw new PosValidationError(`Open a POS shift on ${terminal} before completing a sale`, 409);
    }

    const orderType = req.body.orderType;
    const paymentMethod = req.body.paymentMethod;
    if (!isPosOrderType(orderType)) throw new PosValidationError("POS order type must be dine-in or takeaway");
    if (!isPaymentMethod(paymentMethod)) throw new PosValidationError("Payment method must be cash, card or other");
    const catalogLines = await resolveCartLines(req.body.items);
    const subtotal = calculateCartSubtotal(catalogLines);
    const discount = resolvePosDiscount({
      subtotal,
      discount: req.body.discount || { type: "fixed", value: req.body.discountAmount || 0, reason: req.body.discountReason },
      settings: restaurantSettings.posCheckout,
      role: req.user.role,
    });
    const roundedDiscount = discount.amount;
    const totalAmount = Number((subtotal - roundedDiscount).toFixed(2));
    const cashReceived = paymentMethod === "cash" ? Number(req.body.cashReceived) : 0;
    if (paymentMethod === "cash" && (!Number.isFinite(cashReceived) || cashReceived < totalAmount)) {
      throw new PosValidationError("Cash received must cover the final total");
    }
    const changeDue = paymentMethod === "cash" ? Number((cashReceived - totalAmount).toFixed(2)) : 0;
    const customer = await buildCustomer(req.body.customerId, req.body.customer);
    if (orderType === "takeaway") {
      const suppliedName = customer.userId || cleanText(req.body.customer?.name, 100);
      const suppliedPhone = customer.userId || cleanText(req.body.customer?.phone, 30);
      if (restaurantSettings.posCheckout.takeawayNameRequired && !suppliedName) throw new PosValidationError("Pickup name is required for takeaway sales");
      if (restaurantSettings.posCheckout.takeawayPhoneRequired && !suppliedPhone) throw new PosValidationError("Phone number is required for takeaway sales");
      if (suppliedPhone && !customer.userId && !/^[+\d][\d\s()-]{5,29}$/.test(suppliedPhone)) throw new PosValidationError("Enter a valid takeaway phone number");
    }
    const orderId = new mongoose.Types.ObjectId();
    createdOrderId = orderId;
    const orderNumber = await nextOrderNumber();
    const pickupToken = orderType === "takeaway" && restaurantSettings.posCheckout.pickupTokenEnabled
      ? `P${String(orderNumber).replace(/\D/g, "").slice(-5).padStart(5, "0")}`
      : "";
    const now = new Date();

    let order = await runInventoryTransaction(async (session) => {
      const activeTerminal = await PosTerminal.updateOne({ _id: selectedTerminal._id, isActive: true }, { $inc: { operationRevision: 1 } }, session ? { session } : {});
      if (!activeTerminal.matchedCount) throw new PosValidationError("Selected terminal is inactive", 409);
      let heldSale = null;
      if (req.body.heldSaleId) {
        if (!mongoose.isValidObjectId(req.body.heldSaleId)) throw new PosValidationError("Held sale reference is invalid");
        const access = ["manager", "admin"].includes(req.user.role) ? {} : { cashier: req.user._id };
        heldSale = await PosHeldSale.findOne({ _id: req.body.heldSaleId, ...access, status: { $in: ["working", "held"] }, revision: Number(req.body.heldSaleRevision) }).session(session || null);
        if (!heldSale) throw new PosValidationError("Held sale changed, expired or is no longer available", 409);
        if (heldSale.terminal !== terminal) throw new PosValidationError("Resume this sale on its original terminal", 409);
      }
      let approval = null;
      if (discount.approvalRequired) {
        approval = await consumePosDiscountApproval({ token: req.body.discountApprovalToken, cashierId: req.user._id, items: req.body.items, discount, orderId, session });
      }
      const [created] = await Order.create([{
        _id: orderId,
        orderNumber,
        idempotencyKey,
        source: "pos",
        terminal,
        terminalRef: selectedTerminal._id,
        terminalSnapshot: terminalSnapshot(selectedTerminal),
        createdBy: req.user._id,
        user: customer.userId,
        customer: customer.snapshot,
        items: catalogLines.map(cartLineToOrderItem),
        orderType,
        subtotal,
        originalSubtotal: subtotal,
        discountAmount: roundedDiscount,
        discountReason: roundedDiscount ? discount.reason : "",
        posDiscount: roundedDiscount ? { type: discount.type, value: discount.value, approvedBy: approval?.approver || (["manager", "admin"].includes(req.user.role) ? req.user._id : null), approvedAt: approval ? new Date() : null } : undefined,
        deliveryFee: 0,
        totalAmount,
        status: "pending",
        paymentMethod,
        paymentStatus: "paid",
        cashReceived: Number((cashReceived || 0).toFixed(2)),
        changeDue,
        pickupNote: orderType === "takeaway" ? cleanText(req.body.customer?.pickupNote, 240) : "",
        pickupToken,
        eligiblePointsAmount: totalAmount,
        notes: cleanText(req.body.notes, 500),
        estimatedPreparationMinutes: restaurantSettings.preparation.defaultMinutes,
        inventoryStatus: "pending",
        posShift: openShift?._id || null,
      }], session ? { session } : {});
      const transactions = await deductOrderInventory({ catalogLines, orderId, orderNumber, source: "pos", actorId: req.user._id, strictRecipes: true, session });
      created.inventoryTransactions = transactions.map((transaction) => transaction._id);
      created.inventoryStatus = transactions.length ? "deducted" : "not_required";
      created.inventoryDeductedAt = transactions.length ? now : null;
      await created.save(session ? { session } : {});
      if (openShift) {
        const transactionalShift = await findOpenShift({ cashier: req.user._id, terminal }, session);
        if (!transactionalShift && shiftConfig.requireOpenShift) throw new PosValidationError("The POS shift closed before this sale completed", 409);
        if (transactionalShift) await recordPosCashSale({ shift: transactionalShift, order: created, actor: req.user, session });
      }
      if (heldSale) {
        const consumed = await PosHeldSale.findOneAndUpdate(
          { _id: heldSale._id, revision: heldSale.revision, status: { $in: ["working", "held"] } },
          { $set: { status: "consumed", consumedOrder: created._id, consumedIdempotencyKey: idempotencyKey, consumedAt: now }, $inc: { revision: 1 } },
          { new: true, ...(session ? { session } : {}) }
        );
        if (!consumed) throw new PosValidationError("Held sale was updated before checkout completed", 409);
      }
      if (roundedDiscount) {
        await recordAuditLog({ actor: req.user, action: "POS_DISCOUNT_APPLIED", entityType: "Order", entityId: created._id, entityLabel: orderNumber, reason: discount.reason, related: { approver: created.posDiscount?.approvedBy || null }, after: { discountType: discount.type, discountValue: discount.value, discountAmount: roundedDiscount }, correlationId: req.correlationId }, { session });
      }
      return created;
    });
    saleCommitted = true;

    let rewardWarning = "";
    if (customer.userId && totalAmount > 0) {
      try {
        order = await creditPosSaleRewards(order._id);
      } catch (error) {
        rewardWarning = "Sale completed, but reward points could not be credited automatically.";
      }
    }
    const populated = await populateSale(Order.findById(order._id));
    return res.status(201).json({ success: true, data: populated, ...(rewardWarning ? { warning: rewardWarning } : {}) });
  } catch (error) {
    if (error?.code === 11000 && req.body.idempotencyKey) {
      const previous = await Order.findOne({ idempotencyKey: cleanText(req.body.idempotencyKey, 100) });
      if (previous) {
        if (previous.source !== "pos" || String(previous.createdBy) !== String(req.user._id)) return next(new PosValidationError("Sale identifier belongs to another cashier", 403));
        const populated = await populateSale(Order.findById(previous._id));
        return res.status(200).json({ success: true, data: populated, duplicate: true });
      }
    }
    // Transactions are not available on every MongoDB deployment. If the
    // inventory workflow failed in standalone fallback mode, remove the
    // incomplete order while the stock service rolls back its movements.
    if (createdOrderId && !saleCommitted) {
      await Order.deleteOne({ _id: createdOrderId }).catch(() => {});
    }
    next(error);
  }
};

export const listPosSales = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query, 10);
    const filter = { source: "pos" };
    const all = hasCapability(req.user.role, CAPABILITIES.POS_HISTORY_VIEW_ALL);
    if (!all) filter.createdBy = req.user._id;
    else if (req.query.cashier) {
      if (!mongoose.isValidObjectId(req.query.cashier)) throw new ValidationError("Invalid cashier");
      filter.createdBy = req.query.cashier;
    }
    if (req.query.orderType) filter.orderType = req.query.orderType;
    if (req.query.paymentMethod) filter.paymentMethod = req.query.paymentMethod;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.terminal) filter.terminal = String(req.query.terminal).trim().toUpperCase();
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      for (const [key, operator] of [["from", "$gte"], ["to", "$lte"]]) if (req.query[key]) {
        const value = new Date(`${req.query[key]}T${key === "from" ? "00:00:00" : "23:59:59.999"}+03:00`);
        if (Number.isNaN(value.getTime())) throw new ValidationError("Invalid history date");
        filter.createdAt[operator] = value;
      }
    }
    const search = cleanText(req.query.search, 100);
    if (search) {
      const expression = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ orderNumber: expression }, { "customer.name": expression }, { pickupToken: expression }];
    }
    const [sales, total] = await Promise.all([Order.find(filter).populate("createdBy", "name role").sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).select("-customer.phone -customer.email -customer.address").lean(), Order.countDocuments(filter)]);
    res.json({ success: true, count: sales.length, data: sales, pagination: { page, limit, total, pages: Math.ceil(total / limit) }, currency: "SAR" });
  } catch (error) { next(error); }
};
