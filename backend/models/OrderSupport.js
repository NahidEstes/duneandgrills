import mongoose from "mongoose";

export const SUPPORT_CATEGORIES = ["Missing item", "Wrong item", "Food quality issue", "Other issue"];
export const SUPPORT_STATUSES = ["Open", "In Progress", "Resolved", "Closed"];
const message = new mongoose.Schema({
  text: { type: String, required: true, maxlength: 2000 },
  internal: { type: Boolean, default: false },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  authorType: { type: String, enum: ["Customer", "Support team"], required: true },
  createdAt: { type: Date, default: Date.now },
});
const schema = new mongoose.Schema({
  // One conversation per order consolidates issues and prevents duplicate cases.
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
  orderNumber: { type: String, required: true, index: true },
  category: { type: String, enum: SUPPORT_CATEGORIES, required: true },
  affectedItems: [{ type: Number, min: 0 }],
  description: { type: String, required: true, maxlength: 2000 },
  status: { type: String, enum: SUPPORT_STATUSES, default: "Open", index: true },
  resolution: { type: String, maxlength: 2000, default: "" },
  messages: { type: [message], default: [] },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ status: 1, updatedAt: -1 });
export default mongoose.model("OrderSupport", schema);
