import mongoose from "mongoose";

const posHeldSaleSchema = new mongoose.Schema({
  cashier: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  terminal: { type: String, required: true, trim: true, uppercase: true, maxlength: 60, default: "MAIN" },
  terminalRef: { type: mongoose.Schema.Types.ObjectId, ref: "PosTerminal", default: null },
  terminalSnapshot: { code: String, name: String, locationLabel: String },
  status: { type: String, enum: ["working", "held", "consumed", "cancelled", "expired"], default: "working", index: true },
  label: { type: String, trim: true, maxlength: 100, default: "" },
  items: { type: [mongoose.Schema.Types.Mixed], default: [] },
  orderNote: { type: String, trim: true, maxlength: 500, default: "" },
  discount: {
    type: { type: String, enum: ["fixed", "percentage"], default: "fixed" },
    value: { type: Number, min: 0, default: 0 },
    reason: { type: String, trim: true, maxlength: 160, default: "" },
  },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  customer: {
    name: { type: String, trim: true, maxlength: 100, default: "" },
    phone: { type: String, trim: true, maxlength: 30, default: "" },
    pickupNote: { type: String, trim: true, maxlength: 240, default: "" },
  },
  orderType: { type: String, enum: ["dine-in", "takeaway"], default: "dine-in" },
  paymentMethod: { type: String, enum: ["cash", "card", "other"], default: "cash" },
  cashReceived: { type: Number, min: 0, default: 0 },
  revision: { type: Number, min: 0, default: 0 },
  expiresAt: { type: Date, required: true, index: true },
  consumedOrder: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  consumedIdempotencyKey: { type: String, trim: true, default: "" },
  consumedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
}, { timestamps: true });

posHeldSaleSchema.index({ cashier: 1, status: 1, updatedAt: -1 });
posHeldSaleSchema.index({ terminal: 1, status: 1, updatedAt: -1 });

export default mongoose.model("PosHeldSale", posHeldSaleSchema);
