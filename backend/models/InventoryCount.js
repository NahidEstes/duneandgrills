import mongoose from "mongoose";

const inventoryCountLineSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    itemName: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    expectedQuantity: { type: Number, required: true },
    countedQuantity: { type: Number, default: null, min: 0 },
    variance: { type: Number, default: null },
    notes: { type: String, default: "", trim: true, maxlength: 300 },
  },
  { _id: true }
);

const inventoryCountSchema = new mongoose.Schema(
  {
    countNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    status: { type: String, enum: ["draft", "in_progress", "completed", "cancelled"], default: "draft" },
    items: { type: [inventoryCountLineSchema], default: [] },
    notes: { type: String, default: "", trim: true, maxlength: 800 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    completedAt: { type: Date, default: null },
    externalId: { type: String, default: null, trim: true, sparse: true },
  },
  { timestamps: true }
);

inventoryCountSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("InventoryCount", inventoryCountSchema);
