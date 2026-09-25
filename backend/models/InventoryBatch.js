import mongoose from "mongoose";
import { PURCHASE_UNITS } from "./InventoryItem.js";

const FAR_FUTURE = new Date("9999-12-31T23:59:59.999Z");

const inventoryBatchSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem", required: true, index: true },
    lotNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
    receivedQuantity: { type: Number, required: true, min: 0.000001 },
    remainingQuantity: { type: Number, required: true, min: 0 },
    receivedAt: { type: Date, required: true, default: Date.now },
    expiryDate: { type: Date, default: null },
    fefoDate: { type: Date, required: true, default: FAR_FUTURE },
    unitCost: { type: Number, required: true, min: 0 },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", default: null },
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseOrder", default: null },
    sourceTransaction: { type: mongoose.Schema.Types.ObjectId, ref: "StockTransaction", default: null },
    source: {
      type: String,
      enum: ["PURCHASE_RECEIPT", "STOCK_IN", "OPENING_BALANCE", "ADJUSTMENT", "RESTORATION", "LEGACY"],
      required: true,
    },
    purchaseQuantity: { type: Number, min: 0, default: null },
    purchaseUnit: { type: String, enum: PURCHASE_UNITS, default: null },
    conversionFactor: { type: Number, min: 0.000001, default: 1 },
    qualityStatus: { type: String, enum: ["usable", "quarantined", "damaged"], default: "usable", index: true },
    isLegacy: { type: Boolean, default: false },
  },
  { timestamps: true, optimisticConcurrency: true }
);

inventoryBatchSchema.pre("validate", function setFefoDate(next) {
  this.fefoDate = this.expiryDate || FAR_FUTURE;
  next();
});

inventoryBatchSchema.index({ item: 1, remainingQuantity: 1, fefoDate: 1, receivedAt: 1 });
inventoryBatchSchema.index({ item: 1, qualityStatus: 1, expiryDate: 1, remainingQuantity: 1 });
inventoryBatchSchema.index({ expiryDate: 1, remainingQuantity: 1 }, { sparse: true });
inventoryBatchSchema.index({ lotNumber: "text" });
inventoryBatchSchema.index(
  { item: 1, isLegacy: 1 },
  { unique: true, partialFilterExpression: { isLegacy: true } }
);

export default mongoose.model("InventoryBatch", inventoryBatchSchema);
