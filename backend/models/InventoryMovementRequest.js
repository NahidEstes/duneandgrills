import mongoose from "mongoose";
// Separate unique request keys avoid changing historical ledger indexes/data.
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, immutable: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  requestHash: { type: String, required: true, immutable: true },
  transaction: { type: mongoose.Schema.Types.ObjectId, ref: "StockTransaction", required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
export default mongoose.model("InventoryMovementRequest", schema);
