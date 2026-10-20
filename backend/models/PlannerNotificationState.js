import mongoose from "mongoose";

// Per-admin acknowledgement only; no business model is updated.
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  task: { type: mongoose.Schema.Types.ObjectId, required: true },
  seenKey: { type: String, default: "" },
  dismissedKey: { type: String, default: "" },
}, { timestamps: true, strict: "throw" });
schema.index({ user: 1, task: 1 }, { unique: true });
export default mongoose.model("PlannerNotificationState", schema);
