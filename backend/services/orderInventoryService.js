import InventoryItem from "../models/InventoryItem.js";
import InventoryBatch from "../models/InventoryBatch.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import AddOnInventoryRecipe from "../models/AddOnInventoryRecipe.js";
import StockTransaction from "../models/StockTransaction.js";
import { PRODUCT_TYPES } from "./catalogService.js";
import { updateItemNextExpiry } from "./inventoryBatchService.js";
import { performStockMovement } from "./inventoryStockService.js";
import { getSaleableInventory } from "./inventoryEligibilityService.js";
import { recipeReadiness } from "./recipeReadinessService.js";

export class OrderInventoryError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.name = "OrderInventoryError";
    this.status = status;
  }
}

const roundQuantity = (value) => Number(Number(value).toFixed(6));

const expandMenuQuantities = (catalogLines) => {
  const menu = new Map();
  const add = (menuItem, quantity) => {
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
      throw new OrderInventoryError("Invalid menu/combo component quantity. Repair the menu configuration before selling");
    }
    const id = String(menuItem?._id || menuItem);
    const current = menu.get(id) || { menuItem: id, name: menuItem?.name || "Menu item", quantity: 0 };
    current.quantity = roundQuantity(current.quantity + Number(quantity));
    if (menuItem?.name) current.name = menuItem.name;
    menu.set(id, current);
  };
  for (const line of catalogLines) {
    if (line.productType === PRODUCT_TYPES.COMBO) {
      for (const component of line.product?.items || []) {
        add(component.menuItem, Number(line.quantity) * Number(component.quantity));
      }
    } else {
      add(line.product, line.quantity);
    }
  }
  return [...menu.values()];
};

const addRequirement = (requirements, inventoryItem, quantity, component) => {
  const id = String(inventoryItem);
  const current = requirements.get(id) || { inventoryItem: id, quantity: 0, components: [] };
  current.quantity = roundQuantity(current.quantity + Number(quantity));
  current.components.push(component);
  requirements.set(id, current);
};

const buildRequirements = async (catalogLines, { session, now }) => {
  const menuQuantities = expandMenuQuantities(catalogLines);
  const menuIds = menuQuantities.map((row) => row.menuItem);
  const recipes = await InventoryRecipe.find({ menuItem: { $in: menuIds } }).session(session || null).lean();
  const recipeMap = new Map(recipes.map((recipe) => [String(recipe.menuItem), recipe]));
  const missing = [];
  const requirements = new Map();

  for (const soldItem of menuQuantities) {
    const recipe = recipeMap.get(String(soldItem.menuItem));
    const readiness = recipeReadiness(recipe);
    if (readiness.status === "do_not_track") continue;
    if (readiness.status !== "configured") {
      missing.push(`${soldItem.name} (${readiness.issue})`);
      continue;
    }
    for (const line of readiness.ingredients) {
      const quantity = Number(line.quantityPerSale) * soldItem.quantity;
      addRequirement(requirements, line.inventoryItem, quantity, {
        type: "menu_recipe", menuItem: soldItem.menuItem, name: soldItem.name, soldQuantity: soldItem.quantity, ingredientQuantity: roundQuantity(quantity), unit: line.unit,
      });
    }
  }

  const selectedAddOns = catalogLines.flatMap((line) => (line.customization?.selectedAddOns || []).map((addOn) => ({
    addOnId: String(addOn.addOn),
    addOnName: addOn.name,
    addOnQuantity: Number(addOn.quantity || 1),
    orderItemQuantity: Number(line.quantity || 1),
  })));
  if (selectedAddOns.length) {
    const addOnIds = [...new Set(selectedAddOns.map((entry) => entry.addOnId))];
    const addOnRecipes = await AddOnInventoryRecipe.find({ addOn: { $in: addOnIds } }).session(session || null).lean();
    const addOnRecipeMap = new Map(addOnRecipes.map((recipe) => [String(recipe.addOn), recipe]));
    for (const selected of selectedAddOns) {
      const recipe = addOnRecipeMap.get(selected.addOnId);
      const readiness = recipeReadiness(recipe, "quantityPerAddOn");
      if (readiness.status === "do_not_track") continue;
      if (readiness.status !== "configured") { missing.push(`Add-on ${selected.addOnName} (${readiness.issue})`); continue; }
      for (const line of readiness.ingredients) {
        const quantity = Number(line.quantityPerAddOn) * selected.addOnQuantity * selected.orderItemQuantity;
        addRequirement(requirements, line.inventoryItem, quantity, {
          type: "add_on_recipe",
          addOn: selected.addOnId,
          name: selected.addOnName,
          addOnQuantity: selected.addOnQuantity,
          orderItemQuantity: selected.orderItemQuantity,
          ingredientQuantity: roundQuantity(quantity),
          unit: line.unit,
        });
      }
    }
  }

  if (missing.length) {
    throw new OrderInventoryError(`Configure a recipe or mark Do Not Track for: ${missing.join(", ")}`);
  }
  if (!requirements.size) return [];

  const items = await InventoryItem.find({ _id: { $in: [...requirements.keys()] } }).session(session || null);
  const itemMap = new Map(items.map((item) => [String(item._id), item]));
  const unavailable = [];
  for (const requirement of requirements.values()) {
    const item = itemMap.get(requirement.inventoryItem);
    if (!item || !item.isActive) unavailable.push("Missing/inactive inventory ingredient. Repair the recipe or explicitly mark Do Not Track");
    else if (requirement.components.some(component => component.unit !== item.unit)) unavailable.push(`${item.name} recipe unit does not match its base unit (${item.unit}). Update the recipe`);
    else if (!Number.isFinite(requirement.quantity) || requirement.quantity <= 0) unavailable.push(`Invalid ingredient quantity for ${item.name}. Update the recipe`);
    else {
      const stock = await getSaleableInventory(item, { now, session });
      if (stock.saleableStock < requirement.quantity) unavailable.push(`${item.name} needs ${requirement.quantity} ${item.unit}, only ${stock.saleableStock} saleable (${stock.physicalStock} physical). Expired, quarantined, damaged and unknown-expiry tracked stock cannot be sold`);
    }
  }
  if (unavailable.length) throw new OrderInventoryError(`Insufficient saleable inventory / invalid recipe: ${unavailable.join("; ")}`);
  return [...requirements.values()].map((requirement) => ({ ...requirement, item: itemMap.get(requirement.inventoryItem) }));
};

