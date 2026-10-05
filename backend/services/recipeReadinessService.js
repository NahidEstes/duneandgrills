import mongoose from "mongoose";
import { getSaleableInventory } from "./inventoryEligibilityService.js";

export async function attachRecipeSaleableStock(recipes) {
  const now = new Date();
  const items = new Map();
  for (const recipe of recipes.filter(Boolean)) for (const line of recipe.ingredients || []) {
    const item = line.inventoryItem;
    if (item?._id && item.unit) items.set(String(item._id), item);
  }
  const stocks = new Map(await Promise.all([...items].map(async ([id, item]) => [id, await getSaleableInventory(item, { now })])));
  for (const recipe of recipes.filter(Boolean)) for (const line of recipe.ingredients || []) {
    const stock = stocks.get(String(line.inventoryItem?._id));
    if (stock) Object.assign(line.inventoryItem, stock);
  }
}

// Shared by sale validation and recipe management. Disabled ingredient rows are intentional exclusions.
export function recipeReadiness(recipe, quantityField = "quantityPerSale") {
  if (recipe?.doNotTrack === true) return { status: "do_not_track", issue: "", ingredients: [] };
  const invalid = issue => ({ status: "not_configured", issue, ingredients: [] });
  if (!recipe) return invalid("Missing recipe");
  if (recipe.isActive === false) return invalid("Recipe is inactive");
  const ingredients = (recipe.ingredients || []).filter(line => line.isActive !== false);
  if (!ingredients.length) return invalid("No active ingredients");
  const seen = new Set();
  for (const line of ingredients) {
    const item = line.inventoryItem;
    const id = String(item?._id || item || "");
    if (!mongoose.isValidObjectId(id)) return invalid("Missing or invalid inventory ingredient");
    if (seen.has(id)) return invalid("Duplicate inventory ingredient");
    seen.add(id);
    if (!Number.isFinite(Number(line[quantityField])) || Number(line[quantityField]) < 0.000001) return invalid("Ingredient quantity must be at least 0.000001");
    if (!line.unit) return invalid("Ingredient base unit is missing");
    // Populated management records can also detect archived/deleted ingredients and unit changes.
    if (item?.unit && (item.isActive === false || line.unit !== item.unit)) return invalid(item.isActive === false ? `Inactive ingredient: ${item.name}` : `Ingredient unit no longer matches ${item.name}'s base unit`);
  }
  return { status: "configured", issue: "", ingredients };
}
