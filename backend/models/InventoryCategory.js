import mongoose from "mongoose";

const inventoryCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
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

export default mongoose.model("InventoryCategory", inventoryCategorySchema);
