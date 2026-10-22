import { createHash } from "node:crypto";
import PreparationRecipe from "../models/PreparationRecipe.js";
import Production from "../models/Production.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryBatch from "../models/InventoryBatch.js";
import StockTransaction from "../models/StockTransaction.js";
import Counter from "../models/Counter.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { assertObjectId, ValidationError } from "../utils/inventoryValidation.js";
import { preparationBaseQuantity, preparationQuantity } from "./preparationUnits.js";
import { performStockMovement, runInventoryTransaction } from "./inventoryStockService.js";
import { eligibleBatchFilter, expiryDayStart } from "./inventoryEligibilityService.js";
import { recordAuditLog } from "./auditLogService.js";

const conflict = message => Object.assign(new ValidationError(message), { status: 409 });
const number = n => Number(Number(n).toFixed(6));
const costNumber = n => Number(Number(n).toFixed(12));
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function preparationPermission(actor, capability = CAPABILITIES.INVENTORY_READ) {
  if (!hasCapability(actor?.role, capability)) throw Object.assign(new ValidationError("Inventory permission required"), { status: 403 });
}
const text = (value, max, label) => {
  if (value != null && typeof value !== "string") throw new ValidationError(`${label} must be text`);
  const result = (value || "").trim();
  if (result.length > max) throw new ValidationError(`${label} is too long`);
  return result;
};
const date = (value, label) => {
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)) throw new ValidationError(`${label} must include a timezone`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new ValidationError(`${label} is invalid`);
  return parsed;
};
// Serialize configuration graph edits and confirmation. Never use a standalone
// development fallback: multi-item conversion must always be atomic.
async function atomic(work) {
  await Counter.updateOne({ _id: "preparation-config-lock" }, { $setOnInsert: { seq: 0 } }, { upsert: true });
  return runInventoryTransaction(async session => {
    await Counter.updateOne({ _id: "preparation-config-lock" }, { $inc: { seq: 1 } }, { session });
    return work(session);
  }, { requireTransaction: true });
}

async function recipeItems(recipe, session = null) {
  const ids = [recipe.finishedItem, ...recipe.ingredients.map(row => row.inventoryItem)];
  const items = await InventoryItem.find({ _id: { $in: ids } }).session(session).lean();
  const map = new Map(items.map(item => [String(item._id), item]));
  if (ids.some(id => !map.get(String(id))?.isActive)) throw new ValidationError("A stock item is missing or inactive. Repair the preparation recipe.");
  return map;
}

export async function savePreparationRecipe(actor, payload, recipeId = null) {
  preparationPermission(actor, CAPABILITIES.INVENTORY_WRITE);
  if (recipeId) assertObjectId(recipeId, "preparation recipe");
  if (!payload || !Array.isArray(payload.ingredients) || !payload.ingredients.length || payload.ingredients.length > 40) throw new ValidationError("Provide between 1 and 40 ingredients");
  const name = text(payload.name, 120, "Recipe name"), notes = text(payload.notes, 2000, "Notes");
  if (!name) throw new ValidationError("Recipe name is required");
  assertObjectId(payload.finishedItem, "finished stock item");
  if (typeof payload.isActive !== "boolean") throw new ValidationError("Choose an active/inactive status");
  const ids = payload.ingredients.map(row => String(assertObjectId(row.inventoryItem, "ingredient")));
  if (new Set(ids).size !== ids.length) throw new ValidationError("Duplicate ingredient rows are not allowed");
  if (ids.includes(String(payload.finishedItem))) throw new ValidationError("Finished stock cannot be its own ingredient");
  return atomic(async session => {
    const old = recipeId ? await PreparationRecipe.findById(recipeId).session(session) : null;
    if (recipeId && !old) throw new ValidationError("Preparation recipe not found");
    if (old && Number(payload.expectedVersion) !== old.version) throw conflict("Recipe changed. Reload before saving.");
    if (old && String(old.finishedItem) !== String(payload.finishedItem)) throw new ValidationError("A recipe's finished stock item cannot be changed. Create another recipe instead.");
    const others = await PreparationRecipe.find(recipeId ? { _id: { $ne: recipeId } } : {}).session(session).lean();
    if (others.some(row => String(row.finishedItem) === String(payload.finishedItem))) throw new ValidationError("This finished item already has a preparation recipe");
    if (others.some(row => row.ingredients.some(line => String(line.inventoryItem) === String(payload.finishedItem)))) throw new ValidationError("This item is a raw input in another preparation. Nested preparations are not supported.");
    if (others.some(row => ids.includes(String(row.finishedItem))) || await InventoryBatch.exists({ item: { $in: ids }, source: "PRODUCTION" }).session(session)) throw new ValidationError("Use raw ingredients only. Nested preparations are not supported.");
    const map = await recipeItems({ finishedItem: payload.finishedItem, ingredients: payload.ingredients }, session);
    const finished = map.get(String(payload.finishedItem));
    const ingredients = payload.ingredients.map(row => {
      const item = map.get(String(row.inventoryItem));
      return { inventoryItem: item._id, name: item.name, enteredQuantity: preparationQuantity(row.quantity), enteredUnit: row.unit, quantity: preparationBaseQuantity(row.quantity, row.unit, item), unit: item.unit };
    });
    const saved = { name, notes, finishedItem: payload.finishedItem, outputQuantity: preparationQuantity(payload.outputQuantity), outputUnit: payload.outputUnit, expectedQuantity: preparationBaseQuantity(payload.outputQuantity, payload.outputUnit, finished), baseUnit: finished.unit, ingredients, isActive: payload.isActive, updatedBy: actor._id, version: (old?.version || 0) + 1 };
    const before = old?.toObject();
    let recipe;
    if (old) { Object.assign(old, saved); recipe = await old.save({ session }); }
    else [recipe] = await PreparationRecipe.create([saved], { session });
    await recordAuditLog({ actorId: actor._id, action: "PREPARATION_RECIPE_SAVED", entityType: "PreparationRecipe", entityId: recipe._id, entityLabel: name, before, after: recipe.toObject() }, { session });
    return recipe.toObject();
  });
}

