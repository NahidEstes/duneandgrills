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
    orderProductType: {
      type: String,
      enum: ["menuItem", "combo"],
      default: "menuItem",
    },
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      default: null,
    },
    combo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Combo",
      default: null,
    },
    orderQuantity: {
      type: Number,
      default: 1,
      min: 1,
      max: 99,
      validate: {
        validator: Number.isInteger,
        message: "Order quantity must be a whole number",
      },
    },
    discountType: {
      type: String,
      enum: ["fixed", "percentage"],
      default: "fixed",
    },
    discountValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    couponScope: {
      type: String,
      enum: ["order", "product", "category"],
      default: "order",
    },
    applicableCategory: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
    minimumOrderAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maximumDiscount: {
      type: Number,
      default: null,
      min: 0,
    },
    usageLimit: {
      type: Number,
      default: null,
      min: 1,
      validate: {
        validator: (value) => value === null || Number.isInteger(value),
        message: "Usage limit must be a whole number",
      },
    },
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
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

  if (this.promoCode && this.discountValue <= 0) {
    this.invalidate(
      "discountValue",
      "A coupon must have a discount value greater than zero"
    );
  }

  if (this.discountType === "percentage" && this.discountValue > 100) {
    this.invalidate("discountValue", "Percentage discount cannot exceed 100");
  }

  if (this.orderProductType === "combo") {
    this.menuItem = null;
  } else {
    this.combo = null;
  }

  if (this.couponScope === "product") {
    const productId =
      this.orderProductType === "combo" ? this.combo : this.menuItem;
    if (!productId) {
      this.invalidate(
        "couponScope",
        "A product-specific coupon requires an Order Now product"
      );
    }
  }

  if (this.couponScope === "category" && !this.applicableCategory) {
    this.invalidate(
      "applicableCategory",
      "A category-specific coupon requires a category"
    );
  }

  next();
});

offerSchema.index({ isActive: 1, startDate: 1, expiresAt: 1 });
offerSchema.index({ isFeatured: -1, sortOrder: 1, createdAt: -1 });
offerSchema.index(
  { promoCode: 1 },
  {
    unique: true,
    partialFilterExpression: { promoCode: { $type: "string", $gt: "" } },
  }
);

const Offer = mongoose.model("Offer", offerSchema);

export default Offer;
