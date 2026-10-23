import InventoryRecipe from "../models/InventoryRecipe.js";
import AddOnInventoryRecipe from "../models/AddOnInventoryRecipe.js";
import InventoryItem from "../models/InventoryItem.js";
import MenuItem from "../models/MenuItem.js";
import MenuAddOn from "../models/MenuAddOn.js";
import PreparationRecipe from "../models/PreparationRecipe.js";
import AuditLog from "../models/AuditLog.js";
import { hasCapability, CAPABILITIES } from "../config/permissions.js";
import { assertObjectId, ValidationError, parsePagination, escapeRegex } from "../utils/inventoryValidation.js";
import { runInventoryTransaction } from "./inventoryStockService.js";
import { preparationBaseQuantity, preparationQuantity } from "./preparationUnits.js";
import { recipeReadiness, attachRecipeSaleableStock } from "./recipeReadinessService.js";
import { calculateRecipeCosts } from "./recipeCostService.js";
import { getSaleableInventory } from "./inventoryEligibilityService.js";
import { recordAuditLog } from "./auditLogService.js";
import { savedId } from "./preparationHistoryService.js";

const settings = {
  menu: { catalog: MenuItem, model: InventoryRecipe, key: "menuItem", quantity: "quantityPerSale", entity: "InventoryRecipe", prefix: "INVENTORY_RECIPE" },
  addon: { catalog: MenuAddOn, model: AddOnInventoryRecipe, key: "addOn", quantity: "quantityPerAddOn", entity: "AddOnInventoryRecipe", prefix: "ADD_ON_RECIPE" },
};
const config = kind => { if (!settings[kind]) throw new ValidationError("Unknown recipe type"); return settings[kind]; };
const permission = (actor, capability) => { if (!hasCapability(actor?.role, capability)) throw Object.assign(new ValidationError("Inventory permission required"), { status: 403 }); };
const conflict = message => Object.assign(new ValidationError(message), { status: 409 });
const fields = "name sku unit unitCost currentStock isActive purchaseUnit purchaseConversionFactor tracksExpiry expiryDate";
const populate = { path: "ingredients.inventoryItem", select: fields };
export const sellingRecipeRevision = recipe => recipe ? `${recipe._id}:${recipe.__v ?? 0}:${new Date(recipe.updatedAt || 0).getTime()}` : null;
const snapshot = (recipe, quantityField) => recipe ? { revision: sellingRecipeRevision(recipe), doNotTrack: recipe.doNotTrack === true, isActive: recipe.isActive !== false, ingredients: recipe.ingredients.map(line => ({ inventoryItem: String(line.inventoryItem?._id || line.inventoryItem), name: line.inventoryItem?.name || line.name || null, quantity: line[quantityField], unit: line.unit, enteredQuantity: line.enteredQuantity ?? null, enteredUnit: line.enteredUnit ?? null, isActive: line.isActive !== false })) } : null;

export function serializeSellingRecipe(kind, catalog, recipe) {
  const cfg = config(kind), readiness = recipeReadiness(recipe, cfg.quantity);
  const costs = calculateRecipeCosts({ ingredients: (recipe?.ingredients || []).map(line => ({ ...line, quantityPerSale: line[cfg.quantity] })), sellingPrice: catalog.price, doNotTrack: recipe?.doNotTrack === true });
  const costed = recipe ? { ...recipe, ingredients: recipe.ingredients.map((line, index) => ({ ...line, ...costs.lines[index], referenceUnitCost: line.inventoryItem?.unitCost ?? null })) } : null;
  return { ...catalog, recipe: costed, ...(kind === "addon" ? { inventoryRecipe: costed } : {}), recipeStatus: readiness.status, recipeIssue: readiness.issue, recipeRevision: sellingRecipeRevision(recipe), metrics: { ...costs, ingredientCost: costs.totalEstimatedIngredientCost, sellingPrice: costs.sellingPrice, margin: costs.profitMargin } };
}

