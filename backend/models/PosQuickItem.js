import mongoose from "mongoose";
const schema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, required: true },
  productType: { type: String, enum: ["menuItem", "combo"], required: true },
  position: { type: Number, default: 0, min: 0 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
schema.index({ productId: 1, productType: 1 }, { unique: true });
export default mongoose.model("PosQuickItem", schema);
