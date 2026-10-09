import mongoose from "mongoose";
import RecipeInstruction from "../models/RecipeInstruction.js";
import Revision from "../models/RecipeInstructionRevision.js";
import Trial from "../models/RecipeInstructionTrial.js";
import { canonicalRecipeCode } from "../data/recipeInstructionPilot.js";
import { canManageRecipeInstructions, requireRecipeManager, serializeInstruction, serializeVersion } from "./recipeInstructionService.js";
import { actorSnapshot, CHECKS, CONTENT_FIELDS, fail, objectOnly, qualifyingTrial, requestIdentity, retryMatches, text, validRevision, validateTrial } from "./recipeInstructionRules.js";
import { recordAuditLog } from "./auditLogService.js";

const resolveCode = code => { const canonical = canonicalRecipeCode(code); if (!canonical) fail("Recipe not found.", 404); return canonical; };
const serializeTrial = row => ({ id: String(row._id), code: row.code, revision: row.revision, record: row.record, actor: row.actor, createdAt: row.createdAt });
export async function recipeHistory(code, actor, query = {}) {
  const canonical = resolveCode(code);
  const before = query.before == null ? Number.MAX_SAFE_INTEGER : Number(query.before);
  if (!Number.isSafeInteger(before) || before < 1) fail("Invalid history cursor.");
  const anchor = await RecipeInstruction.findOne({ code: canonical }).lean();
  const filter = { code: canonical, revision: { $lt: before }, ...(!canManageRecipeInstructions(actor) && query.view !== "trial" ? { status: "published" } : !canManageRecipeInstructions(actor) ? { status: { $in: ["trial_required", "approved", "published"] } } : {}) };
  const rows = await Revision.find(filter).sort({ revision: -1 }).limit(21).lean();
  // Reading never creates a version/seed. Legacy draft is visible to managers until next explicit write.
  if (!rows.length && anchor && canManageRecipeInstructions(actor) && anchor.revision < before) rows.push({ content: serializeInstruction(anchor), code: canonical, revision: anchor.revision, status: anchor.status, reason: "Existing Phase 2 draft" });
  const page = rows.slice(0, 20);
  const previous = await Revision.find({ code: canonical, revision: { $in: page.map(r => r.revision - 1) } }).select("revision content").lean();
  return { rows: page.map(row => {
    const old = canManageRecipeInstructions(actor) ? previous.find(p => p.revision === row.revision - 1) : null;
    const changes = CONTENT_FIELDS.filter(key => JSON.stringify(old?.content[key]) !== JSON.stringify(row.content[key])).map(field => ({ field, before: old?.content[field] ?? null, after: row.content[field] }));
    const metadata = serializeVersion(row, anchor);
    return { revision: row.revision, status: row.status, currentPublished: metadata.currentPublished, createdAt: row.createdAt, actor: row.createdActor, reason: row.reason, restoredFrom: row.restoredFrom, approval: metadata.approval, qualifyingTrialId: metadata.qualifyingTrialId, publication: metadata.publication, dependencyPins: row.dependencyPins, changes: canManageRecipeInstructions(actor) ? changes : [] };
  }), nextBefore: rows.length > 20 ? page.at(-1).revision : null };
}
export async function recipeTrials(code, actor, query) {
  const canonical = resolveCode(code), revision = validRevision(Number(query.revision));
  const row = await Revision.findOne({ code: canonical, revision }).select("status").lean();
  if (!row || (!canManageRecipeInstructions(actor) && row.status === "draft")) fail("Trial revision unavailable.", 404);
  let cursorFilter = {};
  if (query.before != null) {
    if (typeof query.before !== "string" || query.before.length > 100) fail("Invalid trial cursor.");
    const [time, id] = query.before.split("|"); const date = new Date(time);
    if (!Number.isFinite(date.getTime()) || !mongoose.isObjectIdOrHexString(id)) fail("Invalid trial cursor.");
    cursorFilter = { $or: [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: id } }] };
  }
  const rows = await Trial.find({ code: canonical, revision, ...cursorFilter }).sort({ createdAt: -1, _id: -1 }).limit(51).lean();
  return { rows: rows.slice(0, 50).map(serializeTrial), nextBefore: rows.length > 50 ? `${rows[49].createdAt.toISOString()}|${rows[49]._id}` : null };
}
async function transaction(work) {
  const session = await mongoose.startSession(); let result;
  try { await session.withTransaction(async () => { result = await work(session); }); return result; }
  catch (error) { if (error.code === 11000 || error.name === "VersionError") fail("Concurrent workflow change; reload and retry using the same request key.", 409); throw error; }
  finally { await session.endSession(); }
}
async function latest(code, revision, session) {
  const anchor = await RecipeInstruction.findOne({ code }).session(session);
  if (!anchor || anchor.revision !== revision) fail("Revision is no longer the current working revision. Reload.", 409);
  let row = await Revision.findOne({ code, revision }).session(session);
  if (!row) [row] = await Revision.create([{ code, revision, content: serializeInstruction(anchor.toObject()), status: anchor.status, createdActor: { id: String(anchor.updatedBy), name: "Legacy author (see audit history)", role: "" }, reason: "Preserved existing Phase 2 draft", createdAt: anchor.updatedAt || anchor.createdAt }], { session });
  return { anchor, row };
}
export async function recordRecipeTrial(code, payload, actor) {
  if (!["admin", "manager", "kitchen"].includes(actor?.role)) fail("Kitchen operation permission required.", 403);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("Invalid trial payload.");
  const canonical = resolveCode(code), revision = validRevision(payload.revision), identity = requestIdentity(payload, actor);
  return transaction(async session => {
    const retry = await Trial.findOne({ code: canonical, revision, requestKey: identity.key }).session(session);
    if (retry) { retryMatches(retry, identity.hash); return serializeTrial(retry); }
    const { anchor, row } = await latest(canonical, revision, session);
    if (row.status !== "trial_required") fail("Trials may only be recorded for a Trial Required revision.", 409);
    const record = validateTrial(payload, row.content);
    const [trial] = await Trial.create([{ code: canonical, revision, requestKey: identity.key, requestHash: identity.hash, record, actor: actorSnapshot(actor) }], { session });
    // Touch aggregate to serialize trial/approval/edit races within the same transaction.
    anchor.workflowVersion += 1; anchor.updatedBy = actor._id; await anchor.save({ session });
    await recordAuditLog({ actor, action: "RECIPE_INSTRUCTION_TRIAL_RECORDED", entityType: "RecipeInstruction", entityId: anchor._id, entityLabel: `${canonical} · r${revision}`, after: serializeTrial(trial), metadata: { code: canonical, revision, requestKey: identity.key } }, { session });
    return serializeTrial(trial);
  });
}
async function dependencyPins(content, session) {
  const pins = [], visited = new Set();
  const visit = async (recipe, path, frozenPins = null) => {
    for (const code of recipe.linkedPreparationCodes) {
      if (path.includes(code)) fail("Circular preparation dependency.");
      const anchor = await RecipeInstruction.findOne({ code }).session(session);
      const pinnedRevision = frozenPins ? frozenPins.find(pin => pin.code === code)?.revision : anchor?.publishedRevision;
      const dependency = pinnedRevision && await Revision.findOne({ code, revision: pinnedRevision, status: "published" }).session(session);
      if (!dependency?.approval) fail(`${code} must be approved and published first.`);
      // Write-lock dependency aggregate; publication and review cannot read a torn graph.
      if (!visited.has(code)) { anchor.workflowVersion += 1; await anchor.save({ session }); visited.add(code); }
      if (path.length === 1) pins.push({ code, revision: dependency.revision });
      await visit(dependency.content, [...path, code], dependency.dependencyPins);
    }
  };
  await visit(content, [content.code]); return pins;
}
export async function recipeLifecycle(code, action, payload, actor) {
  requireRecipeManager(actor);
  if (!["submit", "approve", "publish"].includes(action)) fail("Invalid lifecycle action.");
  objectOnly(payload, ["revision", "workflowVersion", "requestKey", "reason", "trialId", "checklist"], "workflow");
  const canonical = resolveCode(code), revision = validRevision(payload.revision), identity = requestIdentity(payload, actor), reason = text(payload.reason, "Review reason", true);
  if (!Number.isSafeInteger(payload.workflowVersion) || payload.workflowVersion < 0) fail("Workflow version is required.");
  return transaction(async session => {
    const existing = await Revision.findOne({ code: canonical, revision }).session(session);
    const event = action === "approve" ? existing?.approval : action === "publish" ? existing?.publication : existing?.submission;
    if (event?.requestKey === identity.key) {
      retryMatches(event, identity.hash);
      return serializeVersion(existing.toObject(), await RecipeInstruction.findOne({ code: canonical }).session(session));
    }
    const { anchor, row } = await latest(canonical, revision, session);
    if (anchor.workflowVersion !== payload.workflowVersion) fail("Trial/review state changed; reload before continuing.", 409);
    const required = { submit: "draft", approve: "trial_required", publish: "approved" }[action];
    if (row.status !== required) fail(`Only ${required.replaceAll("_", " ")} recipes can ${action}.`, 409);
    const before = { status: row.status, revision };
    if (action === "submit") row.submission = { actor: actorSnapshot(actor), at: new Date(), reason, requestKey: identity.key, requestHash: identity.hash };
    if (action === "approve") {
      objectOnly(payload.checklist, CHECKS, "approval checklist");
      if (!CHECKS.every(key => payload.checklist[key] === true)) fail("Complete every review check, including qualified/local safety review.");
      if (!mongoose.isObjectIdOrHexString(payload.trialId)) fail("Select a qualifying passed trial.");
      const trial = await Trial.findOne({ _id: payload.trialId, code: canonical, revision }).session(session);
      if (!trial || !qualifyingTrial(trial.record, row.content)) fail("A qualifying passed trial for this exact revision is required: measured ingredients/yield, tested quality, safety passed, core taste/texture average >=4, and a 10-serving dish trial.");
      row.dependencyPins = await dependencyPins(row.content, session);
      row.qualifyingTrial = trial._id; row.checklist = payload.checklist;
      row.approval = { actor: actorSnapshot(actor), at: new Date(), reason, requestKey: identity.key, requestHash: identity.hash };
    }
    if (action === "publish") {
      if (!row.approval || !CHECKS.every(key => row.checklist?.[key] === true)) fail("Recorded approval is required.");
      for (const pin of row.dependencyPins) {
        if (!await Revision.exists({ code: pin.code, revision: pin.revision, status: "published", approval: { $ne: null } }).session(session)) fail(`Pinned ${pin.code} revision is not published.`);
      }
      row.publication = { actor: actorSnapshot(actor), at: new Date(), reason, requestKey: identity.key, requestHash: identity.hash };
      anchor.publishedRevision = revision;
    }
    row.status = { submit: "trial_required", approve: "approved", publish: "published" }[action];
    anchor.status = row.status; anchor.workflowVersion += 1; anchor.updatedBy = actor._id;
    await row.save({ session }); await anchor.save({ session });
    await recordAuditLog({ actor, action: `RECIPE_INSTRUCTION_${action.toUpperCase()}`, entityType: "RecipeInstruction", entityId: anchor._id, entityLabel: `${canonical} · r${revision}`, reason, before, after: { status: row.status, revision, trialId: row.qualifyingTrial ? String(row.qualifyingTrial) : null, dependencyPins: row.dependencyPins.map(p => ({ code: p.code, revision: p.revision })) } }, { session });
    return serializeVersion(row.toObject(), anchor);
  });
}
