import Offer from "../models/Offer.js";
import {
  PRODUCT_TYPES,
  calculateCartSubtotal,
  productKey,
} from "./catalogService.js";

export class CouponValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "CouponValidationError";
    this.status = status;
  }
}

export const normalizeCouponCode = (value) =>
  typeof value === "string" ? value.trim().toUpperCase() : "";

const targetProductKey = (offer) => {
  const productId =
    offer.orderProductType === PRODUCT_TYPES.COMBO
      ? offer.combo
      : offer.menuItem;
  return productId
    ? productKey(offer.orderProductType, productId._id || productId)
    : "";
};

const lineIsEligible = (line, offer) => {
  if (offer.couponScope === "order") return true;

  if (offer.couponScope === "product") {
    return (
      productKey(line.productType, line.productId) === targetProductKey(offer)
    );
  }

  const category =
    line.productType === PRODUCT_TYPES.COMBO
      ? "Combos"
      : line.product.category;
  return (
    typeof category === "string" &&
    category.toLowerCase() === offer.applicableCategory.toLowerCase()
  );
};

const activeCouponFilter = (code, now = new Date()) => ({
  ...(code ? { promoCode: code } : {}),
  isActive: true,
  startDate: { $lte: now },
  expiresAt: { $gt: now },
});

export const calculateCoupon = async ({ code, lines }) => {
  const normalizedCode = normalizeCouponCode(code);
  if (!normalizedCode) {
    throw new CouponValidationError("Enter a coupon code");
  }
  if (normalizedCode.length > 40) {
    throw new CouponValidationError("Coupon code is invalid");
  }

  const now = new Date();
  const offer = await Offer.findOne({ promoCode: normalizedCode });
  if (!offer) throw new CouponValidationError("Coupon code is invalid", 404);
  if (!offer.isActive) {
    throw new CouponValidationError("This coupon is not active", 409);
  }
  if (offer.startDate > now) {
    throw new CouponValidationError("This coupon is not active yet", 409);
  }
  if (offer.expiresAt <= now) {
    throw new CouponValidationError("This coupon has expired", 409);
  }
  if (offer.usageLimit !== null && offer.usageCount >= offer.usageLimit) {
    throw new CouponValidationError("This coupon has reached its usage limit", 409);
  }

  const subtotal = calculateCartSubtotal(lines);
  if (subtotal < offer.minimumOrderAmount) {
    throw new CouponValidationError(
      `A minimum order of ${offer.minimumOrderAmount.toFixed(2)} SAR is required`,
      409
    );
  }

  const eligibleLines = lines.filter((line) => lineIsEligible(line, offer));
  if (!eligibleLines.length) {
    const scopeLabel =
      offer.couponScope === "category"
        ? `${offer.applicableCategory} items`
        : "the selected offer item";
    throw new CouponValidationError(
      `Add ${scopeLabel} to use this coupon`,
      409
    );
  }

  const eligibleSubtotal = calculateCartSubtotal(eligibleLines);
  let discountAmount =
    offer.discountType === "percentage"
      ? eligibleSubtotal * (offer.discountValue / 100)
      : offer.discountValue;

  if (offer.maximumDiscount !== null) {
    discountAmount = Math.min(discountAmount, offer.maximumDiscount);
  }
  discountAmount = Number(
    Math.max(0, Math.min(discountAmount, eligibleSubtotal, subtotal)).toFixed(2)
  );

  if (discountAmount <= 0) {
    throw new CouponValidationError(
      "This coupon does not apply a discount to the current cart",
      409
    );
  }

  return {
    offer,
    code: normalizedCode,
    originalSubtotal: subtotal,
    eligibleSubtotal,
    discountAmount,
    discountedSubtotal: Number((subtotal - discountAmount).toFixed(2)),
  };
};

export const reserveCouponUsage = async (offerId) => {
  const now = new Date();
  const offer = await Offer.findOneAndUpdate(
    {
      _id: offerId,
      ...activeCouponFilter(undefined, now),
      $or: [
        { usageLimit: null },
        { $expr: { $lt: ["$usageCount", "$usageLimit"] } },
      ],
    },
    { $inc: { usageCount: 1 } },
    { new: true }
  );

  if (!offer) {
    throw new CouponValidationError(
      "This coupon is no longer available",
      409
    );
  }
  return offer;
};

export const releaseCouponUsage = (offerId) =>
  Offer.updateOne(
    { _id: offerId, usageCount: { $gt: 0 } },
    { $inc: { usageCount: -1 } }
  );
