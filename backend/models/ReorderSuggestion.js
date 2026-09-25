import mongoose from "mongoose";

export const REORDER_STATUSES = ["open", "reviewed", "dismissed", "converted", "resolved", "stale"];

const reorderSuggestionSchema = new mongoose.Schema({
  fingerprint: { type: String, required: true, unique: true, immutable: true },
  item: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem", required: true, unique: true, index: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryCategory", required: true, index: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", default: null, index: true },
  status: { type: String, enum: REORDER_STATUSES, default: "open", index: true },
  severity: { type: String, enum: ["critical", "high", "medium", "low"], default: "medium", index: true },
  breakdown: { type: mongoose.Schema.Types.Mixed, required: true },
  suggestedQuantity: { type: Number, required: true, min: 0 },
  reviewedQuantity: { type: Number, default: null, min: 0 },
  reviewedUnitPrice: { type: Number, default: null, min: 0 },
  reviewedSupplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", default: null },
  suggestedUnitPrice: { type: Number, default: null, min: 0 },
  priceSource: { type: String, enum: ["posted_invoice", "received", "approved", "missing", "manual"], default: "missing" },
  priceSourceReference: { type: mongoose.Schema.Types.ObjectId, default: null },
  estimatedTotal: { type: Number, default: null, min: 0 },
  warnings: { type: [String], default: [] },
  reasonCodes: { type: [String], default: [] },
  sourceSignature: { type: String, required: true },
  calculatedAt: { type: Date, required: true, default: Date.now, index: true },
  staleAt: { type: Date, required: true, index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  overrideReason: { type: String, default: "", trim: true, maxlength: 500 },
  dismissedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  dismissedAt: { type: Date, default: null },
  dismissReason: { type: String, default: "", trim: true, maxlength: 500 },
  snoozedUntil: { type: Date, default: null, index: true },
  convertedPurchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseOrder", default: null },
  convertedAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
}, { timestamps: true, optimisticConcurrency: true });

reorderSuggestionSchema.index({ status: 1, severity: 1, calculatedAt: -1 });
reorderSuggestionSchema.index({ supplier: 1, status: 1 });
export default mongoose.model("ReorderSuggestion", reorderSuggestionSchema);
