import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema({
  staff: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  shift: { type: mongoose.Schema.Types.ObjectId, ref: "Shift", required: true },
  shiftName: { type: String, required: true, trim: true, maxlength: 80 },
  scheduledStart: { type: Date, required: true },
  scheduledEnd: { type: Date, required: true },
  clockIn: { type: Date, default: null },
  clockOut: { type: Date, default: null },
  totalWorkedMinutes: { type: Number, default: 0, min: 0 },
  lateMinutes: { type: Number, default: 0, min: 0 },
  overtimeMinutes: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ["checked_in", "on_time", "late", "absent", "on_leave", "completed"],
    default: "checked_in",
    index: true,
  },
  notes: { type: String, default: "", trim: true, maxlength: 1000 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

attendanceSchema.index({ staff: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ clockIn: -1 });

export default mongoose.model("Attendance", attendanceSchema);
