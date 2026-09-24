import mongoose from "mongoose";

const posShiftSchema = new mongoose.Schema({
  cashier: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true, immutable: true },
  terminal: { type: String, required: true, trim: true, uppercase: true, maxlength: 60, default: "MAIN", immutable: true },
  openingCashHalala: { type: Number, required: true, min: 0, immutable: true },
  openedAt: { type: Date, required: true, default: Date.now, immutable: true },
  openedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  status: { type: String, enum: ["open", "closing", "closed", "reopened"], default: "open", index: true },
  isOpen: { type: Boolean, default: true, index: true },
  cashSalesHalala: { type: Number, default: 0, min: 0 },
  cardSalesHalala: { type: Number, default: 0, min: 0 },
  otherSalesHalala: { type: Number, default: 0, min: 0 },
  cashRefundsHalala: { type: Number, default: 0, min: 0 },
  cardRefundsHalala: { type: Number, default: 0, min: 0 },
  cashAddedHalala: { type: Number, default: 0, min: 0 },
  cashPayoutsHalala: { type: Number, default: 0, min: 0 },
  expectedCashHalala: { type: Number, default: null },
  countedCashHalala: { type: Number, default: null },
  differenceHalala: { type: Number, default: null },
  closingNote: { type: String, default: "", trim: true, maxlength: 500 },
  closedAt: { type: Date, default: null },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  managerApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reopenReason: { type: String, default: "", trim: true, maxlength: 500 },
  closeIdempotencyKey: { type: String, default: null, trim: true, maxlength: 120 },
}, { timestamps: true });

posShiftSchema.index({ cashier: 1, terminal: 1, isOpen: 1 }, { unique: true, partialFilterExpression: { isOpen: true } });
posShiftSchema.index({ terminal: 1, openedAt: -1 });
posShiftSchema.index({ closedAt: -1 }, { sparse: true });
posShiftSchema.index({ closeIdempotencyKey: 1 }, { unique: true, sparse: true });

export default mongoose.model("PosShift", posShiftSchema);