async function productionPlan(payload, now, session = null) {
  assertObjectId(payload.recipe, "preparation recipe");
  const recipe = await PreparationRecipe.findById(payload.recipe).session(session).lean();
  if (!recipe?.isActive) throw new ValidationError("Select an active preparation recipe");
  if (recipe.version !== Number(payload.expectedVersion)) throw conflict("Preparation recipe changed. Refresh and review the recipe before confirming.");
  const multiplier = preparationQuantity(payload.multiplier), preparedAt = date(payload.preparedAt, "Prepared on");
  if (preparedAt > now) throw new ValidationError("Prepared on cannot be in the future");
  const map = await recipeItems(recipe, session), finished = map.get(String(recipe.finishedItem));
  if (finished.unit !== recipe.baseUnit) throw conflict("Finished item's base unit changed. Review the preparation recipe.");
  const expiryDate = payload.expiryDate ? date(payload.expiryDate, "Use by") : null;
  if (finished.tracksExpiry && !expiryDate) throw new ValidationError("This finished stock item requires a use-by date");
  if (expiryDate && (expiryDayStart(expiryDate) < expiryDayStart(now) || expiryDayStart(expiryDate) < expiryDayStart(preparedAt))) throw new ValidationError("Use by cannot be before preparation or already expired");
  if (!finished.tracksExpiry && expiryDate) throw new ValidationError("Enable expiry tracking on the finished stock item before assigning use-by dates");
  const actualQuantity = preparationBaseQuantity(payload.actualQuantity, payload.outputUnit, finished);
  const expectedQuantity = number(recipe.expectedQuantity * multiplier);
  preparationQuantity(expectedQuantity);
  if (!Array.isArray(payload.ingredients) || payload.ingredients.length !== recipe.ingredients.length || new Set(payload.ingredients.map(row => String(row.inventoryItem))).size !== recipe.ingredients.length) throw new ValidationError("Provide the actual quantity for each recipe ingredient exactly once");
  const ingredients = [];
  for (const line of recipe.ingredients) {
    const item = map.get(String(line.inventoryItem)), input = payload.ingredients.find(row => String(row.inventoryItem) === String(item._id));
    if (!input || item.unit !== line.unit) throw conflict("Ingredient or base unit changed. Refresh the recipe before confirming.");
    const quantity = preparationBaseQuantity(input.quantity, input.unit, item);
    const anyBatch = await InventoryBatch.exists({ item: item._id }).session(session);
    const batches = anyBatch ? await InventoryBatch.find(eligibleBatchFilter(item, now)).sort({ fefoDate: 1, receivedAt: 1, _id: 1 }).session(session).lean() : [];
    if (!anyBatch && (!item.tracksExpiry || item.expiryDate) && (!item.expiryDate || expiryDayStart(item.expiryDate) >= expiryDayStart(now))) batches.push({ _id: null, remainingQuantity: item.currentStock, unitCost: item.unitCost, expiryDate: item.expiryDate, lotNumber: `LEGACY-${item.sku}` });
    const available = number(Math.min(item.currentStock, batches.reduce((total, row) => total + row.remainingQuantity, 0)));
    let remaining = quantity;
    const allocations = [];
    for (const batch of batches) {
      const take = number(Math.min(remaining, batch.remainingQuantity));
      if (take <= 0) continue;
      if (batch.unitCost == null || !Number.isFinite(Number(batch.unitCost)) || Number(batch.unitCost) < 0) throw new ValidationError(`Historical input batch cost is unavailable for ${item.name}. Reconcile its cost before recording production; current replacement prices are not substituted.`);
      allocations.push({ batch: batch._id, quantity: take, unitCost: batch.unitCost, expiryDate: batch.expiryDate, lotNumber: batch.lotNumber });
      remaining = number(remaining - take);
    }
    ingredients.push({ inventoryItem: item._id, name: item.name, unit: item.unit, quantity, enteredQuantity: preparationQuantity(input.quantity), enteredUnit: input.unit, expectedQuantity: number(line.quantity * multiplier), available, sufficient: available >= quantity, allocations, stockVersion: item.stockVersion || 0, physicalStock: item.currentStock, cost: costNumber(allocations.reduce((total, row) => total + row.quantity * row.unitCost, 0)) });
  }
  const totalCost = costNumber(ingredients.reduce((total, row) => total + row.cost, 0));
  if (!Number.isFinite(totalCost) || !Number.isFinite(totalCost / actualQuantity)) throw new ValidationError("Production cost exceeds the supported numeric range");
  const plan = { recipe: recipe._id, recipeSnapshot: recipe, recipeVersion: recipe.version, finishedItem: finished._id, finishedName: finished.name, unit: finished.unit, multiplier, preparedAt, expiryDate, notes: text(payload.notes, 2000, "Notes"), expectedQuantity, actualQuantity, yieldDifference: number(actualQuantity - expectedQuantity), ingredients, totalCost, unitCost: costNumber(totalCost / actualQuantity), canConfirm: ingredients.every(row => row.sufficient) };
  return { ...plan, fingerprint: hash(plan) };
}

