import mongoose from "mongoose";

// No TTL: forgetting a cancelled identifier would allow an old offline retry
// to charge stock or create a sale later. The hash contains no customer details.
const schema = new mongoose.Schema({
  _id: String,
  channel: { type: String, required: true, enum: ["customer", "pos", "admin"] },
  owner: { type: String, required: true },
  requestHash: String,
  state: { type: String, required: true, enum: ["committed", "cancelled"] },
  order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
}, { timestamps: true });
export default mongoose.model("OrderRequestFence", schema);
