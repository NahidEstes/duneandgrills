import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    subtitle: {
      type: String,
      default: "",
      trim: true,
      maxlength: 160,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    image: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value) => /^(https?:\/\/|\/)/i.test(value),
        message: "Image must be an HTTP(S) URL or a local absolute path",
      },
    },
    badge: {
      type: String,
      default: "Limited Time",
      trim: true,
      maxlength: 60,
    },
    discountText: {
      type: String,
      default: "",
      trim: true,
      maxlength: 60,
    },
    originalPrice: {
      type: Number,
      default: null,
      min: 0,
    },
    offerPrice: {
      type: Number,
      default: null,
      min: 0,
    },
    promoCode: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    startDate: {
      type: Date,
      default: Date.now,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    ctaText: {
      type: String,
      default: "Order Now",
      trim: true,
      maxlength: 40,
    },
    ctaLink: {
      type: String,
      default: "/menu",
      trim: true,
      maxlength: 500,
      validate: {
        validator: (value) => /^(https?:\/\/|\/|#)/i.test(value),
        message: "CTA link must be an HTTP(S) URL, local path, or page anchor",
      },
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

offerSchema.pre("validate", function validateOfferDates(next) {
  if (this.startDate && this.expiresAt && this.expiresAt <= this.startDate) {
    this.invalidate("expiresAt", "Expiration must be later than the start date");
  }

  if (
    this.originalPrice !== null &&
    this.offerPrice !== null &&
    this.offerPrice > this.originalPrice
  ) {
    this.invalidate(
      "offerPrice",
      "Offer price cannot be higher than the original price"
    );
  }

  next();
});

offerSchema.index({ isActive: 1, startDate: 1, expiresAt: 1 });
offerSchema.index({ isFeatured: -1, sortOrder: 1, createdAt: -1 });

const Offer = mongoose.model("Offer", offerSchema);

export default Offer;
