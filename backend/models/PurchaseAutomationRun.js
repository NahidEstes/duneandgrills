import mongoose from "mongoose";

const purchaseAutomationRunSchema = new mongoose.Schema({
  idempotencyKey: { type: String, required: true, unique: true, immutable: true, trim: true, maxlength: 140 },
  suggestionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "ReorderSuggestion", required: true }],
  purchaseOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: "PurchaseOrder" }],
  status: { type: String, enum: ["processing", "completed", "failed"], default: "processing", index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  failureMessage: { type: String, default: "", maxlength: 500 },
}, { timestamps: true });

export default mongoose.model("PurchaseAutomationRun", purchaseAutomationRunSchema);
