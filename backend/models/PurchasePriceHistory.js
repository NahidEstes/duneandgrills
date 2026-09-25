import mongoose from "mongoose";

const purchasePriceHistorySchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem", required: true, index: true, immutable: true },
  sku: { type: String, required: true, immutable: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true, index: true, immutable: true },
  quantity: { type: Number, required: true, min: 0.000001, immutable: true },
  unit: { type: String, required: true, immutable: true },
  conversionFactor: { type: Number, required: true, min: 0.000001, immutable: true },
  unitPrice: { type: Number, required: true, min: 0, immutable: true },
  baseUnitPrice: { type: Number, required: true, min: 0, immutable: true },
  currency: { type: String, enum: ["SAR"], default: "SAR", immutable: true },
  priceType: { type: String, enum: ["proposed", "approved", "received", "invoiced", "correction"], required: true, index: true, immutable: true },
  purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseOrder", default: null, immutable: true },
  receipt: { type: mongoose.Schema.Types.ObjectId, ref: "StockTransaction", default: null, immutable: true },
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: "SupplierInvoice", default: null, immutable: true },
  effectiveAt: { type: Date, required: true, immutable: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
  lifecycleKey: { type: String, required: true, unique: true, immutable: true },
  warning: { type: String, default: "", immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

purchasePriceHistorySchema.index({ item: 1, priceType: 1, effectiveAt: -1 });
purchasePriceHistorySchema.index({ supplier: 1, item: 1, effectiveAt: -1 });
export default mongoose.model("PurchasePriceHistory", purchasePriceHistorySchema);
