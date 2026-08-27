import Offer from "../models/Offer.js";

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
  "startDate",
  "expiresAt",
  "isFeatured",
  "isActive",
  "ctaText",
  "ctaLink",
  "sortOrder",
];

const offerPayload = (body) =>
  OFFER_FIELDS.reduce((payload, field) => {
    if (body[field] !== undefined) payload[field] = body[field];
    return payload;
  }, {});

const validPublicOfferFilter = () => {
  const now = new Date();
  return {
    isActive: true,
    startDate: { $lte: now },
    expiresAt: { $gt: now },
  };
};

const handleControllerError = (res, err, fallbackMessage) => {
  const status = err.name === "CastError" ? 404 : 400;
  return res.status(status).json({
    success: false,
    message: fallbackMessage,
    error: err.message,
  });
};

// Public visitors only receive offers that are active and currently valid.
export const getOffers = async (req, res) => {
  try {
    const offers = await Offer.find(validPublicOfferFilter()).sort({
      isFeatured: -1,
      sortOrder: 1,
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: offers.length,
      data: offers,
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
    const offers = await Offer.find({}).sort({
      isFeatured: -1,
      sortOrder: 1,
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: offers.length,
      data: offers,
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
    });

    if (!offer) {
      return res
        .status(404)
        .json({ success: false, message: "Offer not found" });
    }

    return res.status(200).json({ success: true, data: offer });
  } catch (err) {
    return handleControllerError(res, err, "Offer not found");
  }
};

export const createOffer = async (req, res) => {
  try {
    const offer = await Offer.create(offerPayload(req.body));
    res.status(201).json({ success: true, data: offer });
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

    Object.assign(offer, offerPayload(req.body));
    await offer.save();

    return res.status(200).json({ success: true, data: offer });
  } catch (err) {
    return handleControllerError(res, err, "Failed to update offer");
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
