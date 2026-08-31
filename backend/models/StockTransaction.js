import mongoose from "mongoose";

export const STOCK_MOVEMENT_TYPES = [
  "STOCK_IN",
  "STOCK_OUT",
  "ADJUSTMENT",
  "WASTE",
  "DAMAGED",
  "INVENTORY_COUNT",
  "PURCHASE_RECEIPT",
  "OPENING_BALANCE",
];

const stockTransactionSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem", required: true, immutable: true },
    movementType: { type: String, enum: STOCK_MOVEMENT_TYPES, required: true, immutable: true },
    quantity: { type: Number, required: true, min: 0, immutable: true },
    stockBefore: { type: Number, required: true, immutable: true },
    stockAfter: { type: Number, required: true, immutable: true },
    reason: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
    notes: { type: String, default: "", trim: true, maxlength: 500, immutable: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseOrder", default: null, immutable: true },
    inventoryCount: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryCount", default: null, immutable: true },
    unitCost: { type: Number, default: null, min: 0, immutable: true },
    expiryDate: { type: Date, default: null, immutable: true },
    occurredAt: { type: Date, default: Date.now, immutable: true },
    externalId: { type: String, default: null, trim: true, immutable: true, sparse: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stockTransactionSchema.index({ item: 1, occurredAt: -1 });
stockTransactionSchema.index({ movementType: 1, occurredAt: -1 });
stockTransactionSchema.index({ purchaseOrder: 1 }, { sparse: true });

export default mongoose.model("StockTransaction", stockTransactionSchema);
