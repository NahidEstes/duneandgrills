import mongoose from "mongoose";

export const PURCHASING_ACTION_STATES = ["open", "acknowledged", "snoozed", "resolved"];

const purchasingActionSchema = new mongoose.Schema({
  fingerprint: { type: String, required: true, unique: true, immutable: true },
  actionType: { type: String, required: true, trim: true, index: true },
  severity: { type: String, enum: ["critical", "high", "medium", "low"], required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  explanation: { type: String, required: true, trim: true, maxlength: 600 },
  entityType: { type: String, required: true, trim: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  href: { type: String, required: true, trim: true, maxlength: 300 },
  state: { type: String, enum: PURCHASING_ACTION_STATES, default: "open", index: true },
  detectedAt: { type: Date, default: Date.now, index: true },
  lastDetectedAt: { type: Date, default: Date.now },
  dueAt: { type: Date, default: null, index: true },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  acknowledgedAt: { type: Date, default: null },
  snoozedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  snoozedUntil: { type: Date, default: null, index: true },
  resolvedAt: { type: Date, default: null },
  resolution: { type: String, default: "", trim: true, maxlength: 500 },
  occurrenceCount: { type: Number, default: 1, min: 1 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, optimisticConcurrency: true });

purchasingActionSchema.index({ state: 1, severity: 1, lastDetectedAt: -1 });
purchasingActionSchema.index({ actionType: 1, state: 1 });
export default mongoose.model("PurchasingAction", purchasingActionSchema);
