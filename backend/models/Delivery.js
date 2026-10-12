import mongoose from "mongoose";

const issueSchema = new mongoose.Schema({
  previousStatus: { type: String, enum: ["assigned", "picked_up"] },
  reason: { type: String, trim: true, maxlength: 500 }, reportedAt: Date,
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  resolvedAt: Date, resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  resolution: { type: String, trim: true, maxlength: 500 },
}, { _id: false });

const deliverySchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, immutable: true, unique: true },
  rider: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  status: { type: String, enum: ["unassigned", "assigned", "picked_up", "delivered", "issue"], default: "unassigned" },
  revision: { type: Number, default: 0, min: 0 },
  assignedAt: Date, pickedUpAt: Date, deliveredAt: Date,
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  pickupInstructions: { type: String, trim: true, maxlength: 300, default: "Collect from the restaurant pickup counter." },
  deliveryNote: { type: String, trim: true, maxlength: 300, default: "" },
  enrollmentReason: { type: String, trim: true, maxlength: 500 },
  assignmentHistory: [{ rider: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, reason: { type: String, maxlength: 500 }, at: Date }],
  issue: { type: issueSchema, default: () => ({}) },
  issueHistory: { type: [issueSchema], default: [] },
  cashReport: {
    amountHalala: { type: Number, min: 0, default: null },
    balanceAtReportHalala: { type: Number, min: 0, default: null },
    status: { type: String, enum: ["none", "unconfirmed", "discrepancy", "confirmed"], default: "none" },
    reportedAt: Date, reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: { type: String, trim: true, maxlength: 500 },
    acknowledgedAt: Date, acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    acknowledgmentReason: { type: String, trim: true, maxlength: 500 },
    confirmedAt: Date, confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    paymentKey: { type: String, maxlength: 120 },
  },
}, { timestamps: true });
deliverySchema.index({ rider: 1, status: 1, updatedAt: -1 });
deliverySchema.index({ status: 1, updatedAt: -1 });
deliverySchema.index({ rider: 1, deliveredAt: -1 });
export default mongoose.model("Delivery", deliverySchema);
