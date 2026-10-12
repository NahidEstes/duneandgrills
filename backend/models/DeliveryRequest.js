import mongoose from "mongoose";

// Durable idempotency receipts contain identifiers/revisions, never customer data.
const schema = new mongoose.Schema({
  _id: String,
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  fingerprint: { type: String, required: true, immutable: true },
  result: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: { createdAt: true, updatedAt: false } });
export default mongoose.model("DeliveryRequest", schema);
