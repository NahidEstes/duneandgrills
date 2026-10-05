import mongoose from "mongoose";

const posDiscountApprovalSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, immutable: true },
  fingerprint: { type: String, required: true, immutable: true, index: true },
  cashier: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  approver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  discountType: { type: String, enum: ["fixed", "percentage"], required: true, immutable: true },
  discountValue: { type: Number, min: 0, required: true, immutable: true },
  discountAmount: { type: Number, min: 0, required: true, immutable: true },
  reason: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
  expiresAt: { type: Date, required: true, index: true, immutable: true },
  usedAt: { type: Date, default: null },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

export default mongoose.model("PosDiscountApproval", posDiscountApprovalSchema);
