import PreparationRecipe from "../../models/PreparationRecipe.js";
import Production from "../../models/Production.js";
import InventoryItem from "../../models/InventoryItem.js";
import InventoryBatch from "../../models/InventoryBatch.js";
import { previewProduction, confirmProduction, savePreparationRecipe, productionDetails, reverseProduction } from "../../services/preparationService.js";
import { assertObjectId, escapeRegex, parsePagination, ValidationError } from "../../utils/inventoryValidation.js";
import { riyadhDateRange, startOfRiyadhDay, ADMIN_DAY_MS } from "../../utils/adminDate.js";

const handle = work => async (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  try { res.json({ success: true, ...await work(req) }); } catch (error) { next(error); }
};
export const preparationOptions = handle(async () => {
  const [items, recipes] = await Promise.all([
    InventoryItem.find({ isActive: true }).select("name sku unit purchaseUnit purchaseConversionFactor tracksExpiry currentStock").sort({ name: 1 }).limit(10001).lean(),
    PreparationRecipe.find({}).sort({ name: 1 }).limit(1001).lean(),
  ]);
  if (items.length > 10000 || recipes.length > 1000) throw new ValidationError("Preparation selection is too large; contact an administrator to review configuration");
  return { data: { items, recipes } };
});
export const listPreparationRecipes = handle(async req => {
  const { page, skip, limit } = parsePagination(req.query, 20), filter = {};
  if (req.query.search) filter.name = new RegExp(escapeRegex(String(req.query.search).slice(0, 120)), "i");
  if (req.query.status && req.query.status !== "all") {
    if (!["active", "inactive"].includes(req.query.status)) throw new ValidationError("Unknown recipe status");
    filter.isActive = req.query.status === "active";
  }
  const [data, total] = await Promise.all([PreparationRecipe.find(filter).sort({ name: 1, _id: 1 }).skip(skip).limit(limit).lean(), PreparationRecipe.countDocuments(filter)]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
});
export const savePreparation = handle(async req => ({ data: await savePreparationRecipe(req.user, req.body, req.params.id) }));
export const previewPreparation = handle(async req => ({ data: await previewProduction(req.user, req.body) }));
export const confirmPreparation = handle(async req => ({ data: await confirmProduction(req.user, req.body) }));
export const getProduction = handle(async req => ({ data: await productionDetails(req.user, req.params.id) }));
export const findProductionRequest = handle(async req => {
  if (!/^[\w-]{16,100}$/.test(req.params.key)) throw new ValidationError("Invalid request key");
  const record = await Production.findOne({ idempotencyKey: req.params.key, preparedBy: req.user._id }).select("_id productionNumber").lean();
  return { data: record };
});
export const reversePreparation = handle(async req => ({ data: await reverseProduction(req.user, req.params.id, req.body) }));
export const listProduction = handle(async req => {
  const { page, skip, limit } = parsePagination(req.query, 20), filter = {};
  if (req.query.recipe) filter.recipe = assertObjectId(req.query.recipe, "preparation recipe");
  if (req.query.status && req.query.status !== "all") {
    if (!["completed", "reversed"].includes(req.query.status)) throw new ValidationError("Unknown production status");
    filter.status = req.query.status;
  }
  if (req.query.from || req.query.to) filter.preparedAt = riyadhDateRange(req.query);
  if (req.query.search) { const value = new RegExp(escapeRegex(String(req.query.search).slice(0, 120)), "i"); filter.$or = [{ productionNumber: value }, { "recipeSnapshot.name": value }, { actorName: value }]; }
  const now = new Date(), today = startOfRiyadhDay(now);
  const [rows, total, summary] = await Promise.all([
    Production.find(filter).sort({ preparedAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    Production.countDocuments(filter),
    Production.aggregate([{ $match: filter }, { $lookup: { from: InventoryBatch.collection.name, localField: "finishedBatch", foreignField: "_id", as: "batch" } }, { $set: { batch: { $first: "$batch" } } }, { $group: { _id: "$unit", completedBatches: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } }, remaining: { $sum: { $ifNull: ["$batch.remainingQuantity", 0] } }, missingBatches: { $sum: { $cond: [{ $eq: [{ $ifNull: ["$batch", null] }, null] }, 1, 0] } }, producedToday: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "completed"] }, { $gte: ["$preparedAt", today] }, { $lt: ["$preparedAt", new Date(today.getTime() + ADMIN_DAY_MS)] }] }, "$actualQuantity", 0] } }, expiringBatches: { $sum: { $cond: [{ $and: [{ $gt: ["$batch.remainingQuantity", 0] }, { $gte: ["$batch.expiryDate", today] }, { $lt: ["$batch.expiryDate", new Date(today.getTime() + 3 * ADMIN_DAY_MS)] }] }, 1, 0] } } } }]),
  ]);
  const batches = await InventoryBatch.find({ _id: { $in: rows.map(row => row.finishedBatch) } }).select("remainingQuantity qualityStatus expiryDate").lean();
  const data = rows.map(row => ({ ...row, remainingQuantity: batches.find(batch => String(batch._id) === String(row.finishedBatch))?.remainingQuantity ?? null }));
  return { data, summary, generatedAt: now, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
});
