import mongoose from "mongoose";
import { RECIPE_CATEGORIES } from "../data/recipeInstructionPilot.js";

const texts = { type: [String], default: [], validate: value => value.length <= 30 && value.every(text => text.length <= 3000) };
const ingredient = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 180 },
  quantities: { type: [Number], required: true, validate: v => v.length > 0 && v.length <= 2 && v.every(n => Number.isFinite(n) && n > 0) },
  unit: { type: String, enum: ["g"], required: true },
  basis: { type: String, required: true, maxlength: 120 },
  specification: { type: String, maxlength: 1500, default: "" },
  counts: { type: [String], default: [] },
}, { _id: false });
const schema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, immutable: true, enum: ["B01", "HB01", "T1"] },
  aliases: { type: [String], default: [], immutable: true },
  name: { type: String, required: true, maxlength: 180 },
  category: { type: String, required: true, enum: RECIPE_CATEGORIES },
  description: { type: String, maxlength: 1500 },
  status: { type: String, enum: ["draft", "trial_required", "approved", "published"], default: "trial_required" },
  recipeVersion: { type: String, required: true },
  source: { manualVersion: String, manualDate: String, pages: [Number] },
  presets: [{ _id: false, key: String, label: String }],
  ingredients: { type: [ingredient], required: true },
  preparation: texts, cooking: texts, assembly: texts, serving: texts, delivery: texts,
  storage: texts, allergens: texts, yieldNotes: texts, warnings: texts,
  linkedPreparationCodes: { type: [String], default: [] },
  inventoryRecipe: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryRecipe", default: null },
  reviewNotes: { type: String, trim: true, maxlength: 3000, default: "" },
  // No public image URL or upload pretending to be an approved serving reference.
  servingPhoto: { type: String, default: null },
  revision: { type: Number, min: 1, default: 1 },
  publishedRevision: { type: Number, default: null },
  workflowVersion: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, optimisticConcurrency: true });
export default mongoose.model("RecipeInstruction", schema);
