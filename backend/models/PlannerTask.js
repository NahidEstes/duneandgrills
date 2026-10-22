import mongoose from "mongoose";
import { PLANNER_CATEGORIES, PLANNER_STATUSES } from "../services/plannerRules.js";

const completionSchema = new mongoose.Schema({
  at: Date,
  by: { id: mongoose.Schema.Types.ObjectId, name: String },
  dueAt: Date,
  title: String,
  category: String,
  responsible: { type: new mongoose.Schema({ id: mongoose.Schema.Types.ObjectId, name: String }, { _id: false }), default: null },
  checklist: [{ _id: false, text: String, done: Boolean }],
  note: { type: String, maxlength: 1000, default: "" },
}, { _id: false, strict: "throw" });

export const plannerFields = () => ({
  title: { type: String, required: true, maxlength: 160 },
  category: { type: String, enum: PLANNER_CATEGORIES, required: true },
  priority: { type: String, enum: ["Normal", "High"], default: "Normal" },
  dueDate: { type: String, required: true },
  time: { type: String, required: true },
  notes: { type: String, maxlength: 2000, default: "" },
  checklist: [{ _id: false, text: { type: String, required: true, maxlength: 200 }, done: { type: Boolean, default: false } }],
  responsible: { type: new mongoose.Schema({ id: mongoose.Schema.Types.ObjectId, name: String }, { _id: false, strict: "throw" }), default: null },
  linkedRecord: { type: new mongoose.Schema({ type: { type: String, enum: ["inventory", "supplier", "invoice", "purchase", "staff"] }, id: mongoose.Schema.Types.ObjectId, label: String }, { _id: false, strict: "throw" }), default: null },
});
const schema = new mongoose.Schema({
  ...plannerFields(),
  series: { type: mongoose.Schema.Types.ObjectId, ref: "PlannerSeries", required: true, index: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, required: true },
  scheduledOn: { type: String, required: true },
  dueAt: { type: Date, required: true, index: true },
  status: { type: String, enum: PLANNER_STATUSES, default: "Pending", index: true },
  completedAt: { type: Date, default: null },
  completion: { type: completionSchema, default: null },
  snoozedUntil: { type: Date, default: null },
  snoozeRequest: { type: new mongoose.Schema({ key: String, hash: String }, { _id: false, strict: "throw" }), default: null },
  undo: { type: new mongoose.Schema({ token: String, expiresAt: Date, revision: Number, previousStatus: String, previousCompletedAt: Date, previousCompletion: { type: completionSchema, default: null } }, { _id: false, strict: "throw" }), default: null },
  deleted: { type: Boolean, default: false },
  deletionKind: { type: String, enum: ["single", "reschedule"], default: undefined },
  revision: { type: Number, default: 0 },
  createdBy: { id: mongoose.Schema.Types.ObjectId, name: String },
  updatedBy: { id: mongoose.Schema.Types.ObjectId, name: String },
  history: [{ _id: false, action: String, at: Date, actor: { id: mongoose.Schema.Types.ObjectId, name: String }, completion: { type: completionSchema, default: undefined } }],
}, { timestamps: true, strict: "throw" });
schema.index({ groupId: 1, scheduledOn: 1 }, { unique: true, partialFilterExpression: { deleted: false } });
schema.index({ deleted: 1, status: 1, dueAt: 1 });
schema.index({ deleted: 1, completedAt: -1 });
schema.index({ deleted: 1, status: 1, "completion.by.id": 1, completedAt: -1 });
schema.index({ deleted: 1, "responsible.id": 1, dueAt: 1 });
export default mongoose.model("PlannerTask", schema);
