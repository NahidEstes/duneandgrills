import mongoose from "mongoose";

const comboItemSchema = new mongoose.Schema(
  {
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
    quantity: { type: Number, required: true, min: 1, max: 99 },
  },
  { _id: false }
);

const comboSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid combo slug"],
    },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    image: { type: String, required: true, trim: true },
    category: { type: String, enum: ["Combos"], default: "Combos" },
    items: {
      type: [comboItemSchema],
      required: true,
      validate: [
        {
          validator: (items) => Array.isArray(items) && items.length > 0,
          message: "A combo must contain at least one menu item",
        },
        {
          validator(items) {
            const ids = items.map((item) => item.menuItem.toString());
            return ids.length === new Set(ids).size;
          },
          message: "A combo cannot contain duplicate menu items",
        },
      ],
    },
    regularPrice: { type: Number, required: true, min: 0 },
    comboPrice: { type: Number, required: true, min: 0.01 },
    discountAmount: { type: Number, required: true, min: 0, default: 0 },
    discountPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
    isAvailable: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    featuredOrder: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
  },
  { timestamps: true }
);

comboSchema.index({ status: 1, isAvailable: 1, isFeatured: -1, featuredOrder: 1 });

const Combo = mongoose.model("Combo", comboSchema);

export default Combo;
