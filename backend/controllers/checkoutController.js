import User from '../models/User.js';
import { getEffectiveRestaurantSettings } from '../services/restaurantSettingsService.js';
import { resolveCartLines, calculateCartSubtotal } from '../services/catalogService.js';
import { calculateCoupon } from '../services/couponService.js';
import { checkoutQuote, listCheckoutSlots } from '../services/checkoutService.js';
import { ensurePointsBalance } from '../services/rewardService.js';
import { OrderEngineError } from '../config/orderContract.js';
import { validateTableContext } from '../services/tableOrderingService.js';
export const getSlots = async (req, res, next) => {
  try {
    const settings = await getEffectiveRestaurantSettings();
    res.set('Cache-Control', 'no-store').json({ success: true, data: { enabled: settings.checkout.scheduling.enabled, timezone: 'Asia/Riyadh', slots: await listCheckoutSlots(settings, req.query.type || 'pickup') } });
  } catch (error) { next(error); }
};
export const quoteCheckout = async (req, res, next) => {
  try {
    const settings = await getEffectiveRestaurantSettings();
    if (!settings.orders.channels.website) throw new OrderEngineError('Online ordering is currently unavailable', 503);
    if (!['delivery', 'pickup', 'dine_in', 'dine-in'].includes(req.body.fulfillmentType)) throw new OrderEngineError('Invalid fulfillment type');
    await validateTableContext(req.body, ['dine_in', 'dine-in'].includes(req.body.fulfillmentType) ? 'dine-in' : req.body.fulfillmentType);
    const lines = await resolveCartLines(req.body.items || []);
    const subtotal = calculateCartSubtotal(lines);
    if (req.body.fulfillmentType === 'delivery' && subtotal < settings.orders.minimumDeliveryOrder) throw new OrderEngineError('Minimum delivery order has not been reached');
    const coupon = req.body.couponCode ? await calculateCoupon({ code: req.body.couponCode, lines, userId: req.user?._id }) : null;
    const quote = checkoutQuote(settings, req.body, subtotal, coupon?.discountAmount || 0);
    if (quote.redemption.points) {
      if (!req.user) throw new OrderEngineError('Sign in to redeem points', 401);
      await ensurePointsBalance(req.user._id);
      const user = await User.findById(req.user._id).select('pointsBalance').lean();
      if (!user || user.pointsBalance < quote.redemption.points) throw new OrderEngineError('Insufficient points. Review your points selection', 409);
    }
    if (quote.scheduledAt && !(await listCheckoutSlots(settings, req.body.fulfillmentType)).includes(quote.scheduledAt.toISOString())) throw new OrderEngineError('Scheduled slot is full. Select another time', 409);
    res.set('Cache-Control', 'private, no-store').json({ success: true, data: { subtotal, discount: coupon?.discountAmount || 0, pointsDiscount: quote.redemption.discount, fee: quote.delivery.fee, total: quote.total, deliveryMode: quote.delivery.mode } });
  } catch (error) { next(error); }
};
