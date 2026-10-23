import PreparationRecipe from "../models/PreparationRecipe.js";
import AuditLog from "../models/AuditLog.js";
import { CAPABILITIES } from "../config/permissions.js";
import { preparationPermission } from "./preparationService.js";
import { assertObjectId, parsePagination, ValidationError } from "../utils/inventoryValidation.js";

// Older audit sanitization saved ObjectId bytes as an object. Decode only that
// exact evidence; never infer identity from an ingredient name or current recipe.
function savedId(value) {
  if (typeof value === "string" && /^[a-f\d]{24}$/i.test(value)) return value;
  if (value?.toHexString) return value.toHexString();
  const bytes = value?.buffer;
  if (bytes && Object.keys(bytes).length === 12 && Object.values(bytes).every(v => Number.isInteger(v) && v >= 0 && v <= 255)) return Array.from({ length: 12 }, (_, i) => bytes[i].toString(16).padStart(2, "0")).join("");
  return null;
}

export function recipeHistorySnapshot(source) {
  if (!source || !Number.isInteger(source.version) || typeof source.name !== "string" || !Array.isArray(source.ingredients)) return null;
  const ingredients = source.ingredients.map(line => ({ inventoryItem: savedId(line.inventoryItem), name: line.name, quantity: line.enteredQuantity, unit: line.enteredUnit }));
  if (!savedId(source.finishedItem) || !Number.isFinite(source.outputQuantity) || source.outputQuantity <= 0 || !source.outputUnit || typeof source.isActive !== "boolean" || typeof source.notes !== "string" || !ingredients.length || new Set(ingredients.map(line => line.inventoryItem)).size !== ingredients.length || ingredients.some(line => !line.inventoryItem || typeof line.name !== "string" || !Number.isFinite(line.quantity) || line.quantity <= 0 || !line.unit)) return null;
  return { version: source.version, name: source.name, finishedItem: savedId(source.finishedItem), outputQuantity: source.outputQuantity, outputUnit: source.outputUnit, notes: source.notes, isActive: source.isActive, ingredients };
}

export async function preparationHistory(actor, id, query) {
  preparationPermission(actor, CAPABILITIES.AUDIT_READ);
  assertObjectId(id, "preparation recipe");
  if (!await PreparationRecipe.exists({ _id: id })) throw Object.assign(new ValidationError("Preparation recipe not found"), { status: 404 });
  const { page, skip, limit } = parsePagination(query, 10);
  const filter = { entityType: "PreparationRecipe", entityId: id, action: "PREPARATION_RECIPE_SAVED" };
  const [records, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(), AuditLog.countDocuments(filter)]);
  return { data: records.map(row => ({ _id: row._id, actorName: row.actorName, actorRole: row.actorRole, createdAt: row.createdAt, before: recipeHistorySnapshot(row.before), after: recipeHistorySnapshot(row.after), isCreation: row.before == null && row.after?.version === 1 })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}