export async function getSellingRecipe(kind, id, { session = null } = {}) {
  const cfg = config(kind); assertObjectId(id, "recipe target");
  let query = cfg.catalog.findById(id).session(session);
  if (kind === "menu") query = query.populate("categoryRef", "name slug");
  const catalog = await query.lean();
  const recipe = await cfg.model.findOne({ [cfg.key]: id }).populate(populate).populate("updatedBy", "name").session(session).lean();
  if (!catalog) throw Object.assign(new ValidationError("Recipe target not found"), { status: 404 });
  await attachRecipeSaleableStock([recipe], { session });
  return serializeSellingRecipe(kind, catalog, recipe);
}

export async function listSellingRecipes(kind, query = {}, { all = false, session = null } = {}) {
  const cfg = config(kind), { page, limit, skip } = parsePagination(query, 20), filter = {};
  const search = String(query.search || "").trim().slice(0, 120);
  if (search) { const regex = new RegExp(escapeRegex(search), "i"); filter.$or = [{ name: regex }, ...(kind === "menu" ? [{ category: regex }] : [])]; }
  if (query.status && !["configured", "not_configured", "do_not_track"].includes(query.status)) throw new ValidationError("Unknown recipe status");
  let catalogQuery = cfg.catalog.find(filter).sort({ name: 1, _id: 1 }).session(session);
  if (kind === "menu") catalogQuery = catalogQuery.populate("categoryRef", "name slug");
  const catalog = await catalogQuery.lean();
  const recipes = await cfg.model.find({ [cfg.key]: { $in: catalog.map(row => row._id) } }).populate(populate).populate("updatedBy", "name").session(session).lean();
  await attachRecipeSaleableStock(recipes, { session });
  const map = new Map(recipes.map(row => [String(row[cfg.key]), row]));
  const rows = catalog.map(row => serializeSellingRecipe(kind, row, map.get(String(row._id))));
  const summary = { total: rows.length, configured: 0, notConfigured: 0, doNotTrack: 0, coveredSalesValue: 0, totalSalesValue: 0, coverageBasis: "configured_menu_prices_not_sales" };
  for (const row of rows) {
    summary[row.recipeStatus === "configured" ? "configured" : row.recipeStatus === "do_not_track" ? "doNotTrack" : "notConfigured"]++;
    summary.totalSalesValue += Number(row.price || 0);
    if (row.recipeStatus === "configured") summary.coveredSalesValue += Number(row.price || 0);
  }
  summary.costCoverage = summary.totalSalesValue ? Number((summary.coveredSalesValue / summary.totalSalesValue * 100).toFixed(1)) : 0;
  const filtered = query.status ? rows.filter(row => row.recipeStatus === query.status) : rows;
  return { data: all ? filtered : filtered.slice(skip, skip + limit), summary, pagination: { page, limit, total: filtered.length, pages: Math.ceil(filtered.length / limit) }, currency: "SAR" };
}

async function normalize(kind, body, existing, session = null) {
  const cfg = config(kind);
  for (const key of ["doNotTrack", "isActive"]) if (body[key] !== undefined && typeof body[key] !== "boolean") throw new ValidationError(`${key === "doNotTrack" ? "Do Not Track" : "Active status"} must be an explicit boolean setting`);
  const doNotTrack = body.doNotTrack === true;
  const lines = doNotTrack ? [] : body.ingredients;
  if (!Array.isArray(lines) || (!doNotTrack && !lines.length) || lines.length > 100) throw new ValidationError("Add between 1 and 100 ingredients or explicitly enable Do Not Track");
  const ids = lines.map((line, index) => { if (!line || typeof line !== "object") throw new ValidationError(`Invalid ingredient ${index + 1}`); return String(assertObjectId(line.inventoryItem, "ingredient")); });
  if (new Set(ids).size !== ids.length) throw new ValidationError("A recipe cannot contain duplicate ingredients");
  const items = await InventoryItem.find({ _id: { $in: ids } }).select(fields).session(session).lean();
  const previous = new Set((existing?.ingredients || []).map(row => String(row.inventoryItem?._id || row.inventoryItem)));
  return { doNotTrack, isActive: body.isActive !== false, ingredients: lines.map((line, index) => {
    const item = items.find(row => String(row._id) === ids[index]);
    if (!item) throw new ValidationError(`Ingredient ${index + 1} no longer exists. Remove or replace it.`);
    if (!item.isActive && !previous.has(ids[index])) throw new ValidationError("Inactive inventory items cannot be newly added");
    if (line.isActive !== undefined && typeof line.isActive !== "boolean") throw new ValidationError("Ingredient active status must be boolean");
    const entered = Object.hasOwn(line, "quantity") || Object.hasOwn(line, "enteredUnit");
    const enteredUnit = entered ? line.enteredUnit : item.unit;
    const enteredQuantity = preparationQuantity(entered ? line.quantity : line[cfg.quantity] ?? (kind === "addon" ? line.quantityPerSale : undefined));
    const quantity = preparationBaseQuantity(enteredQuantity, enteredUnit, item);
    return { inventoryItem: item._id, [cfg.quantity]: quantity, unit: item.unit, enteredQuantity, enteredUnit, isActive: line.isActive !== false, _item: item };
  }) };
}

