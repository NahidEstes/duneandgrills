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

const nonRevenueStatuses = ["cancelled", "refunded", "failed"];
const reversalStatuses = new Set(nonRevenueStatuses);

// @desc    Get server-authoritative order types and delivery pricing
// @route   GET /api/orders/config
// @access  Private
export const getOrderConfig = (req, res) =>
  res.status(200).json({ success: true, data: getPublicOrderConfig() });

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
    const coupon = couponCode
      ? await calculateCoupon({ code: couponCode, lines: catalogLines })
      : null;
    const discountAmount = coupon?.discountAmount || 0;
    const discountedSubtotal = Number((subtotal - discountAmount).toFixed(2));
    const deliveryFee = getDeliveryFee(orderType);
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
    const { status, source, orderType, paymentMethod } = req.query;
    const filter = {};
    if (status && status !== "all") filter.status = status;
    if (source && SALES_SOURCES.includes(source)) {
      if (source === "website") filter.$or = [{ source: "website" }, { source: { $exists: false } }];
      else filter.source = source;
    }
    if (orderType && ["dine-in", "pickup", "takeaway", "delivery"].includes(orderType)) filter.orderType = orderType;
    if (paymentMethod && PAYMENT_METHODS.includes(paymentMethod)) filter.paymentMethod = paymentMethod;

    const orders = await Order.find(filter).populate("createdBy", "name role").sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (err) {
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch orders",
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

    const filter = {};
    if (req.query.source && SALES_SOURCES.includes(req.query.source)) {
      if (req.query.source === "website") filter.$or = [{ source: "website" }, { source: { $exists: false } }];
      else filter.source = req.query.source;
    }
    if (req.query.orderType && ["dine-in", "pickup", "takeaway", "delivery"].includes(req.query.orderType)) filter.orderType = req.query.orderType;
    if (req.query.paymentMethod && PAYMENT_METHODS.includes(req.query.paymentMethod)) filter.paymentMethod = req.query.paymentMethod;
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
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch stats",
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

// @desc    Update order status
// @route   PATCH /api/orders/:id/status
// @access  Admin
export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    order.status = status;
    await order.validate();

    if (reversalStatuses.has(status) && order.inventoryStatus === "deducted" && order.inventoryTransactions?.length) {
      await runInventoryTransaction(async (session) => {
        const restorations = await restoreOrderInventory({
          transactionIds: order.inventoryTransactions,
          orderId: order._id,
          orderNumber: order.orderNumber,
          actorId: req.user._id,
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
      const points = calculateOrderPoints(
        order.eligiblePointsAmount ?? order.totalAmount
      );
      const credited = await creditOrderPoints({
        userId: order.user,
        orderId: order._id,
        orderNumber: order.orderNumber,
        points,
      });
      if (credited || !order.pointsAwardedAt) {
        order.pointsEarned = points;
        order.pointsAwardedAt = order.pointsAwardedAt || new Date();
        order.pointsReversedAt = null;
      }
    }

    if (reversalStatuses.has(status) && order.user) {
      const reversed = await reverseOrderPoints({
        userId: order.user,
        orderId: order._id,
        orderNumber: order.orderNumber,
      });
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

    await order.save();
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Failed to update order",
      error: err.message,
    });
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
