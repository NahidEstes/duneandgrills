import mongoose from "mongoose";

const slugify = (value = "") =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const contentCategorySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["menu", "blog"],
      required: true,
      immutable: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    normalizedName: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 240,
      default: "",
    },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

contentCategorySchema.index({ type: 1, normalizedName: 1 }, { unique: true });
contentCategorySchema.index({ type: 1, slug: 1 }, { unique: true });
contentCategorySchema.index({ type: 1, isActive: 1, sortOrder: 1, name: 1 });

contentCategorySchema.pre("validate", function normalizeCategory() {
  this.name = String(this.name || "").trim().replace(/\s+/g, " ");
  this.normalizedName = this.name.toLowerCase();
  this.slug = slugify(this.name);
});

const ContentCategory = mongoose.model(
  "ContentCategory",
  contentCategorySchema
);

export default ContentCategory;
