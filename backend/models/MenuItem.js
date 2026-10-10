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

const customizationGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    selectionType: { type: String, enum: ["single", "multiple"], default: "multiple" },
    minSelections: { type: Number, min: 0, max: 20, default: 0 },
    maxSelections: { type: Number, min: 1, max: 20, default: 20 },
    addOns: [{ type: mongoose.Schema.Types.ObjectId, ref: "MenuAddOn" }],
  },
  { _id: true }
);

const customizationSettingsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    spice: { type: spiceSettingsSchema, default: () => ({}) },
    groups: { type: [customizationGroupSchema], default: [] },
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
    kitchenStation: { type: String, trim: true, maxlength: 80, default: "" },
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
  for (const group of this.customization?.groups || []) {
    group.addOns = [...new Set((group.addOns || []).map(String))];
    if (group.selectionType === "single") group.maxSelections = 1;
    if (group.minSelections > group.maxSelections) {
      return next(new Error(`${group.name} minimum selections cannot exceed its maximum`));
    }
    if (group.maxSelections > group.addOns.length && group.addOns.length) group.maxSelections = group.addOns.length;
  }
  return next();
});

const MenuItem = mongoose.model("MenuItem", menuItemSchema);

export default MenuItem;
