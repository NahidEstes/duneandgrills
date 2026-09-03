import InventoryItem from "../../models/InventoryItem.js";
import InventoryRecipe from "../../models/InventoryRecipe.js";
import MenuItem from "../../models/MenuItem.js";
import {
  assertObjectId,
  escapeRegex,
  parsePagination,
  ValidationError,
} from "../../utils/inventoryValidation.js";

const recipePopulate = {
  path: "ingredients.inventoryItem",
  select: "name sku unit currentStock unitCost isActive category",
  populate: { path: "category", select: "name" },
};

const recipeMetrics = (menuItem, recipe) => {
  const ingredients = recipe?.ingredients || [];
  const ingredientCost = ingredients.reduce((total, line) => {
    if (!line.isActive || !line.inventoryItem) return total;
    return total + Number(line.quantityPerSale) * Number(line.inventoryItem.unitCost || 0);
  }, 0);
  const sellingPrice = Number(menuItem.price || 0);
  const profit = sellingPrice - ingredientCost;
  return {
    ingredientCost: Number(ingredientCost.toFixed(2)),
    estimatedProfit: Number(profit.toFixed(2)),
    margin: sellingPrice > 0 ? Number(((profit / sellingPrice) * 100).toFixed(1)) : 0,
  };
};

const serializeRecipe = (menuItem, recipe) => ({
  ...menuItem,
  recipe: recipe || null,
  recipeStatus: recipe?.doNotTrack
    ? "do_not_track"
    : recipe?.ingredients?.length
      ? "configured"
      : "not_configured",
  metrics: recipeMetrics(menuItem, recipe),
});

export const listRecipes = async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query, 20);
    const menuFilter = {};
    if (req.query.search?.trim()) {
      const query = new RegExp(escapeRegex(req.query.search.trim()), "i");
      menuFilter.$or = [{ name: query }, { category: query }];
    }
    const [menuItems, recipes] = await Promise.all([
      MenuItem.find(menuFilter).populate("categoryRef", "name slug").sort({ name: 1 }).lean(),
      InventoryRecipe.find().populate(recipePopulate).populate("updatedBy", "name").lean(),
    ]);
    const recipesByMenuItem = new Map(recipes.map((row) => [String(row.menuItem), row]));
    const allRows = menuItems.map((item) => serializeRecipe(item, recipesByMenuItem.get(String(item._id))));
    const summary = allRows.reduce(
      (result, row) => {
        result.total += 1;
        if (row.recipeStatus === "configured") result.configured += 1;
        else if (row.recipeStatus === "do_not_track") result.doNotTrack += 1;
        else result.notConfigured += 1;
        if (row.recipeStatus === "configured") result.coveredSalesValue += Number(row.price || 0);
        result.totalSalesValue += Number(row.price || 0);
        return result;
      },
      { total: 0, configured: 0, notConfigured: 0, doNotTrack: 0, coveredSalesValue: 0, totalSalesValue: 0 }
    );
    summary.costCoverage = summary.totalSalesValue > 0
      ? Number(((summary.coveredSalesValue / summary.totalSalesValue) * 100).toFixed(1))
      : 0;
    const status = req.query.status;
    const filtered = status ? allRows.filter((row) => row.recipeStatus === status) : allRows;
    const start = (page - 1) * limit;
    res.json({
      success: true,
      data: filtered.slice(start, start + limit),
      summary,
      pagination: { page, limit, total: filtered.length, pages: Math.ceil(filtered.length / limit) },
      currency: "SAR",
    });
  } catch (error) { next(error); }
};

export const getRecipe = async (req, res, next) => {
  try {
    assertObjectId(req.params.menuItemId, "menu item");
    const [menuItem, recipe] = await Promise.all([
      MenuItem.findById(req.params.menuItemId).populate("categoryRef", "name slug").lean(),
      InventoryRecipe.findOne({ menuItem: req.params.menuItemId }).populate(recipePopulate).populate("updatedBy", "name").lean(),
    ]);
    if (!menuItem) return res.status(404).json({ success: false, message: "Menu item not found" });
    res.json({ success: true, data: serializeRecipe(menuItem, recipe) });
  } catch (error) { next(error); }
};

export const updateRecipe = async (req, res, next) => {
  try {
    assertObjectId(req.params.menuItemId, "menu item");
    const menuItem = await MenuItem.findById(req.params.menuItemId);
    if (!menuItem) throw new ValidationError("Menu item was not found");
    const doNotTrack = Boolean(req.body.doNotTrack);
    const isActive = req.body.isActive !== false;
    const lines = doNotTrack ? [] : req.body.ingredients;
    if (!doNotTrack && (!Array.isArray(lines) || lines.length === 0)) {
      throw new ValidationError("Add at least one ingredient or enable Do Not Track");
    }
    const existing = await InventoryRecipe.findOne({ menuItem: menuItem._id }).lean();
    const previousIds = new Set((existing?.ingredients || []).map((line) => String(line.inventoryItem)));
    const seen = new Set();
    const normalized = [];
    for (const [index, line] of (lines || []).entries()) {
      assertObjectId(line.inventoryItem, `ingredients[${index}].inventoryItem`);
      const id = String(line.inventoryItem);
      if (seen.has(id)) throw new ValidationError("A recipe cannot contain duplicate ingredients");
      seen.add(id);
      const quantity = Number(line.quantityPerSale);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new ValidationError(`Ingredient ${index + 1} quantity must be greater than zero`);
      }
      normalized.push({ inventoryItem: id, quantityPerSale: quantity, isActive: line.isActive !== false });
    }
    const inventoryItems = await InventoryItem.find({ _id: { $in: [...seen] } }).select("unit isActive");
    if (inventoryItems.length !== seen.size) throw new ValidationError("One or more inventory ingredients were not found");
    const inventoryMap = new Map(inventoryItems.map((item) => [String(item._id), item]));
    for (const line of normalized) {
      const inventoryItem = inventoryMap.get(String(line.inventoryItem));
      if (!inventoryItem.isActive && !previousIds.has(String(inventoryItem._id))) {
        throw new ValidationError("Inactive inventory items cannot be added to a recipe");
      }
      line.unit = inventoryItem.unit;
    }
    const recipe = await InventoryRecipe.findOneAndUpdate(
      { menuItem: menuItem._id },
      { $set: { ingredients: normalized, doNotTrack, isActive, updatedBy: req.user._id } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await InventoryItem.updateMany({ menuItems: menuItem._id }, { $pull: { menuItems: menuItem._id } });
    if (normalized.length) {
      await InventoryItem.updateMany(
        { _id: { $in: normalized.map((line) => line.inventoryItem) } },
        { $addToSet: { menuItems: menuItem._id } }
      );
    }
    await recipe.populate(recipePopulate);
    await recipe.populate("updatedBy", "name");
    res.json({ success: true, data: serializeRecipe(menuItem.toObject(), recipe.toObject()) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "This menu item already has a recipe" });
    next(error);
  }
};
