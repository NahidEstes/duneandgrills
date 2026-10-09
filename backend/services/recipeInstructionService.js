import mongoose from "mongoose";
import RecipeInstruction from "../models/RecipeInstruction.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import MenuItem from "../models/MenuItem.js";
import { canonicalRecipeCode, pilotByCode, RECIPE_PILOT } from "../data/recipeInstructionPilot.js";
import { recordAuditLog } from "./auditLogService.js";

export const canManageRecipeInstructions = actor => ["admin", "manager"].includes(actor?.role);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export const requireRecipeManager = actor => { if (!canManageRecipeInstructions(actor)) fail("Only Admin/Manager can review unapproved pilot drafts.", 403); };
// No approved instructions exist in this phase. Kitchen must never receive pilot drafts.
export async function listRecipeInstructions(actor) {
  if (!canManageRecipeInstructions(actor)) return [];
  const saved = await RecipeInstruction.find({ code: { $in: RECIPE_PILOT.map(row => row.code) } }).lean();
  return RECIPE_PILOT.map(pilot => serializeInstruction(saved.find(row => row.code === pilot.code) || pilot));
}
export function serializeInstruction(row) {
  // Allowlist prevents financial trial fields, actor details or incidental model fields leaking.
  const fields = ["code", "aliases", "name", "category", "description", "status", "recipeVersion", "source", "presets", "ingredients", "preparation", "cooking", "assembly", "serving", "delivery", "storage", "allergens", "yieldNotes", "warnings", "linkedPreparationCodes", "inventoryRecipe", "reviewNotes", "revision", "updatedAt"];
  return { ...Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key, row[key]])), inventoryRecipe: row.inventoryRecipe ? String(row.inventoryRecipe) : null, persisted: Boolean(row._id), servingPhoto: null };
}
export async function getRecipeInstruction(code, actor) {
  requireRecipeManager(actor);
  const canonical = canonicalRecipeCode(code);
  if (!canonical) fail("Recipe instruction not found.", 404);
  return serializeInstruction(await RecipeInstruction.findOne({ code: canonical }).lean() || pilotByCode(canonical));
}
export async function inventoryInstructionOptions(actor, search = "") {
  requireRecipeManager(actor);
  if (typeof search !== "string" || search.length > 100) fail("Recipe search must be at most 100 characters.");
  // Two bounded projected reads. No costing service or stock mutation is invoked.
  const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const menuItems = await MenuItem.find(escaped ? { name: { $regex: escaped, $options: "i" } } : {}).select("_id name").sort({ name: 1, _id: 1 }).limit(100).lean();
  const names = new Map(menuItems.map(row => [String(row._id), row.name]));
  const rows = await InventoryRecipe.find({ menuItem: { $in: menuItems.map(row => row._id) } }).select("menuItem isActive doNotTrack").sort({ _id: 1 }).limit(100).lean();
  return rows.map(row => ({ _id: row._id, name: names.get(String(row.menuItem)), isActive: row.isActive, doNotTrack: row.doNotTrack }));
}
export async function saveRecipeInstruction(code, payload, actor) {
  requireRecipeManager(actor);
  const canonical = canonicalRecipeCode(code), pilot = pilotByCode(canonical);
  if (!pilot) fail("Recipe instruction not found.", 404);
  // This phase manages draft review notes and explicit mappings, not formula approval/versioning.
  const allowed = new Set(["revision", "status", "reviewNotes", "inventoryRecipe"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some(key => !allowed.has(key))) fail("Only draft status, review notes and inventory link may be changed in this phase.");
  if (!Number.isSafeInteger(payload.revision) || payload.revision < 0 || payload.revision >= Number.MAX_SAFE_INTEGER) fail("A valid draft revision is required.");
  if (!["draft", "trial_required"].includes(payload.status)) fail("Approval is not available in this phase.");
  if (typeof payload.reviewNotes !== "string" || payload.reviewNotes.trim().length > 3000) fail("Review notes must be at most 3000 characters.");
  if (payload.inventoryRecipe != null && typeof payload.inventoryRecipe !== "string") fail("Select a valid inventory recipe.");
  const link = payload.inventoryRecipe || null;
  if (link && !mongoose.isObjectIdOrHexString(link)) fail("Select a valid inventory recipe.");
  const session = await mongoose.startSession(); let result;
  try {
    await session.withTransaction(async () => {
      if (link && !await InventoryRecipe.exists({ _id: link }).session(session)) fail("Linked inventory recipe is no longer available.");
      const existing = await RecipeInstruction.findOne({ code: canonical }).session(session);
      if ((existing?.revision || 0) !== payload.revision) fail("This draft changed. Reload before saving; your edits were not applied.", 409);
      const before = existing ? serializeInstruction(existing.toObject()) : null;
      const row = existing || new RecipeInstruction({ ...pilot, createdBy: actor._id });
      row.status = payload.status; row.reviewNotes = payload.reviewNotes.trim(); row.inventoryRecipe = link;
      row.revision = payload.revision + 1; row.updatedBy = actor._id;
      await row.save({ session });
      await recordAuditLog({ actor, action: existing ? "RECIPE_INSTRUCTION_DRAFT_UPDATED" : "RECIPE_INSTRUCTION_DRAFT_CREATED", entityType: "RecipeInstruction", entityId: row._id, entityLabel: `${row.code} · ${row.name}`, before, after: serializeInstruction(row.toObject()), metadata: { sourceManualVersion: pilot.source.manualVersion } }, { session });
      result = serializeInstruction(row.toObject());
    });
    return result;
  } catch (error) {
    if (error.code === 11000 || error.name === "VersionError") fail("This draft was saved concurrently. Reload before saving.", 409);
    throw error;
  } finally { await session.endSession(); }
}
export const recipeManualAvailability = actor => {
  requireRecipeManager(actor);
  return { available: false, version: "1.3", message: "Private manual storage is not configured. An owner-approved private storage adapter with authenticated view/download is required. The developer Downloads path is never served." };
};