export async function previewProduction(actor, payload, now = new Date()) {
  preparationPermission(actor, CAPABILITIES.INVENTORY_WRITE);
  return productionPlan(payload, now);
}

function requestHash(payload) {
  // Stable across JSON property order and actual-ingredient row order.
  return hash({ recipe: payload.recipe, expectedVersion: payload.expectedVersion, multiplier: payload.multiplier, preparedAt: payload.preparedAt, expiryDate: payload.expiryDate || null, actualQuantity: payload.actualQuantity, outputUnit: payload.outputUnit, notes: payload.notes || "", previewFingerprint: payload.previewFingerprint, ingredients: [...(payload.ingredients || [])].map(row => [row.inventoryItem, row.quantity, row.unit]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) });
}
const replay = (record, actor, bodyHash) => {
  if (String(record.preparedBy) !== String(actor._id) || record.requestHash !== bodyHash) throw conflict("This request key belongs to different production details. Review before submitting again.");
  return record;
};
export async function confirmProduction(actor, payload, now = new Date()) {
  preparationPermission(actor, CAPABILITIES.INVENTORY_WRITE);
  if (typeof payload.idempotencyKey !== "string" || !/^[\w-]{16,100}$/.test(payload.idempotencyKey)) throw new ValidationError("A valid production request key is required");
  const bodyHash = requestHash(payload);
  const existing = await Production.findOne({ idempotencyKey: payload.idempotencyKey }).lean();
  if (existing) return replay(existing, actor, bodyHash);
  try { return await atomic(async session => {
    const same = await Production.findOne({ idempotencyKey: payload.idempotencyKey }).session(session).lean();
    if (same) return replay(same, actor, bodyHash);
    const plan = await productionPlan(payload, now, session);
    if (plan.fingerprint !== payload.previewFingerprint) throw conflict("Stock, costs or recipe changed since preview. Refresh the preview and review before confirming; do not retry the old confirmation.");
    if (!plan.canConfirm) throw conflict("Insufficient usable ingredients. Expired, quarantined, damaged and unknown-expiry stock cannot be used.");
    const [record] = await Production.create([{ ...plan, recipe: plan.recipe, preparedBy: actor._id, actorName: actor.name, idempotencyKey: payload.idempotencyKey, requestHash: bodyHash }], { session });
    const inputs = [];
    for (const line of plan.ingredients) {
      const result = await performStockMovement({ itemId: line.inventoryItem, movementType: "STOCK_OUT", quantity: line.quantity, reason: `Production ${record.productionNumber}`, reference: record.productionNumber, userId: actor._id, saleOnly: true, eligibilityNow: now, respectItemNegativeStock: false, sourceDetails: { kind: "production_input", production: record._id, recipeVersion: plan.recipeVersion } }, { session });
      inputs.push({ ...line, allocations: result.transaction.batchAllocations.toObject(), movement: result.transaction._id });
      record.movements.push(result.transaction._id);
    }
    // Recheck actual allocations, not the preview's proposed prices.
    const actualCost = costNumber(inputs.reduce((sum, line) => sum + line.allocations.reduce((total, allocation) => total + allocation.quantity * allocation.unitCost, 0), 0));
    if (Math.abs(actualCost - plan.totalCost) > 0.000001) throw conflict("Ingredient costs changed. Refresh the production preview.");
    const finished = await performStockMovement({ itemId: plan.finishedItem, movementType: "STOCK_IN", quantity: plan.actualQuantity, reason: `Production ${record.productionNumber}`, reference: record.productionNumber, userId: actor._id, unitCost: plan.unitCost, expiryDate: plan.expiryDate, lotNumber: record.productionNumber, receivedAt: plan.preparedAt, batchSource: "PRODUCTION", sourceDetails: { kind: "production_output", production: record._id, recipeVersion: plan.recipeVersion } }, { session });
    record.finishedBatch = finished.transaction.batchAllocations[0].batch;
    record.movements.push(finished.transaction._id);
    // Persist allocation/movement snapshots at creation: these fields are immutable
    // after this transaction. Mongoose immutable fields are set on initial create.
    await Production.collection.updateOne({ _id: record._id }, { $set: { ingredients: inputs, finishedBatch: record.finishedBatch, movements: record.movements } }, { session });
    await recordAuditLog({ actorId: actor._id, action: "PRODUCTION_CONFIRMED", entityType: "Production", entityId: record._id, entityLabel: record.productionNumber, after: { actualQuantity: plan.actualQuantity, totalCost: actualCost, recipeVersion: plan.recipeVersion, movements: record.movements } }, { session });
    return Production.findById(record._id).session(session).lean();
  }); } catch (error) {
    if (error.code === 11000) {
      const committed = await Production.findOne({ idempotencyKey: payload.idempotencyKey }).lean();
      if (committed) return replay(committed, actor, bodyHash);
    }
    throw error;
  }
}

