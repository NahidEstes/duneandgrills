import Offer from "../models/Offer.js";
import Combo from "../models/Combo.js";
import MenuItem from "../models/MenuItem.js";
import {
  PRODUCT_TYPES,
  resolveCartLines,
  serializeCombo,
} from "../services/catalogService.js";
import { calculateCoupon } from "../services/couponService.js";

const OFFER_FIELDS = [
  "title",
  "subtitle",
  "description",
  "image",
  "badge",
  "discountText",
  "originalPrice",
  "offerPrice",
  "promoCode",
  "orderProductType",
  "menuItem",
  "combo",
  "orderQuantity",
  "discountType",
  "discountValue",
  "couponScope",
  "applicableCategory",
  "minimumOrderAmount",
  "maximumDiscount",
  "usageLimit",
  "startDate",
  "expiresAt",
  "isFeatured",
  "isActive",
  "ctaText",
  "ctaLink",
  "sortOrder",
];

const offerPopulation = [
  { path: "menuItem" },
  { path: "combo", populate: { path: "items.menuItem" } },
];

const serializeOffer = (offer) => {
  const plain = typeof offer?.toObject === "function" ? offer.toObject() : offer;
  const product =
    plain.orderProductType === PRODUCT_TYPES.COMBO
      ? plain.combo
        ? serializeCombo(plain.combo)
        : null
      : plain.menuItem
        ? { ...plain.menuItem, productType: PRODUCT_TYPES.MENU_ITEM }
        : null;

  return {
    ...plain,
    orderProduct: product
      ? {
          productType: plain.orderProductType,
          quantity: plain.orderQuantity,
          product,
        }
      : null,
  };
};

const offerPayload = (body) =>
  OFFER_FIELDS.reduce((payload, field) => {
    if (body[field] !== undefined) payload[field] = body[field];
    return payload;
  }, {});

const validateOfferReferences = async (payload) => {
  const type =
    payload.orderProductType === PRODUCT_TYPES.COMBO
      ? PRODUCT_TYPES.COMBO
      : PRODUCT_TYPES.MENU_ITEM;
  const productId = type === PRODUCT_TYPES.COMBO ? payload.combo : payload.menuItem;
  if (!productId) return;

  const exists =
    type === PRODUCT_TYPES.COMBO
      ? await Combo.exists({
          _id: productId,
          status: "published",
          isAvailable: true,
        })
      : await MenuItem.exists({ _id: productId, isAvailable: true });
  if (!exists) {
    const error = new Error(
      "The selected Order Now product is unavailable or does not exist"
    );
    error.status = 409;
    throw error;
  }
};

const ensureUniquePromoCode = async (promoCode, excludedId) => {
  if (!promoCode) return;
  const duplicate = await Offer.exists({
    promoCode: promoCode.trim().toUpperCase(),
    ...(excludedId ? { _id: { $ne: excludedId } } : {}),
  });
  if (duplicate) {
    const error = new Error("Promo code is already used by another offer");
    error.status = 409;
    throw error;
  }
};

const validPublicOfferFilter = () => {
  const now = new Date();
  return {
    isActive: true,
    startDate: { $lte: now },
    expiresAt: { $gt: now },
  };
};

const handleControllerError = (res, err, fallbackMessage) => {
  const status = err.status || (err.name === "CastError" ? 404 : 400);
  return res.status(status).json({
    success: false,
    message: err.message || fallbackMessage,
    error: err.message,
  });
};

// Public visitors only receive offers that are active and currently valid.
export const getOffers = async (req, res) => {
  try {
    const offers = await Offer.find(validPublicOfferFilter())
      .populate(offerPopulation)
      .sort({
        isFeatured: -1,
        sortOrder: 1,
        createdAt: -1,
      });

    res.status(200).json({
      success: true,
      count: offers.length,
      data: offers.map(serializeOffer),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch offers",
      error: err.message,
    });
  }
};

export const getAllOffersForAdmin = async (req, res) => {
  try {
    const offers = await Offer.find({})
      .populate(offerPopulation)
      .sort({
        isFeatured: -1,
        sortOrder: 1,
        createdAt: -1,
      });

    res.status(200).json({
      success: true,
      count: offers.length,
      data: offers.map(serializeOffer),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch offers",
      error: err.message,
    });
  }
};

export const getOfferById = async (req, res) => {
  try {
    const offer = await Offer.findOne({
      _id: req.params.id,
      ...validPublicOfferFilter(),
    }).populate(offerPopulation);

    if (!offer) {
      return res
        .status(404)
        .json({ success: false, message: "Offer not found" });
    }

    return res.status(200).json({ success: true, data: serializeOffer(offer) });
  } catch (err) {
    return handleControllerError(res, err, "Offer not found");
  }
};

export const createOffer = async (req, res) => {
  try {
    const payload = offerPayload(req.body);
    await Promise.all([
      validateOfferReferences(payload),
      ensureUniquePromoCode(payload.promoCode),
    ]);
    const offer = await Offer.create(payload);
    await offer.populate(offerPopulation);
    res.status(201).json({ success: true, data: serializeOffer(offer) });
  } catch (err) {
    handleControllerError(res, err, "Failed to create offer");
  }
};

export const updateOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) {
      return res
        .status(404)
        .json({ success: false, message: "Offer not found" });
    }

    const payload = offerPayload(req.body);
    const referencePayload = {
      orderProductType: payload.orderProductType ?? offer.orderProductType,
      menuItem: payload.menuItem !== undefined ? payload.menuItem : offer.menuItem,
      combo: payload.combo !== undefined ? payload.combo : offer.combo,
    };
    await Promise.all([
      validateOfferReferences(referencePayload),
      ensureUniquePromoCode(payload.promoCode ?? offer.promoCode, offer._id),
    ]);
    Object.assign(offer, payload);
    await offer.save();
    await offer.populate(offerPopulation);

    return res.status(200).json({ success: true, data: serializeOffer(offer) });
  } catch (err) {
    return handleControllerError(res, err, "Failed to update offer");
  }
};

// Public validation is safe because all prices and discount rules are loaded
// from MongoDB; the client submits only product identities and quantities.
export const validateCoupon = async (req, res) => {
  try {
    const lines = await resolveCartLines(req.body.items);
    const result = await calculateCoupon({ code: req.body.code, lines });
    return res.status(200).json({
      success: true,
      data: {
        offerId: result.offer._id,
        code: result.code,
        title: result.offer.title,
        originalSubtotal: result.originalSubtotal,
        discountAmount: result.discountAmount,
        discountedSubtotal: result.discountedSubtotal,
      },
    });
  } catch (err) {
    return handleControllerError(res, err, "Coupon could not be applied");
  }
};

export const deleteOffer = async (req, res) => {
  try {
    const offer = await Offer.findByIdAndDelete(req.params.id);
    if (!offer) {
      return res
        .status(404)
        .json({ success: false, message: "Offer not found" });
    }

    return res
      .status(200)
      .json({ success: true, message: "Offer deleted" });
  } catch (err) {
    return handleControllerError(res, err, "Failed to delete offer");
  }
};