export async function saveSellingRecipe(actor, kind, id, body, correlationId = "") {
  permission(actor, CAPABILITIES.INVENTORY_WRITE);
  const cfg = config(kind); assertObjectId(id, "recipe target");
  if (!body || typeof body !== "object") throw new ValidationError("Provide recipe details");
  // Validate flags before revision so malformed legacy requests remain actionable.
  if (body.doNotTrack !== undefined && typeof body.doNotTrack !== "boolean") throw new ValidationError("Do Not Track must be an explicit boolean setting");
  if (!Object.hasOwn(body, "expectedRevision")) throw Object.assign(new ValidationError("Reload the recipe and send its expectedRevision before saving."), { status: 428 });
  try { return await runInventoryTransaction(async session => {
    // Metadata read intentionally uses no transaction session. First-write CAS
    // requires the database's unique target index, including non-stock recipes.
    const indexes = await cfg.model.collection.indexes();
    if (!indexes.some(index => index.unique && Object.keys(index.key).length === 1 && index.key[cfg.key] === 1 && !index.partialFilterExpression && !index.sparse)) throw Object.assign(new ValidationError("Recipe uniqueness index is unavailable. Restore the unique target index before saving."), { status: 503 });
    const catalog = await cfg.catalog.findById(id).session(session).lean();
    const existing = await cfg.model.findOne({ [cfg.key]: id }).session(session).lean();
    if (!catalog) throw new ValidationError("Recipe target not found");
    if (body.expectedRevision !== sellingRecipeRevision(existing)) throw conflict("Recipe changed. Reload the saved version or copy it into a new draft; your draft has not been overwritten.");
    const normalized = await normalize(kind, body, existing, session);
    if (normalized.doNotTrack && !existing?.doNotTrack && (body.confirmDoNotTrack !== true || typeof body.reason !== "string" || body.reason.trim().length < 5)) throw new ValidationError("Confirm Do Not Track and explain why tracking is being disabled using at least 5 characters.");
    if (body.reason != null && (typeof body.reason !== "string" || body.reason.length > 500)) throw new ValidationError("Audit reason must be text up to 500 characters");
    const ingredients = normalized.ingredients.map(({ _item, ...row }) => row);
    const values = { ...normalized, ingredients, updatedBy: actor._id };
    let saved;
    if (!existing) [saved] = await cfg.model.create([{ ...values, [cfg.key]: id }], { session });
    else {
      const guard = { _id: existing._id, ...(existing.updatedAt ? { updatedAt: existing.updatedAt } : { updatedAt: { $exists: false } }), $or: [{ __v: existing.__v ?? 0 }, ...(existing.__v == null ? [{ __v: { $exists: false } }] : [])] };
      saved = await cfg.model.findOneAndUpdate(guard, { $set: values, $inc: { __v: 1 } }, { session, new: true, runValidators: true });
      if (!saved) throw conflict("Recipe changed. Review its latest version before saving.");
    }
    if (kind === "menu") {
      await InventoryItem.updateMany({ menuItems: id }, { $pull: { menuItems: id } }, { session });
      if (ingredients.length) await InventoryItem.updateMany({ _id: { $in: ingredients.map(row => row.inventoryItem) } }, { $addToSet: { menuItems: id } }, { session });
    }
    const populated = await cfg.model.findById(saved._id).populate(populate).populate("updatedBy", "name").session(session).lean();
    await recordAuditLog({ actor, action: `${cfg.prefix}_${existing ? "UPDATED" : "CREATED"}`, entityType: cfg.entity, entityId: saved._id, entityLabel: catalog.name, correlationId, before: snapshot(existing, cfg.quantity), after: snapshot(populated, cfg.quantity), reason: body.reason?.trim() || "", related: { [cfg.key]: String(id) } }, { session });
    await attachRecipeSaleableStock([populated], { session });
    return serializeSellingRecipe(kind, catalog, populated);
  }, { requireTransaction: true }); } catch (error) { if (error.code === 11000) throw conflict("A recipe was created concurrently. Reload before saving your draft."); throw error; }
}