async function reversalDependencyReason(record, batch, later, session = null) {
  if (!batch || !Number.isFinite(batch.remainingQuantity) || Math.abs(batch.remainingQuantity - record.actualQuantity) > 0.000001 || later) return "This batch has subsequent consumption, waste, restoration or missing batch evidence. Production cannot be safely reversed.";
  if (batch.unitCost == null || Number(batch.unitCost) !== Number(record.unitCost) || Number(batch.receivedQuantity) !== Number(record.actualQuantity)) return "Finished batch cost or original quantity changed. Inventory review is required before reversal.";
  const items = await InventoryItem.find({ _id: { $in: [record.finishedItem, ...record.ingredients.map(line => line.inventoryItem)] } }).select("unit isActive").session(session).lean();
  const itemFor = id => items.find(item => String(item._id) === String(id));
  if (itemFor(record.finishedItem)?.unit !== record.unit || !itemFor(record.finishedItem)?.isActive || record.ingredients.some(line => itemFor(line.inventoryItem)?.unit !== line.unit || !itemFor(line.inventoryItem)?.isActive)) return "A stock item is inactive, missing or has a changed base unit. Reversal requires inventory review.";
  const originals = await InventoryBatch.find({ _id: { $in: record.ingredients.flatMap(line => line.allocations.map(row => row.batch)) } }).session(session).lean();
  for (const line of record.ingredients) for (const allocation of line.allocations) {
    const source = originals.find(row => String(row._id) === String(allocation.batch) && String(row.item) === String(line.inventoryItem));
    if (!source || source.unitCost == null || Number(source.unitCost) !== Number(allocation.unitCost) || new Date(source.expiryDate || 0).getTime() !== new Date(allocation.expiryDate || 0).getTime() || !Number.isFinite(source.receivedQuantity) || !Number.isFinite(source.remainingQuantity) || source.remainingQuantity + allocation.quantity > source.receivedQuantity + 0.000001) return "Original ingredient batch cost, expiry or quantity evidence changed or is missing. Reversal requires inventory review.";
  }
  return null;
}

