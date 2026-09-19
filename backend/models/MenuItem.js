import mongoose from "mongoose";
import { SPICE_LEVELS } from "../config/menuCustomization.js";

const spiceSettingsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    options: [{ type: String, enum: SPICE_LEVELS }],
    default: { type: String, enum: ["", ...SPICE_LEVELS], default: "" },
  },
  { _id: false }
);

const customizationSettingsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    spice: { type: spiceSettingsSchema, default: () => ({}) },
  },
  { _id: false }
);

const menuItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    categoryRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContentCategory",
      index: true,
    },
    image: {
      type: String,
      required: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    calories: {
      type: Number,
      default: 0,
    },
    ingredients: {
      type: [String],
      default: [],
    },
    customization: {
      type: customizationSettingsSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

menuItemSchema.pre("validate", function validateCustomization(next) {
  const spice = this.customization?.spice;
  if (!spice) return next();
  spice.options = [...new Set(spice.options || [])];
  if (spice.enabled && !spice.options.length) {
    return next(new Error("Choose at least one available spice level"));
  }
  if (spice.default && !spice.options.includes(spice.default)) {
    return next(new Error("Default spice level must be one of the available options"));
  }
  return next();
});

const MenuItem = mongoose.model("MenuItem", menuItemSchema);

export default MenuItem;
