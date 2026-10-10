import { createHash } from "node:crypto";
import RecipeInstruction from "../models/RecipeInstruction.js";
import Revision from "../models/RecipeInstructionRevision.js";
import { RECIPE_LIBRARY } from "../data/recipeInstructionPilot.js";
import { CONTENT_FIELDS, fail, validateContent } from "./recipeInstructionRules.js";
import { requireRecipeManager, saveRecipeInstruction, serializeInstruction } from "./recipeInstructionService.js";

const sourceFields = [...CONTENT_FIELDS, "code", "aliases", "category", "source", "recipeVersion", "warnings"];
export const manualRecordHash = row => createHash("sha256").update(JSON.stringify(Object.fromEntries(sourceFields.map(key => [key, row[key]])))).digest("hex");
export function validateManualCatalog(records) {
  if (!Array.isArray(records) || !records.length || records.length > 100) fail("Invalid manual catalog.");
  const identifiers = new Set();
  for (const row of records) {
    if (!RECIPE_LIBRARY.some(r => r.code === row.code) || !["draft", "trial_required"].includes(row.status)) fail("Unknown code or unsafe import status.");
    for (const code of [row.code, ...row.aliases]) {
      if (!/^[A-Z0-9-]{1,50}$/.test(code) || identifiers.has(code)) fail(`Duplicate/invalid manual code or alias: ${code}`);
      identifiers.add(code);
    }
    const canonical = RECIPE_LIBRARY.find(r => r.code === row.code);
    if (JSON.stringify(row.aliases) !== JSON.stringify(canonical.aliases) || row.category !== canonical.category) fail("Manual identity/category differs from the canonical catalog; explicit source review required.");
    if (!row.source?.manualVersion || !/^\d{4}-\d{2}-\d{2}$/.test(row.source.manualDate) || !row.source.pages?.length || row.source.pages.some(p => !Number.isInteger(p) || p < 1 || p > 29)) fail("Missing/invalid manual page provenance.");
    validateContent({}, structuredClone(row));
  }
  // Aliases are canonicalized by content validation; never persist duplicate links.
  const graph = new Map(records.map(row => [row.code, validateContent({}, structuredClone(row)).linkedPreparationCodes]));
  const visit = (code, path = []) => { if (path.includes(code)) fail("Circular manual dependency."); for (const dependency of graph.get(code) || []) { if (!graph.has(dependency)) fail(`Missing import dependency ${dependency}`); visit(dependency, [...path, code]); } };
  records.forEach(row => visit(row.code));
}

// Explicit service/CLI only. GET/read/importing a JS module never calls this.
// Each new revision + audit is atomic using the existing draft service.
export async function importRecipeManual({ actor, apply = false, records = RECIPE_LIBRARY }) {
  requireRecipeManager(actor); validateManualCatalog(records);
  const saved = await RecipeInstruction.find().lean();
  const latestImports = await Revision.find({ $or: saved.map(row => ({ code: row.code, revision: row.revision })).concat([{ code: "__none__" }]) }).lean();
  const report = { mode: apply ? "apply" : "dry-run", rows: [] };
  for (const source of records) {
    const record = validateContent({}, structuredClone(source)), hash = manualRecordHash(record);
    const anchor = saved.find(row => row.code === record.code), previous = latestImports.find(row => row.code === record.code);
    const collision = saved.find(row => row.code !== record.code && [row.code, ...row.aliases].some(code => [record.code, ...record.aliases].includes(code)));
    let action = anchor ? "new_draft_revision" : "create_draft", reason;
    if (collision || (anchor && JSON.stringify(anchor.aliases) !== JSON.stringify(record.aliases))) { action = "conflict"; reason = "Code/alias ownership differs; manual resolution required."; }
    else if (anchor && manualRecordHash(serializeInstruction(anchor)) === hash) action = "unchanged";
    else if (anchor && (!previous?.importProvenance || manualRecordHash(serializeInstruction(anchor)) !== previous.importProvenance.recordHash)) { action = "conflict"; reason = "Restaurant-specific edits or unverified legacy content; nothing overwritten."; }
    const entry = { code: record.code, pages: record.source.pages, action, ...(reason ? { reason } : {}) }; report.rows.push(entry);
    if (!apply || ["conflict", "unchanged"].includes(action)) continue;
    try {
      const provenance = { catalog: "dune-manual-structured-v1", manualFileSha256: "b1e6b46424c7a4bbbe4422e391aab064af959662707d1688f2c580daf4ddec2f", manualVersion: record.source.manualVersion, manualDate: record.source.manualDate, pages: record.source.pages, recordHash: hash, importedAt: new Date().toISOString(), actorId: String(actor._id) };
      const result = await saveRecipeInstruction(record.code, { revision: anchor?.revision || 0, workflowVersion: anchor?.workflowVersion || 0, status: "draft", reviewNotes: anchor?.reviewNotes || "", inventoryRecipe: anchor?.inventoryRecipe ? String(anchor.inventoryRecipe) : null, requestKey: `manual-${hash}-${anchor?.revision || 0}`, reason: `Explicit manual v${record.source.manualVersion} import; review and real trial required` }, actor, { record, provenance });
      entry.revision = result.revision;
    } catch (error) {
      if (error.status !== 409) throw error;
      entry.action = "conflict"; entry.reason = error.message;
    }
  }
  report.conflicts = report.rows.filter(row => row.action === "conflict").length;
  return report;
}
