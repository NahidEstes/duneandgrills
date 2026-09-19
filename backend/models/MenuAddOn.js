import mongoose from "mongoose";

const menuAddOnSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    price: { type: Number, required: true, min: 0 },
    image: { type: String, default: "", trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true, index: true },
    menuItems: [{ type: mongoose.Schema.Types.ObjectId, ref: "MenuItem" }],
  },
  { timestamps: true }
);

menuAddOnSchema.index({ menuItems: 1, isActive: 1 });

export default mongoose.model("MenuAddOn", menuAddOnSchema);

