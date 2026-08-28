import mongoose from "mongoose";

const rewardSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    image: { type: String, required: true, trim: true },
    pointsRequired: { type: Number, required: true, min: 1 },
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false, select: false },
    deletedAt: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

rewardSchema.index({ isActive: 1, isDeleted: 1, sortOrder: 1 });

const Reward = mongoose.model("Reward", rewardSchema);
export default Reward;
