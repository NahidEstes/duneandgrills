import mongoose from "mongoose";

export const REFUND_STATUSES = Object.freeze(["requested", "approved", "rejected", "processing", "completed", "failed", "cancelled"]);
export const REFUND_METHODS = Object.freeze(["cash", "card", "other"]);

const refundSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true, immutable: true },
  originalPaymentReference: { type: String, default: "", trim: true, maxlength: 160, immutable: true },
  amountHalala: { type: Number, required: true, min: 1, immutable: true },
  type: { type: String, enum: ["full", "partial"], required: true, immutable: true },
  reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 500, immutable: true },
  method: { type: String, enum: REFUND_METHODS, required: true, immutable: true },
  externalReference: { type: String, default: "", trim: true, maxlength: 160 },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  status: { type: String, enum: REFUND_STATUSES, default: "requested", index: true },
  failureReason: { type: String, default: "", trim: true, maxlength: 500 },
  idempotencyKey: { type: String, required: true, trim: true, maxlength: 120, unique: true, immutable: true },
  approvalRequired: { type: Boolean, default: true, immutable: true },
  completedAt: { type: Date, default: null },
  statusHistory: { type: [{ status: { type: String, enum: REFUND_STATUSES, required: true }, note: { type: String, default: "", maxlength: 500 }, changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, changedAt: { type: Date, default: Date.now } }], default: [] },
}, { timestamps: true });

refundSchema.index({ order: 1, createdAt: -1 });
refundSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("Refund", refundSchema);
