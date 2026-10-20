import mongoose from "mongoose";
import { plannerFields } from "./PlannerTask.js";
import { PLANNER_REPEATS } from "../services/plannerRules.js";

const schema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, required: true },
  template: { type: new mongoose.Schema(plannerFields(), { _id: false, strict: "throw" }), required: true },
  repeat: { type: String, enum: PLANNER_REPEATS, required: true },
  repeatOptions: { type: new mongoose.Schema({ unit: { type: String, enum: ["weeks", "months"] }, interval: Number, weekdays: [Number] }, { _id: false, strict: "throw" }), default: null },
  paused: { type: Boolean, default: false },
  pausedAt: { type: Date, default: null },
  alertsAfter: { type: Date, default: null },
  history: [{ _id: false, action: String, at: Date, actor: { id: mongoose.Schema.Types.ObjectId, name: String } }],
  anchorDay: { type: Number, required: true },
  nextOn: { type: String, default: null },
  endBefore: { type: String, default: null },
  requestKey: { type: String, required: true, unique: true },
  requestHash: { type: String, required: true },
  revision: { type: Number, default: 0 },
  createdBy: { id: mongoose.Schema.Types.ObjectId, name: String },
}, { timestamps: true, strict: "throw" });
schema.index({ nextOn: 1 });
export default mongoose.model("PlannerSeries", schema);
