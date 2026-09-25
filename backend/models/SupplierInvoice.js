import mongoose from "mongoose";

export const SUPPLIER_INVOICE_STATUSES = ["draft", "submitted", "review_required", "approved", "posted", "disputed", "voided"];
export const SUPPLIER_PAYMENT_STATUSES = ["unpaid", "partially_paid", "paid"];

const lineSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem", required: true },
  purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseOrder", required: true },
  purchaseOrderLine: { type: mongoose.Schema.Types.ObjectId, required: true },
  quantity: { type: Number, required: true, min: 0.000001 },
  unit: { type: String, required: true, trim: true },
  conversionFactor: { type: Number, required: true, min: 0.000001, default: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 },
  matchStatus: { type: String, enum: ["matched", "warning", "mismatch"], default: "matched" },
  discrepancies: { type: [String], default: [] },
}, { _id: true });

const supplierInvoiceSchema = new mongoose.Schema({
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true, index: true },
  supplierInvoiceNumber: { type: String, required: true, trim: true, maxlength: 120 },
  normalizedInvoiceNumber: { type: String, required: true, trim: true, uppercase: true },
  internalReference: { type: String, required: true, unique: true, trim: true, uppercase: true },
  purchaseOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: "PurchaseOrder" }],
  invoiceDate: { type: Date, required: true },
  dueDate: { type: Date, default: null, index: true },
  currency: { type: String, enum: ["SAR"], default: "SAR", immutable: true },
  items: { type: [lineSchema], validate: [(rows) => rows.length > 0, "At least one invoice line is required"] },
  subtotal: { type: Number, required: true, min: 0 },
  tax: { type: Number, default: 0, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  additionalCharges: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  approvedAmount: { type: Number, default: 0, min: 0 },
  paidAmountHalala: { type: Number, default: 0, min: 0 },
  paymentReservedHalala: { type: Number, default: 0, min: 0 },
  paymentStatus: { type: String, enum: SUPPLIER_PAYMENT_STATUSES, default: "unpaid", index: true },
  status: { type: String, enum: SUPPLIER_INVOICE_STATUSES, default: "draft", index: true },
  matchSummary: { type: mongoose.Schema.Types.Mixed, default: {} },
  note: { type: String, default: "", trim: true, maxlength: 1000 },
  attachment: { type: mongoose.Schema.Types.Mixed, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  postedAt: { type: Date, default: null },
  transitionKeys: { type: [String], default: [] },
}, { timestamps: true, optimisticConcurrency: true });

supplierInvoiceSchema.index({ supplier: 1, normalizedInvoiceNumber: 1 }, { unique: true });
supplierInvoiceSchema.index({ dueDate: 1, paymentStatus: 1, status: 1 });

export default mongoose.model("SupplierInvoice", supplierInvoiceSchema);
