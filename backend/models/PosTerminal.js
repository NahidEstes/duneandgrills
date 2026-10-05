import mongoose from "mongoose";

const schema = new mongoose.Schema({
  code: { type: String, required: true, uppercase: true, trim: true, match: /^[A-Z0-9][A-Z0-9-]{0,39}$/, unique: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  locationLabel: { type: String, default: "", trim: true, maxlength: 120 },
  isActive: { type: Boolean, default: true, index: true },
  activeShift: { type: mongoose.Schema.Types.ObjectId, ref: "PosShift", default: null },
  operationRevision: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });
export default mongoose.model("PosTerminal", schema);