export async function previewSellingRecipe(actor, body) {
  permission(actor, CAPABILITIES.INVENTORY_READ);
  const cfg = config(body?.kind); assertObjectId(body.id, "recipe target");
  const catalog = await cfg.catalog.findById(body.id).lean();
  if (!catalog) throw new ValidationError("Recipe target not found");
  const existing = await cfg.model.findOne({ [cfg.key]: body.id }).lean();
  const normalized = await normalize(body.kind, body, existing);
  const portions = Object.hasOwn(body, "portions") ? preparationQuantity(body.portions) : 1;
  if (!Number.isSafeInteger(portions) || portions < 1 || portions > 1000000) throw new ValidationError("Choose between 1 and 1,000,000 whole portions");
  const mapped = normalized.ingredients.map(line => ({ ...line, inventoryItem: line._item }));
  const cost = calculateRecipeCosts({ ingredients: mapped.map(line => ({ ...line, quantityPerSale: line[cfg.quantity] })), sellingPrice: catalog.price, doNotTrack: normalized.doNotTrack });
  const readiness = recipeReadiness({ ...normalized, ingredients: mapped }, cfg.quantity);
  const requirements = new Map();
  const add = (item, quantity, origin) => {
    const key = String(item._id), old = requirements.get(key);
    const sum = Number(((old?.quantityPerPortion || 0) + quantity).toFixed(6));
    if (!Number.isFinite(sum) || sum * portions > 1e9) throw new ValidationError("Planned requirement exceeds the supported quantity range");
    requirements.set(key, { item, quantityPerPortion: sum, origins: [...(old?.origins || []), origin] });
  };
  if (readiness.status === "configured") for (const row of mapped.filter(row => row.isActive)) add(row._item, row[cfg.quantity], catalog.name);
  const selectedAddOns = body.addOns || [];
  if (!Array.isArray(selectedAddOns) || selectedAddOns.length > 40 || (body.kind !== "menu" && selectedAddOns.length)) throw new ValidationError("Choose add-ons only for a menu recipe");
  const selectedIds = new Set();
  for (const selected of selectedAddOns) {
    if (!selected || typeof selected !== "object") throw new ValidationError("Invalid selected add-on");
    assertObjectId(selected.id, "add-on");
    if (selectedIds.has(String(selected.id))) throw new ValidationError("Duplicate selected add-on");
    selectedIds.add(String(selected.id));
    const quantity = preparationQuantity(selected.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) throw new ValidationError("Choose 1–100 of each add-on per portion");
    const addon = await MenuAddOn.findOne({ _id: selected.id, isActive: true, menuItems: catalog._id }).lean();
    const recipe = addon && await AddOnInventoryRecipe.findOne({ addOn: addon._id }).populate(populate).lean();
    const ready = recipeReadiness(recipe, "quantityPerAddOn");
    if (!addon || ready.status === "not_configured") throw new ValidationError(`Selected add-on is unavailable or has no valid recipe: ${addon?.name || selected.id}`);
    if (ready.status === "configured") for (const line of ready.ingredients) add(line.inventoryItem, line.quantityPerAddOn * quantity, addon.name);
  }
  const definitions = await PreparationRecipe.find({ finishedItem: { $in: [...requirements.keys()] } }).select("name finishedItem version isActive").lean();
  const ingredients = await Promise.all([...requirements.values()].map(async row => {
    const stock = await getSaleableInventory(row.item), required = Number((row.quantityPerPortion * portions).toFixed(6));
    const usable = row.item.isActive ? stock.saleableStock : 0;
    const capacity = Math.floor(Math.round(usable * 1e6) / Math.round(row.quantityPerPortion * 1e6));
    return { inventoryItem: String(row.item._id), name: row.item.name, unit: row.item.unit, quantityPerPortion: row.quantityPerPortion, required, physicalStock: stock.physicalStock, usable, shortage: Number(Math.max(0, required - usable).toFixed(6)), capacity, origins: row.origins, preparation: definitions.find(recipe => String(recipe.finishedItem) === String(row.item._id)) || null };
  }));
  const available = readiness.status !== "not_configured" && ingredients.length ? Math.min(...ingredients.map(row => row.capacity)) : null;
  return { generatedAt: new Date(), recipeRevision: sellingRecipeRevision(existing), readiness: readiness.status, issue: readiness.issue, portions, scope: selectedAddOns.length ? "menu_with_selected_addons" : body.kind === "menu" ? "menu_only" : "addon_only", portionsAvailable: available, limitingIngredients: available == null ? [] : ingredients.filter(row => row.capacity === available).map(row => row.name), ingredients, normalizedIngredients: normalized.ingredients.map(({ _item, ...row }) => row), metrics: cost };
}

