import mongoose from "mongoose";
// No plaintext reset/verification token or provider response is persisted.
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  kind: { type: String, enum: ["reset", "verify"], required: true },
  language: { type: String, enum: ["en", "ar"], default: "en" },
  emailHash: { type: String, required: true },
  status: { type: String, enum: ["queued", "processing", "retry", "accepted", "cancelled", "failed"], default: "queued" },
  attempts: { type: Number, default: 0 }, availableAt: { type: Date, default: Date.now },
  lockedUntil: { type: Date, default: null }, acceptedAt: { type: Date, default: null },
  lastError: { type: String, default: "" }, expiresAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ status: 1, availableAt: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("CustomerEmailJob", schema);
