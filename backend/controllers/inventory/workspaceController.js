import InventoryItem from "../../models/InventoryItem.js";
import mongoose from "mongoose";
import InventoryBatch from "../../models/InventoryBatch.js";
import InventoryRecipe from "../../models/InventoryRecipe.js";
import AddOnInventoryRecipe from "../../models/AddOnInventoryRecipe.js";
import PreparationRecipe from "../../models/PreparationRecipe.js";
import { readStockBreakdown } from "../../services/inventoryWorkspaceService.js";
import { inventoryUsability, hasSaleableBatchQuality } from "../../services/inventoryEligibilityService.js";
import { assertObjectId, escapeRegex, parsePagination, ValidationError } from "../../utils/inventoryValidation.js";
import { hasCapability, CAPABILITIES } from "../../config/permissions.js";

const handle = work => async (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  try { res.json({ success: true, ...await work(req) }); } catch (error) { next(error); }
};
const itemFor = async id => {
  assertObjectId(id, "item");
  const item = await InventoryItem.findById(id).populate("category", "name").populate("supplier", "name code phone contactPerson").lean();
  if (!item) throw Object.assign(new ValidationError("Inventory item not found"), { status: 404 });
  return item;
};
export const itemWorkspace = handle(async req => {
  const item = await itemFor(req.params.id);
  const breakdown = await readStockBreakdown(item);
  return { data: { item: { ...item, saleableStock: breakdown.saleableStock }, breakdown, generatedAt: new Date(), canWrite: hasCapability(req.user.role, CAPABILITIES.INVENTORY_WRITE), canApprove: hasCapability(req.user.role, CAPABILITIES.INVENTORY_COUNT_APPROVE) } };
});
export const itemOptions = handle(async req => {
  const { page, limit, skip } = parsePagination(req.query, 20);
  const filter = req.query.includeInactive === "true" ? {} : { isActive: true }, search = String(req.query.search || "").trim().slice(0, 120);
  if (search) { const value = new RegExp(escapeRegex(search), "i"); filter.$or = ["name", "sku", "preferredBrand", "storageLocation"].map(key => ({ [key]: value })); }
  const type = req.query.recipeType;
  if (type && !["raw", "prepared", "all"].includes(type)) throw new ValidationError("Unknown ingredient type");
  const definitions = type && type !== "all" ? await PreparationRecipe.distinct("finishedItem") : null;
  if (definitions) filter._id = type === "prepared" ? { $in: definitions } : { $nin: definitions };
  const [data, total] = await Promise.all([InventoryItem.find(filter).select("name sku unit purchaseUnit purchaseConversionFactor tracksExpiry currentStock unitCost supplier category preferredBrand storageLocation isActive").populate("category", "name").sort({ name: 1, _id: 1 }).skip(skip).limit(limit).lean(), InventoryItem.countDocuments(filter)]);
  const prepared = new Set((await PreparationRecipe.distinct("finishedItem", { finishedItem: { $in: data.map(item => item._id) } })).map(String));
  return { data: data.map(item => ({ ...item, recipeType: prepared.has(String(item._id)) ? "prepared" : "raw" })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
});
export const itemBatches = handle(async req => {
  const item = await itemFor(req.params.id), { page, limit, skip } = parsePagination(req.query, 10);
  const filter = { item: item._id };
  if (req.query.status !== "all") filter.remainingQuantity = { $gt: 0 };
  const [rows, total] = await Promise.all([InventoryBatch.find(filter).sort({ fefoDate: 1, receivedAt: 1, _id: 1 }).skip(skip).limit(limit).lean(), InventoryBatch.countDocuments(filter)]);
  return { data: rows.map(batch => ({ ...batch, usability: hasSaleableBatchQuality(batch) ? inventoryUsability(batch, item) : batch.qualityStatus || "unknown_quality" })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
});
export const itemUsage = handle(async req => {
  await itemFor(req.params.id);
  const { page, limit, skip } = parsePagination(req.query, 10), type = req.query.type || "preparation";
  const models = { preparation: PreparationRecipe, menu: InventoryRecipe, addon: AddOnInventoryRecipe }, model = models[type];
  if (!model) throw new ValidationError("Unknown recipe type");
  const itemId = new mongoose.Types.ObjectId(req.params.id);
  const filter = type === "preparation" ? { $or: [{ finishedItem: itemId }, { "ingredients.inventoryItem": itemId }] } : { "ingredients.inventoryItem": itemId };
  let query = model.find(filter).sort({ _id: 1 }).skip(skip).limit(limit);
  if (type === "menu") query = query.populate("menuItem", "name");
  if (type === "addon") query = query.populate("addOn", "name");
  const [rows, total] = await Promise.all([query.lean(), model.countDocuments(filter)]);
  return { data: rows.map(row => ({ _id: row._id, name: row.name || row.menuItem?.name || row.addOn?.name || "Name unavailable", isActive: row.isActive, doNotTrack: row.doNotTrack || false, relation: String(row.finishedItem) === req.params.id ? "Finished output" : "Ingredient", href: type === "preparation" ? "/inventory/preparation-recipes" : "/inventory/recipes" })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
});
