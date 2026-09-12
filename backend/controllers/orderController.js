import mongoose from "mongoose";
import Order from "../models/Order.js";
import Counter from "../models/Counter.js";
import MenuItem from "../models/MenuItem.js";
import User from "../models/User.js";
import {
  PRODUCT_TYPES,
  calculateCartSubtotal,
  cartLineToOrderItem,
  resolveCartLines,
} from "../services/catalogService.js";
import { calculateOrderPoints } from "../config/rewards.js";
import {
  DEFAULT_ORDER_TYPE,
  getDeliveryFee,
  getPublicOrderConfig,
  isValidOrderType,
} from "../config/orders.js";
import {
  applyRedemptionToOrder,
  creditOrderPoints,
  releaseExpiredRedemptions,
  reopenRedemption,
  restoreRedemption,
  reverseOrderPoints,
} from "../services/rewardService.js";
import {
  calculateCoupon,
  releaseCouponUsage,
  reserveCouponUsage,
} from "../services/couponService.js";
import { deductOrderInventory, restoreOrderInventory } from "../services/orderInventoryService.js";
import { runInventoryTransaction } from "../services/inventoryStockService.js";
import { PAYMENT_METHODS, SALES_SOURCES } from "../config/sales.js";
import { pickAuditFields, recordAuditLog } from "../services/auditLogService.js";
import { ADMIN_DAY_MS, parseRiyadhDate } from "../utils/adminDate.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { getEffectiveRestaurantSettings } from "../services/restaurantSettingsService.js";

const nonRevenueStatuses = ["cancelled", "refunded", "failed"];
const reversalStatuses = new Set(nonRevenueStatuses);
const ORDER_STATUSES = new Set(["pending", "confirmed", "preparing", "ready", "out-for-delivery", "delivered", "cancelled", "refunded", "failed"]);
const OPEN_ORDER_STATUSES = new Set(["pending", "confirmed", "preparing", "out-for-delivery"]);

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const addDateFilter = (filter, query) => {
  if (!query.from && !query.to) return;
  filter.createdAt = {};
  if (query.from) {
    filter.createdAt.$gte = parseRiyadhDate(query.from, "From date");
  }
  if (query.to) {
    filter.createdAt.$lt = new Date(parseRiyadhDate(query.to, "To date").getTime() + ADMIN_DAY_MS);
  }
  if (filter.createdAt.$gte && filter.createdAt.$lt && filter.createdAt.$gte >= filter.createdAt.$lt) {
    throw new ValidationError("From date must be before or equal to To date");
  }
};

const buildOrderFilter = (query, { includeStatus = true } = {}) => {
  const filter = {};
  if (includeStatus && query.status && query.status !== "all") filter.status = query.status;
  if (query.source && SALES_SOURCES.includes(query.source)) {
    if (query.source === "website") filter.$or = [{ source: "website" }, { source: { $exists: false } }];
    else filter.source = query.source;
  }
  if (query.orderType && ["dine-in", "pickup", "takeaway", "delivery"].includes(query.orderType)) filter.orderType = query.orderType;
  if (query.paymentMethod && PAYMENT_METHODS.includes(query.paymentMethod)) filter.paymentMethod = query.paymentMethod;
  addDateFilter(filter, query);
  if (query.search?.trim()) {
    const value = new RegExp(escapeRegex(query.search.trim()), "i");
    const searchFilter = [{ orderNumber: value }, { "customer.name": value }, { "customer.phone": value }, { "customer.email": value }];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchFilter }];
      delete filter.$or;
    } else filter.$or = searchFilter;
  }
  return filter;
};

const serializeAdminOrder = (order) => {
  const value = typeof order.toObject === "function" ? order.toObject() : order;
  return {
    ...value,
    isOverdue: Boolean(value.preparationDueAt && OPEN_ORDER_STATUSES.has(value.status) && new Date(value.preparationDueAt) < new Date()),
  };
};

