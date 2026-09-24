import mongoose from "mongoose";
import { INVENTORY_UNITS } from "./InventoryItem.js";

const ingredientSchema = new mongoose.Schema({
  inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem", required: true },
  quantityPerAddOn: { type: Number, required: true, min: 0.000001 },
  unit: { type: String, required: true, enum: INVENTORY_UNITS },
  isActive: { type: Boolean, default: true },
}, { _id: false });

const addOnInventoryRecipeSchema = new mongoose.Schema({
  addOn: { type: mongoose.Schema.Types.ObjectId, ref: "MenuAddOn", required: true, unique: true, index: true },
  ingredients: {
    type: [ingredientSchema],
    default: [],
    validate: {
      validator(lines) {
        const ids = lines.map((line) => String(line.inventoryItem));
        return ids.length === new Set(ids).size;
      },
      message: "An add-on recipe cannot contain the same inventory item twice",
    },
  },
  doNotTrack: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

addOnInventoryRecipeSchema.index({ isActive: 1, doNotTrack: 1 });

export default mongoose.model("AddOnInventoryRecipe", addOnInventoryRecipeSchema);
