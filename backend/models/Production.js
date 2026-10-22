import mongoose from "mongoose";
import { automaticRecordNumber } from "../services/recordNumberService.js";
const fixed = (type, extra = {}) => ({ type, immutable: true, ...extra });
const schema = new mongoose.Schema({
  idempotencyKey: fixed(String, { required: true, unique: true }),
  requestHash: fixed(String, { required: true }),
  recipe: fixed(mongoose.Schema.Types.ObjectId, { ref: "PreparationRecipe", required: true }),
  recipeSnapshot: fixed(mongoose.Schema.Types.Mixed, { required: true }),
  finishedItem: fixed(mongoose.Schema.Types.ObjectId, { ref: "InventoryItem", required: true }),
  preparedBy: fixed(mongoose.Schema.Types.ObjectId, { ref: "User", required: true }),
  actorName: fixed(String),
  preparedAt: fixed(Date, { required: true }),
  expiryDate: fixed(Date, { default: null }),
  multiplier: fixed(Number, { required: true }),
  expectedQuantity: fixed(Number, { required: true }),
  actualQuantity: fixed(Number, { required: true }),
  unit: fixed(String, { required: true }),
  ingredients: fixed([mongoose.Schema.Types.Mixed], { required: true }),
  totalCost: fixed(Number, { required: true }),
  unitCost: fixed(Number, { required: true }),
  notes: fixed(String, { default: "" }),
  finishedBatch: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryBatch" },
  movements: [{ type: mongoose.Schema.Types.ObjectId, ref: "StockTransaction" }],
  status: { type: String, enum: ["completed", "reversed"], default: "completed" },
  reversedAt: Date,
  reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reversalReason: String,
  reversalMovements: [{ type: mongoose.Schema.Types.ObjectId, ref: "StockTransaction" }],
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ preparedAt: -1, _id: -1 });
schema.index({ recipe: 1, status: 1, preparedAt: -1 });
automaticRecordNumber(schema, { type: "Production" });
export default mongoose.model("Production", schema);
