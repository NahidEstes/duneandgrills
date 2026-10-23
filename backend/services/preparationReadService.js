import InventoryItem from "../models/InventoryItem.js";
import Production from "../models/Production.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { assertObjectId, ValidationError } from "../utils/inventoryValidation.js";
import { preparationBaseQuantity } from "./preparationUnits.js";
import { getSaleableInventory } from "./inventoryEligibilityService.js";

export async function preparationAvailability(actor, payload, now = new Date()) {
  if (!hasCapability(actor?.role, CAPABILITIES.INVENTORY_READ)) throw Object.assign(new ValidationError("Inventory permission required"), { status: 403 });
  if (!Array.isArray(payload?.items) || !payload.items.length || payload.items.length > 100) throw new ValidationError("Choose between 1 and 100 stock items");
  const ids = payload.items.map(row => String(assertObjectId(row.inventoryItem, "ingredient")));
  if (new Set(ids).size !== ids.length) throw new ValidationError("Duplicate ingredient rows are not allowed");
  const items = await InventoryItem.find({ _id: { $in: ids } }).lean();
  const data = await Promise.all(payload.items.map(async row => {
    const item = items.find(value => String(value._id) === String(row.inventoryItem));
    if (!item) return { inventoryItem: row.inventoryItem, unavailable: true };
    const stock = await getSaleableInventory(item, { now });
    const required = row.quantity == null ? null : preparationBaseQuantity(row.quantity, row.unit, item);
    return { inventoryItem: String(item._id), name: item.name, unit: item.unit, isActive: item.isActive, physicalStock: stock.physicalStock, usable: item.isActive ? stock.saleableStock : 0, required, shortage: required == null ? null : Number(Math.max(0, required - (item.isActive ? stock.saleableStock : 0)).toFixed(6)) };
  }));
  return { data, generatedAt: now };
}

// Resolve by saved batch identity, never by editable names/lot text or today's
// recipe definition. Allocation costs/quantities remain the saved evidence.
export async function preparationSources(ingredients) {
  const ids = ingredients.flatMap(line => (line.allocations || []).map(row => row.batch)).filter(Boolean);
  const sources = ids.length ? await Production.find({ finishedBatch: { $in: ids } }).select("productionNumber finishedBatch finishedItem finishedName recipeSnapshot.name recipeVersion actualQuantity unit preparedAt status ingredients.name ingredients.quantity ingredients.unit").lean() : [];
  return ingredients.map(line => ({ inventoryItem: String(line.inventoryItem), name: line.name, unit: line.unit, allocations: (line.allocations || []).map(allocation => {
    const source = sources.find(row => String(row.finishedBatch) === String(allocation.batch) && String(row.finishedItem) === String(line.inventoryItem));
    return { ...allocation, sourceProduction: source ? { _id: source._id, productionNumber: source.productionNumber, name: source.finishedName || source.recipeSnapshot?.name || "Name not recorded", actualQuantity: source.actualQuantity, unit: source.unit, status: source.status, ingredients: source.ingredients } : null };
  }) }));
}
