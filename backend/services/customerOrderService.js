import crypto from "node:crypto";
import mongoose from "mongoose";
import MenuItem from "../models/MenuItem.js";
import User from "../models/User.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { getDeliveryFee } from "../config/orders.js";
import { OrderEngineError, orderText, resolveOrderInput } from "../config/orderContract.js";
import { calculateCartSubtotal, cartLineToOrderItem, resolveCartLines, PRODUCT_TYPES } from "./catalogService.js";
import { calculateCoupon, reserveCouponUsage } from "./couponService.js";
import { applyRedemptionToOrder, releaseExpiredRedemptions } from "./rewardService.js";
import { getEffectiveRestaurantSettings } from "./restaurantSettingsService.js";
import { nextOrderNumber } from "./orderNumberService.js";
import { runInventoryTransaction } from "./inventoryStockService.js";
import { creationIdentity, findCreationReplay, persistOrderWithInventory, trackingTokenForIdentity } from "./orderEngineService.js";

export const createCustomerOrder = async ({ payload, actor, channel = "customer", key, correlationId }) => {
  if (channel === "admin" && (!actor || !hasCapability(actor.role, CAPABILITIES.ORDERS_MANAGE))) throw new OrderEngineError("Not authorized to create admin orders", 403);
  const input = resolveOrderInput(payload, channel);
  if (payload.paymentOption !== undefined && payload.paymentOption !== "cod") throw new OrderEngineError("Online payment is not configured. Choose cash on delivery or pickup", 503);
  const identity = creationIdentity({ payload, key, channel, actor, orderType: input.orderType });
  const trackingToken = identity.idempotencyKey ? trackingTokenForIdentity(identity) : crypto.randomBytes(32).toString("base64url");
  const previous = await findCreationReplay(identity);
  if (previous) return { order: previous, duplicate: true, trackingToken };
  const settings = await getEffectiveRestaurantSettings();
  const source = channel === "admin" ? "phone" : "website";
  if (!settings.orders.channels[source]) throw new OrderEngineError(`${channel === "admin" ? "Phone" : "Online"} ordering is currently unavailable`, 503);
  const name = orderText(payload.customer?.name, "Customer name", 100);
  const phone = orderText(payload.customer?.phone, "Customer phone", 30);
  const address = orderText(payload.customer?.address, "Customer address", 500);
  const email = orderText(payload.customer?.email, "Customer email", 160);
  if (!name || !phone) throw new OrderEngineError("Customer name and phone are required");
  if (!/^[+\d][\d\s()-]{5,29}$/.test(phone)) throw new OrderEngineError("Enter a valid customer phone number");
  if (input.orderType === "delivery" && !address) throw new OrderEngineError("A delivery address is required for delivery orders");
  const items = payload.items ?? [];
  if (!Array.isArray(items) || (!items.length && !payload.rewardRedemptionId)) throw new OrderEngineError("Order must contain at least one item");
  const catalogLines = items.length ? await resolveCartLines(items) : [];
  const subtotal = calculateCartSubtotal(catalogLines);
  if (input.orderType === "delivery" && subtotal < settings.orders.minimumDeliveryOrder) throw new OrderEngineError(`Minimum delivery order is SAR ${settings.orders.minimumDeliveryOrder.toFixed(2)}`);
  const coupon = payload.couponCode ? await calculateCoupon({ code: payload.couponCode, lines: catalogLines, userId: channel === "customer" ? actor?._id : null }) : null;
  const discountAmount = coupon?.discountAmount || 0;
  const discountedSubtotal = Number((subtotal - discountAmount).toFixed(2));
  const deliveryFee = getDeliveryFee(input.orderType, settings.orders);
  const userId = channel === "customer" ? actor?._id || null : null;
  if (payload.rewardRedemptionId) {
    if (!userId) throw new OrderEngineError("Sign in as the customer to use a reward", 401);
    if (!mongoose.isValidObjectId(payload.rewardRedemptionId)) throw new OrderEngineError("Invalid reward redemption");
    await releaseExpiredRedemptions(userId);
  }
  const orderId = new mongoose.Types.ObjectId();
  const orderNumber = await nextOrderNumber();
  try {
    const order = await runInventoryTransaction(async session => {
      if (!session) throw new OrderEngineError("The unified order engine requires a MongoDB replica set", 503);
      // Build fresh arrays on transaction retry; never append reward lines twice.
      const inventoryLines = [...catalogLines];
      const orderItems = catalogLines.map(cartLineToOrderItem);
      let rewardSnapshot;
      if (payload.rewardRedemptionId) {
        const user = await User.findById(userId).select("rewardRedemptions").session(session).lean();
        const redemption = user?.rewardRedemptions?.find(row => String(row._id) === String(payload.rewardRedemptionId));
        if (!redemption || redemption.status !== "reserved" || new Date(redemption.expiresAt) <= new Date()) throw new OrderEngineError("This reward reservation is no longer valid", 409);
        const menuItem = await MenuItem.findOne({ _id: redemption.menuItem, isAvailable: true }).session(session).lean();
        if (!menuItem) throw new OrderEngineError("The redeemed menu item is no longer available", 409);
        if (!await applyRedemptionToOrder({ userId, redemptionId: redemption._id, orderId, session })) throw new OrderEngineError("This reward has already been used or expired", 409);
        orderItems.push({ productType: PRODUCT_TYPES.MENU_ITEM, menuItem: menuItem._id, name: `${redemption.title} (Reward)`, image: menuItem.image, price: 0, quantity: 1, isReward: true, reward: redemption.reward, redemptionId: redemption._id });
        inventoryLines.push({ productType: PRODUCT_TYPES.MENU_ITEM, productId: menuItem._id, product: menuItem, quantity: 1, unitPrice: 0 });
        rewardSnapshot = { redemptionId: redemption._id, reward: redemption.reward, menuItem: menuItem._id, title: redemption.title, pointsSpent: redemption.pointsSpent };
      }
      if (coupon) await reserveCouponUsage(coupon.offer._id, { session });
      return persistOrderWithInventory({ actor, session, catalogLines: inventoryLines, correlationId, fields: {
        _id: orderId, orderNumber,
        ...(identity.idempotencyKey ? { idempotencyKey: identity.idempotencyKey, creationRequestHash: identity.creationRequestHash } : {}),
        trackingTokenHash: crypto.createHash("sha256").update(trackingToken).digest("hex"),
        source, createdBy: channel === "admin" ? actor._id : null, user: userId,
        customer: { name, phone, email, address: input.orderType === "delivery" ? address : "" },
        ...input, items: orderItems, subtotal, originalSubtotal: subtotal, discountAmount, deliveryFee,
        totalAmount: Number((discountedSubtotal + deliveryFee).toFixed(2)),
        eligiblePointsAmount: discountedSubtotal, rewardRedemption: rewardSnapshot,
        paymentMethod: "cash",
        rewardAccrualPolicy: "completion", orderOrigin: channel === "admin" ? "phone" : "online",
        couponCode: coupon?.code || "", offer: coupon?.offer._id || null,
        couponSnapshot: coupon ? { title: coupon.offer.title, discountType: coupon.offer.discountType, discountValue: coupon.offer.discountValue } : undefined,
        estimatedPreparationMinutes: settings.preparation.defaultMinutes,
      } });
    });
    return { order, trackingToken, duplicate: false };
  } catch (error) {
    // A concurrent winner is committed before it can cause a duplicate-key error.
    // A reward/coupon write conflict can also retry into an already-used reservation.
    const replay = await findCreationReplay(identity);
    if (replay) return { order: replay, trackingToken, duplicate: true };
    throw error;
  }
};
