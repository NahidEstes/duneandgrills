import mongoose from 'mongoose';
import User from '../models/User.js';
import OrderSlot from '../models/OrderSlot.js';
import { ensurePointsBalance } from './rewardService.js';
import { OrderEngineError } from '../config/orderContract.js';
import { normalizeDeliveryDetails, deliveryQuote, pointsQuote, scheduleQuote, availableSlotTimes } from './checkoutPolicy.js';

export const checkoutQuote = (settings, payload, subtotal, couponDiscount = 0) => {
  const deliveryDetails = normalizeDeliveryDetails(payload.customer?.deliveryDetails);
  const delivery = deliveryQuote(settings, payload.fulfillmentType || payload.orderType || 'delivery', deliveryDetails);
  const redemption = pointsQuote(settings.checkout?.points, payload.pointsToRedeem, Number((subtotal - couponDiscount).toFixed(2)), Boolean(payload.couponCode));
  const schedule = scheduleQuote(settings, payload.scheduledAt);
  const total = Number((subtotal - couponDiscount - redemption.discount + delivery.fee).toFixed(2));
  if (payload.reviewedTotal !== undefined && (typeof payload.reviewedTotal !== 'number' || !Number.isFinite(payload.reviewedTotal) || Math.round(payload.reviewedTotal * 100) !== Math.round(total * 100))) throw new OrderEngineError('Prices or delivery fees changed. Review your order again', 409);
  return { deliveryDetails, delivery, redemption, ...schedule, total };
};
export const slotKey = (type, date) => `${type}:${new Date(date).toISOString()}`;
export const ensureSlot = async key => {
  try { await OrderSlot.updateOne({ _id: key }, { $setOnInsert: { used: 0 } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
};
export const reserveCheckout = async ({ quote, userId, orderId, orderNumber, type, settings, session }) => {
  if (quote.scheduledAt) {
    // Recheck time after transaction retries; never accept an expired selection.
    scheduleQuote(settings, quote.scheduledAt.toISOString());
    const reserved = await OrderSlot.updateOne({ _id: slotKey(type, quote.scheduledAt), used: { $lt: settings.checkout.scheduling.capacity } }, { $inc: { used: 1 } }, { session });
    if (!reserved.modifiedCount) throw new OrderEngineError('Scheduled slot is full. Select another time', 409);
  }
  if (!quote.redemption.points) return;
  if (!userId) throw new OrderEngineError('Sign in to redeem points', 401);
  await ensurePointsBalance(userId, session);
  const points = quote.redemption.points;
  const updated = await User.findOneAndUpdate({ _id: userId, pointsBalance: { $gte: points }, 'pointTransactions.sourceKey': { $ne: `CHECKOUT_REDEEM:${orderId}` } }, [
    { $set: { pointsBalance: { $subtract: ['$pointsBalance', points] }, pointTransactions: { $concatArrays: [{ $ifNull: ['$pointTransactions', []] }, [{ _id: new mongoose.Types.ObjectId(), type: 'REDEEM', points: -points, order: orderId, description: `Points used on Order #${orderNumber}`, sourceKey: `CHECKOUT_REDEEM:${orderId}`, balanceAfter: { $subtract: ['$pointsBalance', points] }, createdAt: new Date() }]] } } },
  ], { new: true, session });
  if (!updated) throw new OrderEngineError('Insufficient points. Review your points selection', 409);
};
// Order is already claimed by the lifecycle transaction. Cumulative targets and
// unique ledger keys also make partial/full refund retries safe.
export const restoreCheckoutPoints = async (order, fraction, session) => {
  const spent = order.pointsRedemption?.points || 0;
  const target = Math.min(spent, Math.floor(spent * Math.min(1, fraction)));
  const delta = target - (order.pointsRedemption?.returnedPoints || 0);
  if (!order.user || delta <= 0) return;
  const key = `CHECKOUT_RETURN:${order._id}:${target}`;
  const updated = await User.findOneAndUpdate({ _id: order.user, 'pointTransactions.sourceKey': { $ne: key } }, [{ $set: {
    pointsBalance: { $add: [{ $ifNull: ['$pointsBalance', 0] }, { $max: [{ $subtract: [delta, { $ifNull: ['$pointsDebt', 0] }] }, 0] }] },
    pointsDebt: { $max: [{ $subtract: [{ $ifNull: ['$pointsDebt', 0] }, delta] }, 0] },
    pointTransactions: { $concatArrays: [{ $ifNull: ['$pointTransactions', []] }, [{ _id: new mongoose.Types.ObjectId(), type: 'REVERSAL', points: delta, order: order._id, description: `Points returned for Order #${order.orderNumber}`, sourceKey: key, createdAt: new Date(), balanceAfter: { $add: [{ $ifNull: ['$pointsBalance', 0] }, { $max: [{ $subtract: [delta, { $ifNull: ['$pointsDebt', 0] }] }, 0] }] } }]] },
  } }], { new: true, session });
  if (updated) order.pointsRedemption.returnedPoints = target;
};
export const releaseCheckoutSlot = async (order, session) => {
  if (!order.scheduledAt || order.slotReleasedAt) return;
  await OrderSlot.updateOne({ _id: slotKey(order.orderType, order.scheduledAt), used: { $gt: 0 } }, { $inc: { used: -1 } }, { session });
  order.slotReleasedAt = new Date();
};
export const listCheckoutSlots = async (settings, type) => {
  if (!['pickup', 'delivery'].includes(type)) throw new OrderEngineError('Invalid fulfillment type');
  const slots = availableSlotTimes(settings);
  const buckets = await OrderSlot.find({ _id: { $in: slots.map(date => slotKey(type, date)) } }).lean();
  const used = new Map(buckets.map(row => [row._id, row.used]));
  return slots.filter(date => (used.get(slotKey(type, date)) || 0) < settings.checkout.scheduling.capacity);
};
