import mongoose from "mongoose";

const inventoryCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    skuPrefix: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
      minlength: 2,
      maxlength: 12,
      match: /^[A-Z0-9]+$/,
    },
    description: { type: String, default: "", trim: true, maxlength: 300 },
    color: { type: String, default: "#f59e0b", trim: true, maxlength: 20 },
    isActive: { type: Boolean, default: true },
    externalId: { type: String, default: null, trim: true, sparse: true },
  },
  { timestamps: true }
);

inventoryCategorySchema.index(
  { name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);
inventoryCategorySchema.index(
  { skuPrefix: 1 },
  { unique: true, partialFilterExpression: { skuPrefix: { $type: "string" } } }
);

export default mongoose.model("InventoryCategory", inventoryCategorySchema);
