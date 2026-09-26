import mongoose from "mongoose";

const leaveRequestSchema = new mongoose.Schema({
  staff: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: {
    type: String,
    enum: ["annual", "sick", "emergency", "day_off", "other"],
    required: true,
  },
  startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  endDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  reason: { type: String, default: "", trim: true, maxlength: 1000 },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

leaveRequestSchema.index({ staff: 1, startDate: 1, endDate: 1 });
leaveRequestSchema.index({ status: 1, startDate: 1, endDate: 1 });

export default mongoose.model("LeaveRequest", leaveRequestSchema);
