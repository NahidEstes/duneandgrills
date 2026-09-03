import InventoryItem from "../models/InventoryItem.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import StockTransaction from "../models/StockTransaction.js";
import { PRODUCT_TYPES } from "./catalogService.js";
import { performStockMovement } from "./inventoryStockService.js";

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

const buildRequirements = async (catalogLines, { strictRecipes, session }) => {
  const menuQuantities = expandMenuQuantities(catalogLines);
  const menuIds = menuQuantities.map((row) => row.menuItem);
  const recipes = await InventoryRecipe.find({ menuItem: { $in: menuIds } }).session(session || null).lean();
  const recipeMap = new Map(recipes.map((recipe) => [String(recipe.menuItem), recipe]));
  const missing = [];
  const requirements = new Map();

  for (const soldItem of menuQuantities) {
    const recipe = recipeMap.get(String(soldItem.menuItem));
    if (recipe?.doNotTrack) continue;
    const activeIngredients = recipe?.isActive === false ? [] : (recipe?.ingredients || []).filter((line) => line.isActive !== false);
    if (!activeIngredients.length) {
      if (strictRecipes) missing.push(soldItem.name);
      continue;
    }
    for (const line of activeIngredients) {
      const id = String(line.inventoryItem);
      const current = requirements.get(id) || { inventoryItem: id, quantity: 0 };
      current.quantity = roundQuantity(current.quantity + Number(line.quantityPerSale) * soldItem.quantity);
      requirements.set(id, current);
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
    if (!item || !item.isActive) unavailable.push("an inactive inventory ingredient");
    else if (Number(item.currentStock) < requirement.quantity) {
      unavailable.push(`${item.name} needs ${requirement.quantity} ${item.unit}, only ${item.currentStock} available`);
    }
  }
  if (unavailable.length) throw new OrderInventoryError(`Insufficient inventory: ${unavailable.join("; ")}`);
  return [...requirements.values()].map((requirement) => ({ ...requirement, item: itemMap.get(requirement.inventoryItem) }));
};

const rollbackStandaloneMovements = async (movements) => {
  for (const movement of [...movements].reverse()) {
    await InventoryItem.updateOne(
      { _id: movement.item._id, currentStock: movement.item.currentStock },
      { $set: { currentStock: movement.transaction.stockBefore } }
    );
    await StockTransaction.deleteOne({ _id: movement.transaction._id });
  }
};

export const deductOrderInventory = async ({ catalogLines, orderId, orderNumber, source, actorId, strictRecipes = false, session = null }) => {
  const requirements = await buildRequirements(catalogLines, { strictRecipes, session });
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
      }, { session }));
    }
    return restorations.map((movement) => movement.transaction);
  } catch (error) {
    if (!session && restorations.length) await rollbackStandaloneMovements(restorations);
    throw error;
  }
};
