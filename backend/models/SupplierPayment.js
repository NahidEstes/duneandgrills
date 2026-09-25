import mongoose from "mongoose";

const supplierPaymentSchema = new mongoose.Schema({
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: "SupplierInvoice", required: true, index: true, immutable: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true, index: true, immutable: true },
  amountHalala: { type: Number, required: true, min: 1, immutable: true },
  method: { type: String, enum: ["cash", "bank_transfer", "card", "cheque", "other"], required: true, immutable: true },
  transactionReference: { type: String, default: "", trim: true, maxlength: 160, immutable: true },
  paymentDate: { type: Date, required: true, immutable: true },
  note: { type: String, default: "", trim: true, maxlength: 500, immutable: true },
  status: { type: String, enum: ["completed", "reversed", "failed"], default: "completed", index: true },
  idempotencyKey: { type: String, required: true, unique: true, trim: true, maxlength: 140, immutable: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reversedAt: { type: Date, default: null },
  reversalReason: { type: String, default: "", trim: true, maxlength: 500 },
}, { timestamps: true });

supplierPaymentSchema.index({ invoice: 1, createdAt: -1 });
export default mongoose.model("SupplierPayment", supplierPaymentSchema);