const rollbackStandaloneMovements = async (movements) => {
  for (const movement of [...movements].reverse()) {
    const batchRollbackDirection = movement.transaction.stockAfter < movement.transaction.stockBefore ? 1 : -1;
    for (const allocation of movement.transaction.batchAllocations || []) {
      if (allocation.batch) {
        await InventoryBatch.updateOne(
          { _id: allocation.batch },
          { $inc: { remainingQuantity: batchRollbackDirection * allocation.quantity } }
        );
      }
    }
    await InventoryItem.updateOne(
      { _id: movement.item._id, currentStock: movement.item.currentStock },
      {
        $set: {
          currentStock: movement.transaction.stockBefore,
          expiryDate: await updateItemNextExpiry(movement.item._id),
        },
      }
    );
    await StockTransaction.deleteOne({ _id: movement.transaction._id });
  }
};

export const deductOrderInventory = async ({ catalogLines, orderId, orderNumber, source, actorId, session = null }) => {
  const existing = await StockTransaction.find({ order: orderId, movementType: "STOCK_OUT" }).session(session || null);
  if (existing.length) return existing;
  // All channels share the same mandatory rules; legacy strictRecipes flags cannot bypass them.
  const now = new Date();
  const requirements = await buildRequirements(catalogLines, { session, now });
  // Keep operations on the transaction session sequential, including read-only snapshot queries.
  const perLine = [];
  for (const line of catalogLines) perLine.push(await buildRequirements([line], { session, now }));
  const movements = [];
  try {
    for (const requirement of requirements) {
      movements.push(await performStockMovement({
        itemId: requirement.inventoryItem,
        movementType: "STOCK_OUT",
        quantity: requirement.quantity,
        reason: `${source === "pos" ? "POS sale" : "Order"} #${orderNumber}`,
        notes: "Recipe-based ingredient deduction",
        reference: orderNumber,
        order: orderId,
        userId: actorId,
        allowNegativeStock: false,
        respectItemNegativeStock: false,
        saleOnly: true,
        eligibilityNow: now,
        sourceDetails: { components: requirement.components, lineQuantities: perLine.map((rows, index) => ({ index, quantity: rows.find(row => String(row.inventoryItem) === String(requirement.inventoryItem))?.quantity || 0 })).filter(row => row.quantity > 0) },
      }, { session }));
    }
    return movements.map((movement) => movement.transaction);
  } catch (error) {
    if (!session && movements.length) await rollbackStandaloneMovements(movements);
    throw error;
  }
};

export const restoreOrderInventory = async ({ transactionIds, orderId, orderNumber, actorId, status, session = null }) => {
  if (!transactionIds?.length) return [];
  const deductions = await StockTransaction.find({ _id: { $in: transactionIds }, order: orderId, movementType: "STOCK_OUT" }).session(session || null).lean();
  const restorations = [];
  try {
    for (const deduction of deductions) {
      restorations.push(await performStockMovement({
        itemId: deduction.item,
        movementType: "STOCK_IN",
        quantity: deduction.quantity,
        reason: `Order #${orderNumber} inventory restored`,
        notes: `Order status changed to ${status}`,
        reference: `${orderNumber}-RETURN`,
        order: orderId,
        userId: actorId,
        restoreAllocations: deduction.batchAllocations || [],
      }, { session }));
    }
    return restorations.map((movement) => movement.transaction);
  } catch (error) {
    if (!session && restorations.length) await rollbackStandaloneMovements(restorations);
    throw error;
  }
};
