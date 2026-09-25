import mongoose from "mongoose";

export const PURCHASE_ORDER_STATUSES = ["draft", "submitted", "approved", "rejected", "ordered", "partially_received", "received", "closed_short", "cancelled"];

const purchaseOrderLineSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    itemName: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0.0001 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    purchaseUnit: { type: String, default: null, trim: true },
    baseUnit: { type: String, default: null, trim: true },
    conversionFactor: { type: Number, default: 1, min: 0.000001 },
    expiryDate: { type: Date, default: null },
  },
  { _id: true }
);

const purchaseOrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true },
    items: {
      type: [purchaseOrderLineSchema],
      validate: [(value) => value.length > 0, "At least one purchase item is required"],
    },
    status: { type: String, enum: PURCHASE_ORDER_STATUSES, default: "draft" },
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    additionalCharges: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    notes: { type: String, default: "", trim: true, maxlength: 800 },
    orderedAt: { type: Date, default: null },
    expectedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    externalId: { type: String, default: null, trim: true, sparse: true },
    revision: { type: Number, default: 1, min: 1 },
    revisionHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
    approvals: { type: [mongoose.Schema.Types.Mixed], default: [] },
    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    statusVersion: { type: Number, default: 0, min: 0 },
    transitionKeys: { type: [String], default: [] },
    receiptKeys: { type: [String], default: [] },
    priceWarnings: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true, optimisticConcurrency: true }
);

purchaseOrderSchema.index({ supplier: 1, createdAt: -1 });
purchaseOrderSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("PurchaseOrder", purchaseOrderSchema);