// @desc    Get server-authoritative order types and delivery pricing
// @route   GET /api/orders/config
// @access  Public
export const getOrderConfig = async (_req, res) => {
  try {
    const settings = await getEffectiveRestaurantSettings();
    res.status(200).json({ success: true, data: getPublicOrderConfig(settings.orders) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Order configuration is temporarily unavailable", error: error.message });
  }
};

// Generates a human-readable, date-based order number like 2026082301
// (YYYYMMDD + sequence number for that day)
// const generateOrderNumber = async () => {
//   const now = new Date();
//   const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
//     2,
//     "0"
//   )}${String(now.getDate()).padStart(2, "0")}`;

//   const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
//   const endOfDay = new Date(startOfDay);
//   endOfDay.setDate(endOfDay.getDate() + 1);

//   const countToday = await Order.countDocuments({
//     createdAt: { $gte: startOfDay, $lt: endOfDay },
//   });

//   const sequence = String(countToday + 1).padStart(2, "0");
//   return `${datePart}${sequence}`;
// };
// Atomically increments today's counter and returns a unique, sequential
// order number like "20260823001". Using findOneAndUpdate with $inc means
// MongoDB guarantees each caller gets a different number, even if many
// orders are placed at the exact same moment.
const generateOrderNumber = async () => {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}${String(now.getDate()).padStart(2, "0")}`;

  const counter = await Counter.findOneAndUpdate(
    { _id: datePart },
    { $inc: { seq: 1 } },
    { new: true, upsert: true } // upsert: create the counter if today's doesn't exist yet
  );

  const sequence = String(counter.seq).padStart(3, "0"); // 001–999 per day
  return `${datePart}${sequence}`;
};

// @desc    Create a new order
// @route   POST /api/orders
// @access  Public
export const createOrder = async (req, res) => {
  let appliedRedemption = null;
  let reservedCouponId = null;
  let orderId = null;
  try {
    const restaurantSettings = await getEffectiveRestaurantSettings();
    if (!restaurantSettings.orders.channels.website) {
      return res.status(503).json({ success: false, message: "Online ordering is currently unavailable. Please contact the restaurant." });
    }
    const {
      customer,
      items = [],
      notes,
      rewardRedemptionId,
      couponCode,
      orderType = DEFAULT_ORDER_TYPE,
    } = req.body;

    if (!isValidOrderType(orderType)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid order type",
      });
    }

    const customerName =
      typeof customer?.name === "string" ? customer.name.trim() : "";
    const customerPhone =
      typeof customer?.phone === "string" ? customer.phone.trim() : "";
    const customerAddress =
      typeof customer?.address === "string" ? customer.address.trim() : "";

    if (!customerName || !customerPhone) {
      return res.status(400).json({
        success: false,
        message: "Customer name and phone are required",
      });
    }
    if (orderType === "delivery" && !customerAddress) {
      return res.status(400).json({
        success: false,
        message: "A delivery address is required for delivery orders",
      });
    }
    if (!Array.isArray(items) || (!items.length && !rewardRedemptionId)) {
      return res.status(400).json({
        success: false,
        message: "Order must contain at least one item",
      });
    }

    const catalogLines = items.length ? await resolveCartLines(items) : [];
    const inventoryCatalogLines = [...catalogLines];
    const verifiedItems = catalogLines.map(cartLineToOrderItem);
    const subtotal = calculateCartSubtotal(catalogLines);
    if (
      orderType === "delivery" &&
      subtotal < restaurantSettings.orders.minimumDeliveryOrder
    ) {
      return res.status(400).json({
        success: false,
        message: `Minimum delivery order is SAR ${restaurantSettings.orders.minimumDeliveryOrder.toFixed(2)}`,
      });
    }
    const coupon = couponCode
      ? await calculateCoupon({ code: couponCode, lines: catalogLines })
      : null;
    const discountAmount = coupon?.discountAmount || 0;
    const discountedSubtotal = Number((subtotal - discountAmount).toFixed(2));
    const deliveryFee = getDeliveryFee(orderType, restaurantSettings.orders);
    const totalAmount = Number((discountedSubtotal + deliveryFee).toFixed(2));

    // const order = await Order.create({
    //   customer,
    //   items,
    //   totalAmount,
    //   notes,
    // });

    // const order = await Order.create({
    //   user: req.user ? req.user._id : null,
    //   customer,
    //   items,
    //   totalAmount,
    //   notes,
    // });
    orderId = new mongoose.Types.ObjectId();
    let rewardSnapshot = undefined;
    if (rewardRedemptionId) {
      if (!mongoose.isValidObjectId(rewardRedemptionId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid reward redemption",
        });
      }
      await releaseExpiredRedemptions(req.user._id);
      const rewardUser = await User.findById(req.user._id)
        .select("rewardRedemptions")
        .lean();
      const redemption = rewardUser?.rewardRedemptions?.find(
        (entry) => entry._id.toString() === rewardRedemptionId
      );
      if (
        !redemption ||
        redemption.status !== "reserved" ||
        new Date(redemption.expiresAt) <= new Date()
      ) {
        return res.status(409).json({
          success: false,
          message: "This reward reservation is no longer valid",
        });
      }
      const rewardMenuItem = await MenuItem.findOne({
        _id: redemption.menuItem,
        isAvailable: true,
      }).lean();
      if (!rewardMenuItem) {
        return res.status(409).json({
          success: false,
          message: "The redeemed menu item is no longer available",
        });
      }

      const applied = await applyRedemptionToOrder({
        userId: req.user._id,
        redemptionId: redemption._id,
        orderId,
      });
      if (!applied) {
        return res.status(409).json({
          success: false,
          message: "This reward has already been used or expired",
        });
      }
      appliedRedemption = redemption;
      verifiedItems.push({
        productType: PRODUCT_TYPES.MENU_ITEM,
        menuItem: rewardMenuItem._id,
        name: `${redemption.title} (Reward)`,
        image: rewardMenuItem.image,
        price: 0,
        quantity: 1,
        isReward: true,
        reward: redemption.reward,
        redemptionId: redemption._id,
      });
      rewardSnapshot = {
        redemptionId: redemption._id,
        reward: redemption.reward,
        menuItem: rewardMenuItem._id,
        title: redemption.title,
        pointsSpent: redemption.pointsSpent,
      };
      inventoryCatalogLines.push({
        productType: PRODUCT_TYPES.MENU_ITEM,
        productId: rewardMenuItem._id,
        product: rewardMenuItem,
        quantity: 1,
        unitPrice: 0,
      });
    }

    const orderNumber = await generateOrderNumber();
    if (coupon) {
      await reserveCouponUsage(coupon.offer._id);
      reservedCouponId = coupon.offer._id;
    }
    const order = await runInventoryTransaction(async (session) => {
      const [created] = await Order.create([{
        _id: orderId,
        orderNumber,
        source: "website",
        user: req.user ? req.user._id : null,
        customer: {
          ...customer,
          name: customerName,
          phone: customerPhone,
          address: orderType === "delivery" ? customerAddress : "",
        },
        items: verifiedItems,
        orderType,
        subtotal,
        originalSubtotal: subtotal,
        discountAmount,
        couponCode: coupon?.code || "",
        offer: coupon?.offer._id || null,
        couponSnapshot: coupon
          ? {
              title: coupon.offer.title,
              discountType: coupon.offer.discountType,
              discountValue: coupon.offer.discountValue,
            }
          : undefined,
        deliveryFee,
        totalAmount,
        eligiblePointsAmount: discountedSubtotal,
        rewardRedemption: rewardSnapshot,
        notes,
        estimatedPreparationMinutes: restaurantSettings.preparation.defaultMinutes,
        inventoryStatus: "pending",
      }], session ? { session } : {});
      const transactions = await deductOrderInventory({
        catalogLines: inventoryCatalogLines,
        orderId,
        orderNumber,
        source: "website",
        actorId: req.user._id,
        strictRecipes: false,
        session,
      });
      created.inventoryTransactions = transactions.map((transaction) => transaction._id);
      created.inventoryStatus = transactions.length ? "deducted" : "not_required";
      created.inventoryDeductedAt = transactions.length ? new Date() : null;
      await created.save(session ? { session } : {});
      return created;
    });
    reservedCouponId = null;

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    if (orderId) await Order.deleteOne({ _id: orderId }).catch(() => undefined);
    if (appliedRedemption && orderId) {
      await reopenRedemption({
        userId: req.user._id,
        redemptionId: appliedRedemption._id,
        orderId,
      }).catch(() => undefined);
    }
    if (reservedCouponId) {
      await releaseCouponUsage(reservedCouponId).catch(() => undefined);
    }
    res.status(err.status || 400).json({
      success: false,
      message: err.status ? err.message : "Failed to create order",
      error: err.message,
    });
  }
};

// @desc    Get all orders
// @route   GET /api/orders
// @access  Admin
// export const getOrders = async (req, res) => {
//   try {
//     const orders = await Order.find().sort({ createdAt: -1 });
//     res.status(200).json({ success: true, count: orders.length, data: orders });
//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch orders",
//       error: err.message,
//     });
//   }
// };

// @desc    Get all orders (optionally filter by status)
// @route   GET /api/orders?status=pending
// @access  Admin/Manager
export const getOrders = async (req, res) => {
  try {
    const filter = buildOrderFilter(req.query);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || (req.query.page ? 20 : 100)));
    const [orders, total] = await Promise.all([
      Order.find(filter).populate("createdBy", "name role").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);
    res.status(200).json({
      success: true,
      count: total,
      data: orders.map(serializeAdminOrder),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        success: false,
        message: err.status ? err.message : "Failed to fetch orders",
        error: err.message,
      });
  }
};

// @desc    Revenue & order stats for the dashboard
// @route   GET /api/orders/stats
// @access  Admin/Manager
export const getOrderStats = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const filter = buildOrderFilter(req.query, { includeStatus: false });
    const allOrders = await Order.find(filter);

    const totalRevenue = allOrders
      .filter((o) => !nonRevenueStatuses.includes(o.status))
      .reduce((sum, o) => sum + o.totalAmount, 0);

    const todayOrders = allOrders.filter((o) => o.createdAt >= startOfToday);
    const todayRevenue = todayOrders
      .filter((o) => !nonRevenueStatuses.includes(o.status))
      .reduce((sum, o) => sum + o.totalAmount, 0);

    const statusCounts = allOrders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        totalOrders: allOrders.length,
        totalRevenue,
        todayOrders: todayOrders.length,
        todayRevenue,
        statusCounts,
      },
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        success: false,
        message: err.status ? err.message : "Failed to fetch stats",
        error: err.message,
      });
  }
};

// @desc    Get a single order
// @route   GET /api/orders/:id
// @access  Public (customer order tracking)
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch order",
      error: err.message,
    });
  }
};

const applyOrderStatusUpdate = async ({ order, status, reason = "", estimatedPreparationMinutes, actor }) => {
  if (!ORDER_STATUSES.has(status)) throw new Error("Invalid order status");
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  if (status === "cancelled" && !normalizedReason) throw new Error("Cancellation reason is required");
  if (status === "refunded" && !normalizedReason) throw new Error("Refund reason is required");
  let prepMinutes = estimatedPreparationMinutes;
  if (prepMinutes !== undefined && prepMinutes !== null && prepMinutes !== "") {
    prepMinutes = Number(prepMinutes);
    if (!Number.isInteger(prepMinutes) || prepMinutes < 1 || prepMinutes > 240) {
      throw new Error("Estimated preparation time must be between 1 and 240 minutes");
    }
  } else prepMinutes = null;

  const auditFields = ["status", "paymentStatus", "inventoryStatus", "cancellationReason", "refundReason", "estimatedPreparationMinutes", "preparationDueAt", "acceptedAt", "preparationStartedAt", "readyAt"];
  const before = pickAuditFields(order, auditFields);
  order.status = status;
  if (status === "cancelled") order.cancellationReason = normalizedReason;
  if (status === "refunded") order.refundReason = normalizedReason;
  if (prepMinutes && (Number(order.estimatedPreparationMinutes) !== prepMinutes || !order.preparationDueAt)) {
    order.estimatedPreparationMinutes = prepMinutes;
    order.preparationDueAt = new Date(Date.now() + prepMinutes * 60 * 1000);
  }
  const statusChangedAt = new Date();
  if (status === "confirmed" && !order.acceptedAt) order.acceptedAt = statusChangedAt;
  if (status === "preparing" && !order.preparationStartedAt) order.preparationStartedAt = statusChangedAt;
  if (status === "ready" && !order.readyAt) order.readyAt = statusChangedAt;
  await order.validate();

  if (reversalStatuses.has(status) && order.inventoryStatus === "deducted" && order.inventoryTransactions?.length) {
    await runInventoryTransaction(async (session) => {
      const restorations = await restoreOrderInventory({
        transactionIds: order.inventoryTransactions,
        orderId: order._id,
        orderNumber: order.orderNumber,
        actorId: actor._id,
        status,
        session,
      });
      order.inventoryRestorationTransactions = restorations.map((transaction) => transaction._id);
      order.inventoryStatus = "restored";
      order.inventoryRestoredAt = new Date();
      await order.save(session ? { session } : {});
    });
  }
  if (order.source === "pos") {
    if (["cancelled", "refunded"].includes(status)) order.paymentStatus = "refunded";
    else if (status === "failed") order.paymentStatus = "failed";
    else if (status === "delivered") order.paymentStatus = "paid";
  }

  if (status === "delivered" && order.user) {
    const points = calculateOrderPoints(order.eligiblePointsAmount ?? order.totalAmount);
    const credited = await creditOrderPoints({ userId: order.user, orderId: order._id, orderNumber: order.orderNumber, points });
    if (credited || !order.pointsAwardedAt) {
      order.pointsEarned = points;
      order.pointsAwardedAt = order.pointsAwardedAt || new Date();
      order.pointsReversedAt = null;
    }
  }

  if (reversalStatuses.has(status) && order.user) {
    const reversed = await reverseOrderPoints({ userId: order.user, orderId: order._id, orderNumber: order.orderNumber });
    if (reversed) order.pointsReversedAt = order.pointsReversedAt || new Date();
    if (order.rewardRedemption?.redemptionId) {
      await restoreRedemption({
        userId: order.user,
        redemptionId: order.rewardRedemption.redemptionId,
        expectedStatuses: ["applied"],
        status: "restored",
        description: `${order.rewardRedemption.title} returned after Order #${order.orderNumber} was ${status}`,
      });
    }
  }

  order.statusHistory.push({ status, reason: normalizedReason, changedBy: actor._id, changedAt: statusChangedAt });
  await order.save();
  await recordAuditLog({
    actor,
    action: "ORDER_STATUS_CHANGED",
    entityType: "Order",
    entityId: order._id,
    entityLabel: `Order #${order.orderNumber}`,
    before,
    after: pickAuditFields(order, auditFields),
    metadata: { reason: normalizedReason },
  });
  return order;
};

