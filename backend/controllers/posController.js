import mongoose from "mongoose";
import Counter from "../models/Counter.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import { calculateOrderPoints } from "../config/rewards.js";
import { isPaymentMethod, isPosOrderType } from "../config/sales.js";
import { calculateCartSubtotal, cartLineToOrderItem, resolveCartLines } from "../services/catalogService.js";
import { deductOrderInventory } from "../services/orderInventoryService.js";
import { runInventoryTransaction } from "../services/inventoryStockService.js";
import { creditOrderPoints } from "../services/rewardService.js";

class PosValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const nextPosOrderNumber = async () => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const counter = await Counter.findOneAndUpdate({ _id: `pos-order-${date}` }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return `POS-${date}-${String(counter.seq).padStart(4, "0")}`;
};

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
      const populated = await populateSale(Order.findById(previous._id));
      return res.status(200).json({ success: true, data: populated, duplicate: true });
    }

    const orderType = req.body.orderType;
    const paymentMethod = req.body.paymentMethod;
    if (!isPosOrderType(orderType)) throw new PosValidationError("POS order type must be dine-in or takeaway");
    if (!isPaymentMethod(paymentMethod)) throw new PosValidationError("Payment method must be cash, card or other");
    const catalogLines = await resolveCartLines(req.body.items);
    const subtotal = calculateCartSubtotal(catalogLines);
    const discountAmount = Number(req.body.discountAmount || 0);
    if (!Number.isFinite(discountAmount) || discountAmount < 0 || discountAmount > subtotal) {
      throw new PosValidationError("Discount must be between zero and the sale subtotal");
    }
    const roundedDiscount = Number(discountAmount.toFixed(2));
    const totalAmount = Number((subtotal - roundedDiscount).toFixed(2));
    const cashReceived = paymentMethod === "cash" ? Number(req.body.cashReceived) : 0;
    if (paymentMethod === "cash" && (!Number.isFinite(cashReceived) || cashReceived < totalAmount)) {
      throw new PosValidationError("Cash received must cover the final total");
    }
    const changeDue = paymentMethod === "cash" ? Number((cashReceived - totalAmount).toFixed(2)) : 0;
    const customer = await buildCustomer(req.body.customerId, req.body.customer);
    const orderId = new mongoose.Types.ObjectId();
    createdOrderId = orderId;
    const orderNumber = await nextPosOrderNumber();
    const now = new Date();

    let order = await runInventoryTransaction(async (session) => {
      const [created] = await Order.create([{
        _id: orderId,
        orderNumber,
        idempotencyKey,
        source: "pos",
        createdBy: req.user._id,
        user: customer.userId,
        customer: customer.snapshot,
        items: catalogLines.map(cartLineToOrderItem),
        orderType,
        subtotal,
        originalSubtotal: subtotal,
        discountAmount: roundedDiscount,
        discountReason: roundedDiscount ? cleanText(req.body.discountReason, 160) || "POS discount" : "",
        deliveryFee: 0,
        totalAmount,
        status: "delivered",
        paymentMethod,
        paymentStatus: "paid",
        cashReceived: Number((cashReceived || 0).toFixed(2)),
        changeDue,
        eligiblePointsAmount: totalAmount,
        notes: cleanText(req.body.notes, 500),
        inventoryStatus: "pending",
      }], session ? { session } : {});
      const transactions = await deductOrderInventory({ catalogLines, orderId, orderNumber, source: "pos", actorId: req.user._id, strictRecipes: true, session });
      created.inventoryTransactions = transactions.map((transaction) => transaction._id);
      created.inventoryStatus = transactions.length ? "deducted" : "not_required";
      created.inventoryDeductedAt = transactions.length ? now : null;
      await created.save(session ? { session } : {});
      return created;
    });
    saleCommitted = true;

    let rewardWarning = "";
    if (customer.userId && totalAmount > 0) {
      try {
        const points = calculateOrderPoints(totalAmount);
        const credited = await creditOrderPoints({ userId: customer.userId, orderId: order._id, orderNumber, points });
        if (credited || points === 0) {
          order = await Order.findByIdAndUpdate(order._id, { pointsEarned: points, pointsAwardedAt: points ? new Date() : null }, { new: true });
        }
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
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const filter = { source: "pos" };
    if (req.query.orderType) filter.orderType = req.query.orderType;
    if (req.query.paymentMethod) filter.paymentMethod = req.query.paymentMethod;
    const sales = await populateSale(Order.find(filter).sort({ createdAt: -1 }).limit(limit));
    res.json({ success: true, count: sales.length, data: sales, currency: "SAR" });
  } catch (error) { next(error); }
};
