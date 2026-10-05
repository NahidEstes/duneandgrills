import mongoose from "mongoose";

const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  actorSessionVersion: { type: Number, default: 0 },
  locked: { type: Boolean, default: false },
  failedAttempts: { type: Number, default: 0 },
  blockedUntil: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("PosSession", schema);