// @desc    Update order status, reason and preparation estimate
// @route   PATCH /api/orders/:id/status
// @access  Admin/Manager
export const updateOrderStatus = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    const updated = await applyOrderStatusUpdate({
      order,
      status: req.body.status,
      reason: req.body.reason,
      estimatedPreparationMinutes: req.body.estimatedPreparationMinutes,
      actor: req.user,
    });
    res.status(200).json({ success: true, data: serializeAdminOrder(updated) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Failed to update order" });
  }
};

export const bulkUpdateOrderStatus = async (req, res) => {
  try {
    const ids = [...new Set(Array.isArray(req.body.orderIds) ? req.body.orderIds.map(String) : [])];
    if (!ids.length || ids.length > 100 || ids.some((id) => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({ success: false, message: "Choose between 1 and 100 valid orders" });
    }
    if (!ORDER_STATUSES.has(req.body.status)) {
      return res.status(400).json({ success: false, message: "Invalid order status" });
    }
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    if (["cancelled", "refunded"].includes(req.body.status)) {
      // Kept inline here so no order is changed before a required bulk reason is validated.
      if (!reason) return res.status(400).json({ success: false, message: `${req.body.status === "cancelled" ? "Cancellation" : "Refund"} reason is required` });
    }
    if (req.body.estimatedPreparationMinutes !== undefined && req.body.estimatedPreparationMinutes !== null && req.body.estimatedPreparationMinutes !== "") {
      const minutes = Number(req.body.estimatedPreparationMinutes);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
        return res.status(400).json({ success: false, message: "Estimated preparation time must be between 1 and 240 minutes" });
      }
    }
    const orders = await Order.find({ _id: { $in: ids } }).sort({ createdAt: 1 });
    if (orders.length !== ids.length) return res.status(404).json({ success: false, message: "One or more orders were not found" });
    const updated = [];
    for (const order of orders) {
      updated.push(await applyOrderStatusUpdate({
        order,
        status: req.body.status,
        reason: req.body.reason,
        estimatedPreparationMinutes: req.body.estimatedPreparationMinutes,
        actor: req.user,
      }));
    }
    res.json({ success: true, count: updated.length, data: updated.map(serializeAdminOrder) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Failed to update orders" });
  }
};

// @desc    Get logged-in user's own orders
// @route   GET /api/orders/my
// @access  Private (customer)
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("items.menuItem", "name image price isAvailable")
      .populate("items.combo", "name image comboPrice isAvailable status");
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch your orders",
      error: err.message,
    });
  }
};
