import mongoose from "mongoose";

// A tiny collection that holds one running sequence number per key
// (e.g. one entry per day: "20260823" -> 7).
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // the key, e.g. "20260823"
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model("Counter", counterSchema);
export default Counter;
