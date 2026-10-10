import { createHash } from "node:crypto";
import { canonicalRecipeCode, pilotByCode } from "../data/recipeInstructionPilot.js";
export const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export const actorSnapshot = actor => ({ id: String(actor._id), name: actor.name, role: actor.role });
export const CHECKS = ["ingredientsUnits", "usableYield", "preparation", "assembly", "servingDelivery", "allergens", "storage", "linkedPreparations", "qualifiedLocalSafetyReview"];
export const CONTENT_FIELDS = ["name", "description", "presets", "ingredients", "preparation", "cooking", "assembly", "serving", "delivery", "storage", "allergens", "yieldNotes", "linkedPreparationCodes"];
export function objectOnly(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail(`Invalid ${label} fields.`);
}
export function text(value, label, required = false, max = 3000) {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) fail(`${label} must be ${required ? "non-empty and " : ""}at most ${max} characters.`);
  return value.trim();
}
export function requestIdentity(payload, actor) {
  const key = text(payload.requestKey, "Request key", true, 100);
  if (!/^[\w-]{8,100}$/.test(key)) fail("Provide a stable request key for retries.");
  return { key, hash: createHash("sha256").update(JSON.stringify({ actor: String(actor._id), payload })).digest("hex") };
}
export function retryMatches(row, hash) {
  if (row.requestHash !== hash) fail("Retry key was already used for a different submission.", 409);
}
export function validRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value >= Number.MAX_SAFE_INTEGER) fail("A valid exact revision is required.");
  return value;
}
export function validateContent(patch, current) {
  objectOnly(patch, CONTENT_FIELDS, "recipe content");
  const next = { ...current, ...patch };
  for (const key of ["preparation", "cooking", "assembly", "serving", "delivery", "storage", "allergens", "yieldNotes"]) {
    if (!Array.isArray(next[key]) || next[key].length > 30) fail(`Invalid ${key}.`);
    next[key] = next[key].map(value => text(value, key, true));
  }
  next.name = text(next.name, "Name", true, 180); next.description = text(next.description, "Description", false, 1500);
  if (!Array.isArray(next.presets) || !next.presets.length || next.presets.length > 2) fail("Provide one or two explicit quantity presets.");
  next.presets = next.presets.map(row => { objectOnly(row, ["key", "label"], "preset"); return { key: text(row.key, "Preset key", true, 80), label: text(row.label, "Preset label", true, 180) }; });
  if (new Set(next.presets.map(row => row.key)).size !== next.presets.length) fail("Preset keys must be unique.");
  if (!Array.isArray(next.ingredients) || (!next.ingredients.length && next.category !== "Kitchen Guides") || next.ingredients.length > 100) fail("Provide valid ingredients.");
  if (next.category === "Kitchen Guides" && next.ingredients.length) fail("Shared guides must not invent production ingredients.");
  next.ingredients = next.ingredients.map(row => {
    objectOnly(row, ["name", "quantities", "unit", "basis", "specification", "counts"], "ingredient");
    if (row.unit !== "g" || !Array.isArray(row.quantities) || row.quantities.length !== next.presets.length || row.quantities.some(n => !Number.isFinite(n) || n <= 0)) fail("Each ingredient needs positive gram quantities for every preset.");
    if (!Array.isArray(row.counts || []) || (row.counts || []).length > next.presets.length) fail("Invalid ingredient counts.");
    return { name: text(row.name, "Ingredient", true, 180), quantities: row.quantities, unit: "g", basis: text(row.basis, "Weight basis", true, 120), specification: text(row.specification || "", "Specification", false, 1500), counts: (row.counts || []).map(n => text(n, "Count", false, 180)) };
  });
  if (!Array.isArray(next.linkedPreparationCodes) || next.linkedPreparationCodes.length > 20) fail("Invalid preparation references.");
  next.linkedPreparationCodes = next.linkedPreparationCodes.map(code => { const canonical = typeof code === "string" && canonicalRecipeCode(code); if (!canonical || pilotByCode(canonical).category !== "Preparation Recipes") fail("Missing/invalid preparation reference. Select an existing preparation; optional variants require explicit review."); return canonical; });
  if (next.linkedPreparationCodes.includes(next.code) || new Set(next.linkedPreparationCodes).size !== next.linkedPreparationCodes.length) fail("Duplicate/self preparation reference.");
  return next;
}
const measure = (value, label, positive = false) => {
  objectOnly(value, ["value", "unit", "basis"], label);
  if (!Number.isFinite(value.value) || (positive ? value.value <= 0 : value.value < 0) || !["g", "servings"].includes(value.unit) || !["measured", "estimated", "untested"].includes(value.basis)) fail(`Invalid ${label} measurement.`);
  return value;
};
export function validateTrial(payload, recipe) {
  if (recipe.category === "Kitchen Guides") {
    objectOnly(payload, ["revision", "requestKey", "trialAt", "preparation", "reviewerComments", "safety", "outcome", "guideChecks"], "guide rehearsal");
    const date = new Date(payload.trialAt);
    if (typeof payload.trialAt !== "string" || !Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 60000) fail("Provide a valid rehearsal timestamp.");
    objectOnly(payload.guideChecks, ["sourceReviewed", "staffRehearsal", "localSafetyReviewed"], "guide rehearsal checks");
    if (Object.values(payload.guideChecks).some(value => typeof value !== "boolean") || !["passed", "failed", "untested"].includes(payload.safety) || !["passed", "needs_changes", "failed"].includes(payload.outcome)) fail("Invalid guide rehearsal outcomes.");
    return { kind: "guide_rehearsal", trialAt: date.toISOString(), preparation: text(payload.preparation, "Actual staff rehearsal observations", true), reviewerComments: text(payload.reviewerComments || "", "Reviewer comments"), guideChecks: payload.guideChecks, safety: payload.safety, outcome: payload.outcome };
  }
  objectOnly(payload, ["revision", "requestKey", "trialAt", "batch", "ingredients", "usableYield", "waste", "preparation", "cooking", "deviations", "taste", "texture", "portionConsistency", "presentation", "delivery", "safety", "outcome", "reviewerComments"], "trial");
  const date = new Date(payload.trialAt);
  if (typeof payload.trialAt !== "string" || !Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 60000) fail("Provide a valid trial timestamp, not a future date.");
  const record = { trialAt: date.toISOString(), batch: measure(payload.batch, "Batch", true), usableYield: payload.usableYield == null ? null : measure(payload.usableYield, "Usable yield", true), waste: payload.waste == null ? null : measure(payload.waste, "Waste") };
  if (!Array.isArray(payload.ingredients) || payload.ingredients.length !== recipe.ingredients.length) fail("Record actual quantities for every ingredient; use null for unmeasured quantities.");
  record.ingredients = payload.ingredients.map((row, index) => {
    objectOnly(row, ["index", "quantity", "brand"], "trial ingredient");
    if (row.index !== index || (row.quantity !== null && (!Number.isFinite(row.quantity) || row.quantity <= 0))) fail("Invalid actual ingredient quantity.");
    return { index, name: recipe.ingredients[index].name, quantity: row.quantity, unit: recipe.ingredients[index].unit, basis: row.quantity === null ? "untested" : "measured", brand: text(row.brand || "", "Actual brand", false, 180) };
  });
  for (const key of ["preparation", "cooking", "deviations", "reviewerComments"]) record[key] = text(payload[key] || "", key);
  for (const key of ["taste", "texture", "portionConsistency", "presentation"]) {
    const result = payload[key]; objectOnly(result, ["tested", "score", "notes"], key);
    if (typeof result.tested !== "boolean" || (result.tested ? !Number.isFinite(result.score) || result.score < 1 || result.score > 5 : result.score != null)) fail(`Invalid ${key} result; untested results must have no score.`);
    record[key] = { tested: result.tested, score: result.tested ? result.score : null, notes: text(result.notes || "", key) };
  }
  if (!["passed", "needs_changes", "failed"].includes(payload.outcome) || !["passed", "failed", "untested"].includes(payload.safety)) fail("Select valid trial and safety outcomes.");
  record.outcome = payload.outcome; record.safety = payload.safety;
  if (!Array.isArray(payload.delivery) || payload.delivery.length > 10) fail("Invalid delivery observations.");
  record.delivery = payload.delivery.map(row => {
    objectOnly(row, ["minutes", "observations"], "delivery observation");
    if (!Number.isFinite(row.minutes) || row.minutes < 0 || row.minutes > 1440) fail("Invalid tested delivery interval.");
    return { minutes: row.minutes, observations: text(row.observations, "Tested delivery observation", true) };
  });
  if (record.batch.basis !== "measured") fail("Batch size must describe the actual trial, not an estimate.");
  return record;
}
export function qualifyingTrial(record, recipe) {
  if (recipe.category === "Kitchen Guides") return record.kind === "guide_rehearsal" && record.outcome === "passed" && record.safety === "passed" && record.preparation && ["sourceReviewed", "staffRehearsal", "localSafetyReviewed"].every(key => record.guideChecks?.[key] === true);
  return record.outcome === "passed" && record.safety === "passed" && record.ingredients.every(row => row.basis === "measured") && record.usableYield?.basis === "measured" && record.preparation && (recipe.cooking.length === 0 || record.cooking) && ["taste", "texture", "portionConsistency", "presentation"].every(key => record[key].tested) && (record.taste.score + record.texture.score) / 2 >= 4 && (recipe.category !== "Main Recipes" || (record.batch.unit === "servings" && record.batch.value >= 10));
}
