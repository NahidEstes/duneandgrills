import AddOnInventoryRecipe from "../../models/AddOnInventoryRecipe.js";
import InventoryItem from "../../models/InventoryItem.js";
import MenuAddOn from "../../models/MenuAddOn.js";
import { recordAuditLog } from "../../services/auditLogService.js";
import { runInventoryTransaction } from "../../services/inventoryStockService.js";
import { assertObjectId, ValidationError } from "../../utils/inventoryValidation.js";

const populate = [
  { path: "addOn", select: "name price image isActive menuItems" },
  { path: "ingredients.inventoryItem", select: "name sku unit currentStock unitCost isActive" },
  { path: "updatedBy", select: "name role" },
];

const statusOf = (recipe) => recipe?.doNotTrack
  ? "do_not_track"
  : recipe?.ingredients?.length ? "configured" : "not_configured";

export const listAddOnRecipes = async (_req, res, next) => {
  try {
    const [addOns, recipes] = await Promise.all([
      MenuAddOn.find().sort({ name: 1 }).lean(),
      AddOnInventoryRecipe.find().populate(populate).lean(),
    ]);
    const byAddOn = new Map(recipes.map((row) => [String(row.addOn?._id || row.addOn), row]));
    const data = addOns.map((addOn) => {
      const recipe = byAddOn.get(String(addOn._id)) || null;
      return { ...addOn, inventoryRecipe: recipe, recipeStatus: statusOf(recipe) };
    });
    res.json({ success: true, data, summary: {
      configured: data.filter((row) => row.recipeStatus === "configured").length,
      doNotTrack: data.filter((row) => row.recipeStatus === "do_not_track").length,
      notConfigured: data.filter((row) => row.recipeStatus === "not_configured").length,
    } });
  } catch (error) { next(error); }
};

export const getAddOnRecipe = async (req, res, next) => {
  try {
    assertObjectId(req.params.addOnId, "add-on");
    const [addOn, recipe] = await Promise.all([
      MenuAddOn.findById(req.params.addOnId).lean(),
      AddOnInventoryRecipe.findOne({ addOn: req.params.addOnId }).populate(populate).lean(),
    ]);
    if (!addOn) return res.status(404).json({ success: false, message: "Add-on not found" });
    res.json({ success: true, data: { ...addOn, inventoryRecipe: recipe, recipeStatus: statusOf(recipe) } });
  } catch (error) { next(error); }
};

export const updateAddOnRecipe = async (req, res, next) => {
  try {
    assertObjectId(req.params.addOnId, "add-on");
    const result = await runInventoryTransaction(async (session) => {
      const addOn = await MenuAddOn.findById(req.params.addOnId).session(session || null);
      if (!addOn) throw new ValidationError("Add-on was not found");
      const existing = await AddOnInventoryRecipe.findOne({ addOn: addOn._id }).session(session || null).lean();
      const doNotTrack = req.body.doNotTrack === true;
      const lines = doNotTrack ? [] : req.body.ingredients;
      if (!doNotTrack && (!Array.isArray(lines) || !lines.length)) {
        throw new ValidationError("Add at least one ingredient or mark this add-on as non-stock");
      }
      const previousIds = new Set((existing?.ingredients || []).map((line) => String(line.inventoryItem)));
      const seen = new Set();
      const normalized = [];
      for (const [index, line] of (lines || []).entries()) {
        assertObjectId(line.inventoryItem, `ingredients[${index}].inventoryItem`);
        const id = String(line.inventoryItem);
        if (seen.has(id)) throw new ValidationError("An add-on recipe cannot contain duplicate ingredients");
        seen.add(id);
        const quantity = Number(line.quantityPerAddOn ?? line.quantityPerSale);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new ValidationError(`Ingredient ${index + 1} quantity must be greater than zero`);
        normalized.push({ inventoryItem: id, quantityPerAddOn: quantity, isActive: line.isActive !== false });
      }
      const items = await InventoryItem.find({ _id: { $in: [...seen] } }).select("unit isActive").session(session || null);
      if (items.length !== seen.size) throw new ValidationError("One or more inventory ingredients were not found");
      const itemMap = new Map(items.map((item) => [String(item._id), item]));
      for (const line of normalized) {
        const item = itemMap.get(String(line.inventoryItem));
        if (!item.isActive && !previousIds.has(String(item._id))) throw new ValidationError("Inactive inventory items cannot be newly added");
        line.unit = item.unit;
      }
      const recipe = await AddOnInventoryRecipe.findOneAndUpdate(
        { addOn: addOn._id },
        { $set: { ingredients: normalized, doNotTrack, isActive: req.body.isActive !== false, updatedBy: req.user._id } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) }
      );
      await recordAuditLog({
        actor: req.user,
        action: existing ? "ADD_ON_RECIPE_UPDATED" : "ADD_ON_RECIPE_CREATED",
        entityType: "AddOnInventoryRecipe",
        entityId: recipe._id,
        entityLabel: addOn.name,
        correlationId: req.correlationId,
        before: existing ? { ingredients: existing.ingredients, doNotTrack: existing.doNotTrack, isActive: existing.isActive } : null,
        after: { ingredients: recipe.ingredients, doNotTrack: recipe.doNotTrack, isActive: recipe.isActive },
        reason: String(req.body.reason || "").trim(),
        related: { addOn: addOn._id },
      }, { session });
      return recipe;
    });
    await result.populate(populate);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
};
