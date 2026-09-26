import mongoose from "mongoose";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const shiftSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80, unique: true },
  startTime: { type: String, required: true, match: TIME_PATTERN },
  endTime: { type: String, required: true, match: TIME_PATTERN },
  gracePeriodMinutes: { type: Number, default: 5, min: 0, max: 120 },
  daysOfWeek: {
    type: [{ type: Number, min: 0, max: 6 }],
    default: [0, 1, 2, 3, 4, 5, 6],
    validate: {
      validator: (days) => Array.isArray(days) && days.length > 0 && new Set(days).size === days.length,
      message: "Shift must include at least one unique working day",
    },
  },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

shiftSchema.index({ isActive: 1, name: 1 });

export default mongoose.model("Shift", shiftSchema);
