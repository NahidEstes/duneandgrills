import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    isReward: { type: Boolean, default: false },
    reward: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reward",
      default: null,
    },
    redemptionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // guest checkout also allowed
    },
    orderNumber: {
      type: String,
      unique: true,
    },
    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String },
      address: { type: String },
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: (v) => Array.isArray(v) && v.length > 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "preparing",
        "out-for-delivery",
        "delivered",
        "cancelled",
        "refunded",
        "failed",
      ],
      default: "pending",
    },
    notes: {
      type: String,
      default: "",
    },
    eligiblePointsAmount: { type: Number, default: 0, min: 0 },
    pointsEarned: { type: Number, default: 0, min: 0 },
    pointsAwardedAt: { type: Date, default: null },
    pointsReversedAt: { type: Date, default: null },
    rewardRedemption: {
      redemptionId: { type: mongoose.Schema.Types.ObjectId, default: null },
      reward: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Reward",
        default: null,
      },
      menuItem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MenuItem",
        default: null,
      },
      title: { type: String, default: "" },
      pointsSpent: { type: Number, default: 0, min: 0 },
    },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);

export default Order;
