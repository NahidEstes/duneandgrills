import mongoose from "mongoose";
import RecipeInstruction from "../models/RecipeInstruction.js";
import RecipeInstructionRevision from "../models/RecipeInstructionRevision.js";
import { actorSnapshot, requestIdentity, retryMatches, text, validateContent } from "./recipeInstructionRules.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import MenuItem from "../models/MenuItem.js";
import { canonicalRecipeCode, pilotByCode, RECIPE_PILOT } from "../data/recipeInstructionPilot.js";
import { recordAuditLog } from "./auditLogService.js";

export const canManageRecipeInstructions = actor => ["admin", "manager"].includes(actor?.role);
const forAudience = (row, actor) => {
  if (canManageRecipeInstructions(actor)) return row;
  const { reviewNotes, ...instruction } = row; return instruction;
};
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export const requireRecipeManager = actor => { if (!canManageRecipeInstructions(actor)) fail("Only Admin/Manager can review unapproved pilot drafts.", 403); };
// Kitchen normal view is published only; unapproved content requires an explicit trial view.
export async function listRecipeInstructions(actor, view) {
  if (view != null && !["published", "trial"].includes(view)) fail("Invalid recipe view.");
  const saved = await RecipeInstruction.find({ code: { $in: RECIPE_PILOT.map(row => row.code) } }).lean();
  const enrich = row => ({ ...row, dependencyPins: (row.dependencyPins || []).map(pin => ({ ...pin, updateAvailable: saved.find(a => a.code === pin.code)?.publishedRevision !== pin.revision })) });
  if (view === "published" || (!canManageRecipeInstructions(actor) && view !== "trial")) {
    const versions = await RecipeInstructionRevision.find({ $or: saved.filter(row => row.publishedRevision).map(row => ({ code: row.code, revision: row.publishedRevision })) .concat([{ code: "__none__" }]) }).lean();
    return versions.map(row => forAudience(enrich(serializeVersion(row, saved.find(anchor => anchor.code === row.code))), actor));
  }
  const versions = await RecipeInstructionRevision.find({ $or: saved.map(row => ({ code: row.code, revision: row.revision })).concat([{ code: "__none__" }]) }).lean();
  const latest = anchor => { const version = versions.find(row => row.code === anchor.code && row.revision === anchor.revision); return enrich(version ? serializeVersion(version, anchor) : serializeInstruction(anchor)); };
  if (!canManageRecipeInstructions(actor)) return saved.filter(row => ["trial_required", "approved"].includes(row.status)).map(row => forAudience(latest(row), actor));
  return RECIPE_PILOT.map(pilot => saved.some(row => row.code === pilot.code) ? latest(saved.find(row => row.code === pilot.code)) : serializeInstruction(pilot));
}
export function serializeInstruction(row) {
  // Allowlist prevents financial trial fields, actor details or incidental model fields leaking.
  const fields = ["code", "aliases", "name", "category", "description", "status", "recipeVersion", "source", "presets", "ingredients", "preparation", "cooking", "assembly", "serving", "delivery", "storage", "allergens", "yieldNotes", "warnings", "linkedPreparationCodes", "inventoryRecipe", "reviewNotes", "revision", "workflowVersion", "publishedRevision", "updatedAt"];
  return { ...Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key, row[key]])), inventoryRecipe: row.inventoryRecipe ? String(row.inventoryRecipe) : null, persisted: Boolean(row._id), servingPhoto: null };
}
export function serializeVersion(row, anchor) {
  const event = value => value ? { actor: value.actor, at: value.at, reason: value.reason } : null;
  return { ...serializeInstruction({ ...row.content, _id: row._id, revision: row.revision, status: row.status }), workflowVersion: anchor?.workflowVersion || 0, publishedRevision: anchor?.publishedRevision || null, approval: event(row.approval), qualifyingTrialId: row.qualifyingTrial ? String(row.qualifyingTrial) : null, publication: event(row.publication), dependencyPins: row.dependencyPins || [], currentPublished: anchor?.publishedRevision === row.revision, currentWorking: anchor?.revision === row.revision };
}
async function versionWithUpdates(row, anchor) {
  const result = serializeVersion(row, anchor);
  if (result.dependencyPins.length) {
    const current = await RecipeInstruction.find({ code: { $in: result.dependencyPins.map(pin => pin.code) } }).select("code publishedRevision").lean();
    result.dependencyPins = result.dependencyPins.map(pin => ({ code: pin.code, revision: pin.revision, updateAvailable: current.find(r => r.code === pin.code)?.publishedRevision !== pin.revision }));
  }
  return result;
}
export async function getRecipeInstruction(code, actor, query = {}) {
  if (query.view != null && !["manage", "published", "trial"].includes(query.view)) fail("Invalid recipe view.");
  const canonical = canonicalRecipeCode(code);
  if (!canonical) fail("Recipe instruction not found.", 404);
  const anchor = await RecipeInstruction.findOne({ code: canonical }).lean();
  if (query.revision != null) {
    const revision = Number(query.revision);
    if (typeof query.revision !== "string" || !Number.isSafeInteger(revision) || revision < 1) fail("Invalid revision.");
    const row = await RecipeInstructionRevision.findOne({ code: canonical, revision }).lean();
    if (!row && anchor?.revision === revision && canManageRecipeInstructions(actor)) return serializeInstruction(anchor);
    if (!row || (!canManageRecipeInstructions(actor) && row.status !== "published" && (query.view !== "trial" || !["trial_required", "approved"].includes(row.status)))) fail("Recipe revision unavailable.", 404);
    return forAudience(await versionWithUpdates(row, anchor), actor);
  }
  if (query.view === "published" || (!canManageRecipeInstructions(actor) && query.view !== "trial")) {
    if (!anchor?.publishedRevision) fail("No published recipe instructions available.", 404);
    const published = await RecipeInstructionRevision.findOne({ code: canonical, revision: anchor.publishedRevision, status: "published" }).lean();
    if (!published) fail("Published revision unavailable. Ask a manager to review the record.", 404);
    return forAudience(await versionWithUpdates(published, anchor), actor);
  }
  if (!canManageRecipeInstructions(actor) && !["trial_required", "approved"].includes(anchor?.status)) fail("Trial revision unavailable.", 404);
  const version = anchor && await RecipeInstructionRevision.findOne({ code: canonical, revision: anchor.revision }).lean();
  return forAudience(version ? await versionWithUpdates(version, anchor) : serializeInstruction(anchor || pilotByCode(canonical)), actor);
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
  // Content changes only through a new immutable revision; lifecycle approval is a separate API.
  const allowed = new Set(["revision", "status", "reviewNotes", "inventoryRecipe", "content", "workflowVersion", "requestKey", "reason", "restoreRevision"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some(key => !allowed.has(key))) fail("Only revision content, review notes, inventory link and draft/restore metadata may be changed.");
  if (!Number.isSafeInteger(payload.revision) || payload.revision < 0 || payload.revision >= Number.MAX_SAFE_INTEGER) fail("A valid draft revision is required.");
  if (payload.workflowVersion != null && (!Number.isSafeInteger(payload.workflowVersion) || payload.workflowVersion < 0)) fail("Invalid workflow version.");
  if (payload.reason != null) text(payload.reason, "Change reason");
  if (!["draft", "trial_required"].includes(payload.status)) fail("Approval/publication require their separate authorized workflow.");
  if (typeof payload.reviewNotes !== "string" || payload.reviewNotes.trim().length > 3000) fail("Review notes must be at most 3000 characters.");
  if (payload.inventoryRecipe != null && typeof payload.inventoryRecipe !== "string") fail("Select a valid inventory recipe.");
  const link = payload.inventoryRecipe || null;
  if (link && !mongoose.isObjectIdOrHexString(link)) fail("Select a valid inventory recipe.");
  const identity = payload.requestKey ? requestIdentity(payload, actor) : null;
  if ((payload.content || payload.restoreRevision) && !identity) fail("A stable retry key and change reason are required.");
  if (payload.content || payload.restoreRevision) { if (typeof payload.reason !== "string" || !payload.reason.trim() || payload.reason.length > 3000) fail("Provide a change/restore reason."); }
  const session = await mongoose.startSession(); let result;
  try {
    await session.withTransaction(async () => {
      if (link && !await InventoryRecipe.exists({ _id: link }).session(session)) fail("Linked inventory recipe is no longer available.");
      const existing = await RecipeInstruction.findOne({ code: canonical }).session(session);
      if (identity) {
        const retry = await RecipeInstructionRevision.findOne({ code: canonical, requestKey: identity.key }).session(session);
        if (retry) { retryMatches(retry, identity.hash); result = serializeVersion(retry.toObject(), existing); return; }
      }
      if ((existing?.revision || 0) !== payload.revision) fail("This draft changed. Reload before saving; your edits were not applied.", 409);
      if ((existing?.workflowVersion || 0) !== (payload.workflowVersion || 0)) fail("Workflow changed. Reload before editing.", 409);
      const before = existing ? serializeInstruction(existing.toObject()) : null;
      if (existing && !await RecipeInstructionRevision.exists({ code: canonical, revision: existing.revision }).session(session)) {
        await RecipeInstructionRevision.create([{ code: canonical, revision: existing.revision, content: before, status: existing.status, createdActor: { id: String(existing.updatedBy), name: "Legacy author (see audit history)", role: "" }, reason: "Preserved existing Phase 2 draft", createdAt: existing.updatedAt || existing.createdAt }], { session });
      }
      const row = existing || new RecipeInstruction({ ...pilot, createdBy: actor._id });
      let content = before || pilot;
      if (payload.restoreRevision != null) {
        if (!Number.isSafeInteger(payload.restoreRevision) || payload.restoreRevision < 1) fail("Invalid restore revision.");
        const restored = await RecipeInstructionRevision.findOne({ code: canonical, revision: payload.restoreRevision }).session(session);
        if (!restored) fail("Restore revision not found.", 404);
        content = restored.content;
      }
      content = validateContent(payload.content || {}, content);
      for (const key of ["name", "description", "presets", "ingredients", "preparation", "cooking", "assembly", "serving", "delivery", "storage", "allergens", "yieldNotes", "linkedPreparationCodes"]) row[key] = content[key];
      // Graph validation uses all three pilot recipes; aliases never create separate records.
      const graph = new Map(RECIPE_PILOT.map(p => [p.code, p.linkedPreparationCodes]));
      for (const saved of await RecipeInstruction.find().select("code linkedPreparationCodes").session(session).lean()) graph.set(saved.code, saved.linkedPreparationCodes);
      graph.set(canonical, row.linkedPreparationCodes);
      const visit = (key, path = []) => { if (path.includes(key)) fail("Circular preparation dependency."); for (const next of graph.get(key) || []) visit(next, [...path, key]); }; visit(canonical);
      row.status = payload.status; row.reviewNotes = payload.reviewNotes.trim(); row.inventoryRecipe = link;
      if (payload.restoreRevision != null) row.status = "draft";
      row.revision = payload.revision + 1; row.updatedBy = actor._id;
      await row.save({ session });
      await RecipeInstructionRevision.create([{ code: canonical, revision: row.revision, content: serializeInstruction(row.toObject()), status: row.status, createdActor: actorSnapshot(actor), reason: payload.reason || "Draft review saved", restoredFrom: payload.restoreRevision, ...(identity ? { requestKey: identity.key, requestHash: identity.hash } : {}) }], { session });
      await recordAuditLog({ actor, action: payload.restoreRevision ? "RECIPE_INSTRUCTION_REVISION_RESTORED" : existing ? "RECIPE_INSTRUCTION_DRAFT_UPDATED" : "RECIPE_INSTRUCTION_DRAFT_CREATED", entityType: "RecipeInstruction", entityId: row._id, entityLabel: `${row.code} · ${row.name}`, reason: payload.reason || "", before, after: serializeInstruction(row.toObject()), metadata: { code: row.code, revision: row.revision, restoredFrom: payload.restoreRevision || null, sourceManualVersion: pilot.source.manualVersion } }, { session });
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
