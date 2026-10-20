import mongoose from "mongoose";
import MenuItem from "../models/MenuItem.js";
import { OrderEngineError } from "../config/orderContract.js";
import { getPublicCategoryMatch, CATEGORY_TYPES } from "./categoryService.js";
import { attachPublicCustomizations } from "./menuCustomizationService.js";
import { checkCatalogInventory, OrderInventoryError } from "./orderInventoryService.js";

export const normalizeComplementaryItems = async (ids, self) => {
  if (!Array.isArray(ids) || ids.length > 8 || ids.some(id => typeof id !== "string" || !mongoose.isValidObjectId(id) || id === String(self))) throw new OrderEngineError("Choose up to 8 other menu items for cart suggestions");
  const unique = [...new Set(ids)];
  if (await MenuItem.countDocuments({ _id: { $in: unique } }) !== unique.length) throw new OrderEngineError("A suggested menu item no longer exists");
  return unique;
};

export const cartSuggestions = async (items) => {
  if (!Array.isArray(items) || items.length > 100 || items.some(item => !item || typeof item !== "object" || !mongoose.isValidObjectId(item.productId))) throw new OrderEngineError("Invalid cart items");
  const excluded = new Set(items.filter(item => item.productType !== "combo").map(item => String(item.productId)));
  const categoryMatch = await getPublicCategoryMatch(CATEGORY_TYPES.MENU);
  const triggers = await MenuItem.find({ _id: { $in: [...excluded] }, isAvailable: true, $and: [categoryMatch] }).select("complementaryItems").lean();
  const ids = [...new Set(triggers.flatMap(row => (row.complementaryItems || []).map(String)))].filter(id => !excluded.has(id)).slice(0, 12);
  const candidates = await MenuItem.find({ _id: { $in: ids }, isAvailable: true, price: { $gt: 0 }, $and: [categoryMatch] }).populate("categoryRef", "name slug isActive type");
  const byId = new Map(candidates.map(row => [String(row._id), row]));
  const available = [];
  for (const id of ids) {
    const product = byId.get(id);
    if (!product) continue;
    try { await checkCatalogInventory([{ product, productType: "menuItem", quantity: 1 }]); }
    catch (error) { if (error instanceof OrderInventoryError) continue; throw error; }
    available.push(product);
    if (available.length === 3) break;
  }
  return attachPublicCustomizations(available);
};
