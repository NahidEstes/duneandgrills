import mongoose from "mongoose";
import { DEFAULT_ORDER_TYPE, ORDER_TYPES } from "../config/orders.js";
import { DELIVERY_PROVIDERS, PAYMENT_METHODS, PAYMENT_STATUSES, SALES_SOURCES } from "../config/sales.js";
import { MAX_ITEM_NOTE_LENGTH, SPICE_LEVELS } from "../config/menuCustomization.js";

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
    basePrice: { type: Number, min: 0, default: null },
    quantity: { type: Number, required: true, min: 1 },
    selectedAddOns: {
      type: [
        new mongoose.Schema(
          {
            addOn: { type: mongoose.Schema.Types.ObjectId, ref: "MenuAddOn", default: null },
            name: { type: String, required: true, trim: true, maxlength: 80 },
            image: { type: String, default: "", trim: true, maxlength: 500 },
            price: { type: Number, required: true, min: 0 },
            quantity: { type: Number, required: true, min: 1, max: 99, default: 1 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    spiceLevel: { type: String, enum: ["", ...SPICE_LEVELS], default: "" },
    itemNote: { type: String, trim: true, maxlength: MAX_ITEM_NOTE_LENGTH, default: "" },
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
      required: true,
      immutable: true,
      trim: true,
      unique: true,
    },
    trackingTokenHash: { type: String, default: null, select: false, immutable: true },
    source: { type: String, enum: SALES_SOURCES, default: "website", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    idempotencyKey: { type: String, trim: true, default: undefined },
    manualEntry: { type: Boolean, default: false, immutable: true, index: true },
    deliveryProvider: { type: String, enum: DELIVERY_PROVIDERS, default: undefined, immutable: true },
    externalOrderId: { type: String, trim: true, uppercase: true, maxlength: 100, default: undefined, immutable: true },
    orderOccurredAt: { type: Date, default: null, immutable: true, index: true },
    branch: { type: String, trim: true, maxlength: 160, default: "" },
    deliveryPaymentType: { type: String, enum: ["", "aggregator_prepaid"], default: "" },
    platformTotal: { type: Number, min: 0, default: null },
    totalDifference: { type: Number, default: 0 },
    differenceReason: { type: String, trim: true, maxlength: 300, default: "" },
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
    posDiscount: {
      type: { type: String, enum: ["", "fixed", "percentage"], default: "" },
      value: { type: Number, min: 0, default: 0 },
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      approvedAt: { type: Date, default: null },
    },
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
    pickupNote: { type: String, trim: true, maxlength: 240, default: "" },
    pickupToken: { type: String, trim: true, uppercase: true, maxlength: 12, default: "" },
  refundedAmount: { type: Number, min: 0, default: 0 },
  refundedAmountHalala: { type: Number, min: 0, default: 0 },
  refundReservedHalala: { type: Number, min: 0, default: 0 },
    posShift: { type: mongoose.Schema.Types.ObjectId, ref: "PosShift", default: null },
    terminal: { type: String, default: "MAIN", immutable: true },
    terminalRef: { type: mongoose.Schema.Types.ObjectId, ref: "PosTerminal", default: null, immutable: true },
    terminalSnapshot: { code: String, name: String, locationLabel: String },
    voidIdempotencyKey: { type: String, default: undefined },
    voidedAt: { type: Date, default: null },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    restoredItemQuantities: { type: mongoose.Schema.Types.Mixed, default: {} },
    inventoryReturnedQuantities: { type: mongoose.Schema.Types.Mixed, default: {} },
    rewardRefundPointsReversed: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
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
    cancellationReason: { type: String, default: "", trim: true, maxlength: 500 },
    refundReason: { type: String, default: "", trim: true, maxlength: 500 },
    estimatedPreparationMinutes: { type: Number, default: null, min: 1, max: 240 },
    preparationDueAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    preparationStartedAt: { type: Date, default: null },
    readyAt: { type: Date, default: null },
    statusHistory: {
      type: [{
        status: { type: String, required: true },
        reason: { type: String, default: "", trim: true, maxlength: 500 },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        changedAt: { type: Date, default: Date.now },
      }],
      default: [],
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
orderSchema.index({ source: 1, createdBy: 1, createdAt: -1 });
orderSchema.index({ source: 1, terminal: 1, createdAt: -1 });
orderSchema.index({ source: 1, orderNumber: 1 });
orderSchema.index({ voidIdempotencyKey: 1 }, { unique: true, sparse: true });
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderType: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ preparationDueAt: 1, status: 1 });
orderSchema.index({ status: 1, readyAt: 1, createdAt: 1 });
orderSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
orderSchema.index({ trackingTokenHash: 1 }, { sparse: true });
orderSchema.index(
  { deliveryProvider: 1, externalOrderId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      manualEntry: true,
      deliveryProvider: { $type: "string" },
      externalOrderId: { $type: "string" },
    },
  }
);

const Order = mongoose.model("Order", orderSchema);

export default Order;
