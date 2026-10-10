import mongoose from "mongoose";
const actor = new mongoose.Schema({ id: String, name: String, role: String }, { _id: false });
const event = new mongoose.Schema({ actor, at: Date, reason: String, requestKey: String, requestHash: String }, { _id: false });
const schema = new mongoose.Schema({
  code: { type: String, required: true, immutable: true },
  revision: { type: Number, required: true, immutable: true },
  // Validated against RecipeInstruction before creation. Never changed after creation.
  content: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  status: { type: String, enum: ["draft", "trial_required", "approved", "published"], required: true },
  createdActor: { type: actor, immutable: true },
  reason: { type: String, immutable: true },
  restoredFrom: { type: Number, immutable: true },
  importProvenance: { type: mongoose.Schema.Types.Mixed, immutable: true },
  approval: { type: event, default: null },
  submission: { type: event, default: null },
  qualifyingTrial: { type: mongoose.Schema.Types.ObjectId, ref: "RecipeInstructionTrial", default: null },
  checklist: { type: mongoose.Schema.Types.Mixed, default: null },
  dependencyPins: { type: [{ _id: false, code: String, revision: Number }], default: [] },
  publication: { type: event, default: null },
  requestKey: { type: String, immutable: true },
  requestHash: { type: String, immutable: true },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ code: 1, revision: 1 }, { unique: true });
schema.index({ code: 1, requestKey: 1 }, { unique: true, partialFilterExpression: { requestKey: { $type: "string" } } });
export default mongoose.model("RecipeInstructionRevision", schema);
