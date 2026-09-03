import mongoose from "mongoose";
import { DEFAULT_ORDER_TYPE, ORDER_TYPES } from "../config/orders.js";
import { PAYMENT_METHODS, PAYMENT_STATUSES, SALES_SOURCES } from "../config/sales.js";

const orderItemSchema = new mongoose.Schema(
  {
    productType: {
      type: String,
      enum: ["menuItem", "combo"],
      default: "menuItem",
      required: true,
    },
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required() {
        return this.productType !== "combo";
      },
      default: null,
    },
    combo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Combo",
      required() {
        return this.productType === "combo";
      },
      default: null,
    },
    name: { type: String, required: true },
    image: { type: String, default: "" },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    comboItems: {
      type: [
        new mongoose.Schema(
          {
            menuItem: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "MenuItem",
              required: true,
            },
            name: { type: String, required: true },
            price: { type: Number, required: true, min: 0 },
            quantity: { type: Number, required: true, min: 1 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
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
    source: { type: String, enum: SALES_SOURCES, default: "website", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    idempotencyKey: { type: String, trim: true, default: undefined },
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
    orderType: {
      type: String,
      enum: ORDER_TYPES,
      default: DEFAULT_ORDER_TYPE,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    originalSubtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    discountAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    discountReason: { type: String, default: "", trim: true, maxlength: 160 },
    couponCode: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },
    offer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Offer",
      default: null,
    },
    couponSnapshot: {
      title: { type: String, default: "" },
      discountType: {
        type: String,
        enum: ["fixed", "percentage", ""],
        default: "",
      },
      discountValue: { type: Number, default: 0, min: 0 },
    },
    deliveryFee: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: "unrecorded" },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: "pending" },
    cashReceived: { type: Number, min: 0, default: 0 },
    changeDue: { type: Number, min: 0, default: 0 },
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
    inventoryStatus: {
      type: String,
      enum: ["pending", "deducted", "restored", "not_required"],
      default: "pending",
    },
    inventoryTransactions: [{ type: mongoose.Schema.Types.ObjectId, ref: "StockTransaction" }],
    inventoryRestorationTransactions: [{ type: mongoose.Schema.Types.ObjectId, ref: "StockTransaction" }],
    inventoryDeductedAt: { type: Date, default: null },
    inventoryRestoredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ source: 1, createdAt: -1 });
orderSchema.index({ orderType: 1, createdAt: -1 });
orderSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

const Order = mongoose.model("Order", orderSchema);

export default Order;
