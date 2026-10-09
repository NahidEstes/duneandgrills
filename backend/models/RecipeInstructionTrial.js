import mongoose from "mongoose";
const schema = new mongoose.Schema({
  code: { type: String, required: true, immutable: true },
  revision: { type: Number, required: true, immutable: true },
  requestKey: { type: String, required: true, immutable: true },
  requestHash: { type: String, required: true, immutable: true },
  // An append-only, server-validated measured record. No pricing/cost fields.
  record: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  actor: { id: String, name: String, role: String },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ code: 1, revision: 1, requestKey: 1 }, { unique: true });
schema.index({ code: 1, revision: 1, createdAt: -1, _id: -1 });
export default mongoose.model("RecipeInstructionTrial", schema);
