import mongoose from "mongoose";

export const CASH_MOVEMENT_TYPES = Object.freeze(["opening_cash", "cash_sale", "cash_refund", "cash_in", "cash_out", "payout", "correction"]);

const cashMovementSchema = new mongoose.Schema({
  shift: { type: mongoose.Schema.Types.ObjectId, ref: "PosShift", required: true, index: true, immutable: true },
  type: { type: String, enum: CASH_MOVEMENT_TYPES, required: true, immutable: true },
  amountHalala: { type: Number, required: true, min: 1, immutable: true },
  direction: { type: String, enum: ["in", "out"], required: true, immutable: true },
  reason: { type: String, required: true, trim: true, maxlength: 500, immutable: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null, immutable: true },
  refund: { type: mongoose.Schema.Types.ObjectId, ref: "Refund", default: null, immutable: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  idempotencyKey: { type: String, default: null, trim: true, maxlength: 140, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

cashMovementSchema.index({ shift: 1, createdAt: -1 });
cashMovementSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export default mongoose.model("CashMovement", cashMovementSchema);