export async function sellingRecipeHistory(actor, kind, id, query = {}) {
  permission(actor, CAPABILITIES.AUDIT_READ);
  const cfg = config(kind); assertObjectId(id, "recipe target");
  const recipe = await cfg.model.findOne({ [cfg.key]: id }).select("_id").lean();
  const { page, skip, limit } = parsePagination(query, 10);
  if (!recipe) return { data: [], pagination: { page, limit, total: 0, pages: 0 } };
  const filter = { entityType: cfg.entity, entityId: recipe._id };
  const [data, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).select("actorName actorRole action createdAt before after reason changedFields").lean(), AuditLog.countDocuments(filter)]);
  return { data: data.map(row => ({ ...row, before: sellingHistorySnapshot(row.before, cfg.quantity), after: sellingHistorySnapshot(row.after, cfg.quantity) })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export function sellingHistorySnapshot(source, quantityField) {
  if (!source || !Array.isArray(source.ingredients)) return null;
  return {
    revision: source.revision || null, doNotTrack: source.doNotTrack, isActive: source.isActive,
    ingredients: source.ingredients.map(line => ({
      inventoryItem: savedId(line.inventoryItem?._id || line.inventoryItem),
      name: line.name || line.inventoryItem?.name || null,
      quantity: line.quantity ?? line[quantityField] ?? null, unit: line.unit || null,
      enteredQuantity: line.enteredQuantity ?? null, enteredUnit: line.enteredUnit || null,
      isActive: line.isActive,
    })),
  };
}

export function recipeCsv(rows, kind) {
  const cell = value => { let text = String(value ?? ""); if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text; return `"${text.replaceAll('"', '""')}"`; };
  const heading = ["Type", "Item", "Category", "Status", "Selling price SAR", "Estimated ingredient cost SAR", "Known partial cost SAR", "Cost confidence", "Estimated ingredient contribution SAR", "Ingredient margin %", "Quantity basis", "Ingredients (base units)"];
  return "\uFEFF" + [heading, ...rows.map(row => [kind, row.name, row.categoryRef?.name || row.category || "", row.recipeStatus, row.price, row.metrics.totalEstimatedIngredientCost, row.metrics.knownEstimatedIngredientCost, row.metrics.costConfidence, row.metrics.estimatedProfit, row.metrics.profitMargin, "per sale/add-on; current reference costs; not historical order cost", row.recipe?.ingredients.map(line => `${line.inventoryItem?.name || "Item unavailable"}: ${line[kind === "menu" ? "quantityPerSale" : "quantityPerAddOn"]} ${line.unit}${line.isActive === false ? " (inactive)" : ""}`).join("; ") || ""])].map(row => row.map(cell).join(",")).join("\r\n");
}