export async function productionDetails(actor, id) {
  preparationPermission(actor); assertObjectId(id, "production");
  const record = await Production.findById(id).lean();
  if (!record) throw Object.assign(new ValidationError("Production not found"), { status: 404 });
  const batch = await InventoryBatch.findById(record.finishedBatch).lean();
  const movements = await StockTransaction.find({ $or: [{ _id: { $in: [...record.movements, ...record.reversalMovements] } }, { "batchAllocations.batch": record.finishedBatch }] }).populate("user", "name").select("movementType quantity item user occurredAt reference transactionNumber order batchAllocations sourceDetails unitCost").sort({ createdAt: 1, _id: 1 }).lean();
  const later = movements.filter(row => !record.movements.some(value => String(value) === String(row._id)));
  const reason = record.status === "reversed" ? "Already reversed" : await reversalDependencyReason(record, batch, later.length > 0);
  const permitted = hasCapability(actor.role, CAPABILITIES.INVENTORY_COUNT_APPROVE);
  return { ...record, remainingQuantity: batch?.remainingQuantity ?? null, batch, activity: movements, canReverse: !reason && permitted, reversalBlockedReason: reason || (!permitted ? "Manager inventory approval permission required" : null) };
}

export async function reverseProduction(actor, id, payload) {
  preparationPermission(actor, CAPABILITIES.INVENTORY_COUNT_APPROVE); assertObjectId(id, "production");
  const reason = text(payload.reason, 500, "Reversal reason");
  if (reason.length < 5) throw new ValidationError("Explain the reversal using at least 5 characters");
  return atomic(async session => {
    const record = await Production.findById(id).session(session);
    if (!record) throw new ValidationError("Production not found");
    if (record.status === "reversed") return record.toObject();
    const batch = await InventoryBatch.findById(record.finishedBatch).session(session).lean();
    const later = await StockTransaction.exists({ "batchAllocations.batch": record.finishedBatch, _id: { $nin: record.movements } }).session(session);
    const dependencyReason = await reversalDependencyReason(record, batch, Boolean(later), session);
    if (dependencyReason) throw conflict(dependencyReason);
    // Exact output batch only, even if another finished batch has earlier expiry.
    const removed = await performStockMovement({ itemId: record.finishedItem, movementType: "STOCK_OUT", quantity: record.actualQuantity, targetBatchId: record.finishedBatch, respectItemNegativeStock: false, reason: `Reverse ${record.productionNumber}`, reference: record.productionNumber, userId: actor._id, sourceDetails: { kind: "production_reversal_output", production: record._id } }, { session });
    record.reversalMovements.push(removed.transaction._id);
    for (const line of record.ingredients) {
      const restored = await performStockMovement({ itemId: line.inventoryItem, movementType: "STOCK_IN", quantity: line.quantity, restoreAllocations: line.allocations, reason: `Reverse ${record.productionNumber}`, reference: record.productionNumber, userId: actor._id, sourceDetails: { kind: "production_reversal_input", production: record._id, originalDeduction: line.movement } }, { session });
      record.reversalMovements.push(restored.transaction._id);
    }
    record.status = "reversed"; record.reversedAt = new Date(); record.reversedBy = actor._id; record.reversalReason = reason;
    await record.save({ session });
    await recordAuditLog({ actorId: actor._id, action: "PRODUCTION_REVERSED", entityType: "Production", entityId: record._id, entityLabel: record.productionNumber, reason, after: { status: record.status, movements: record.reversalMovements } }, { session });
    return record.toObject();
  });
}
