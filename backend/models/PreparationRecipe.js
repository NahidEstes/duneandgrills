import mongoose from "mongoose";
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  finishedItem: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem", required: true, unique: true, immutable: true },
  expectedQuantity: { type: Number, required: true, min: 0.000001 },
  outputQuantity: { type: Number, required: true },
  outputUnit: { type: String, required: true },
  baseUnit: { type: String, required: true },
  ingredients: { type: [mongoose.Schema.Types.Mixed], required: true },
  isActive: { type: Boolean, default: true },
  notes: { type: String, maxlength: 2000, default: "" },
  version: { type: Number, default: 1 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ name: 1 });
export default mongoose.model("PreparationRecipe", schema);
