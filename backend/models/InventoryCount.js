import mongoose from "mongoose";

const inventoryCountLineSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    itemName: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    expectedQuantity: { type: Number, required: true },
    expectedStockVersion: { type: Number, required: true, default: 0 },
    countedQuantity: { type: Number, default: null, min: 0 },
    variance: { type: Number, default: null },
    appliedAdjustment: { type: Number, default: null },
    conflict: { type: Boolean, default: false },
    conflictReason: { type: String, default: "", trim: true, maxlength: 300 },
    notes: { type: String, default: "", trim: true, maxlength: 300 },
  },
  { _id: true }
);

const inventoryCountSchema = new mongoose.Schema(
  {
    countNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    status: { type: String, enum: ["draft", "in_progress", "review_required", "completed", "cancelled"], default: "draft" },
    blindCount: { type: Boolean, default: false },
    items: { type: [inventoryCountLineSchema], default: [] },
    notes: { type: String, default: "", trim: true, maxlength: 800 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    completedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    externalId: { type: String, default: null, trim: true, sparse: true },
  },
  { timestamps: true }
);

inventoryCountSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("InventoryCount", inventoryCountSchema);
