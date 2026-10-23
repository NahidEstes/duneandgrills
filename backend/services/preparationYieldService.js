import Production from "../models/Production.js";
import { hasCapability, CAPABILITIES } from "../config/permissions.js";
import { assertObjectId, parsePagination, ValidationError } from "../utils/inventoryValidation.js";
import { ADMIN_DAY_MS, riyadhDateRange, startOfRiyadhDay, startOfRiyadhMonth, toRiyadhDateKey } from "../utils/adminDate.js";

const metric = { kg: ["mass", 1000], g: ["mass", 1], L: ["volume", 1000], ml: ["volume", 1] };
const positive = value => typeof value === "number" && Number.isFinite(value) && value > 0;
const round = value => Number(value.toFixed(6));

// Read-only evidence from immutable production snapshots, never today's recipe,
// purchase conversion, stock balance or prices. Incompatible units remain unknown.
export function preparationYield(record) {
  const actual = positive(record.actualQuantity) ? record.actualQuantity : null;
  const expected = positive(record.expectedQuantity) ? record.expectedQuantity : null;
  const difference = actual !== null && expected !== null ? round(actual - expected) : null;
  const result = {
    unit: record.unit || null, actualOutputQuantity: actual, expectedOutputQuantity: expected,
    outputShortfallQuantity: difference === null ? null : Math.max(0, -difference),
    outputSurplusQuantity: difference === null ? null : Math.max(0, difference),
    comparable: false, actualInputQuantity: null, expectedInputQuantity: null,
    lossQuantity: null, gainQuantity: null, yieldPercent: null, unavailableReason: null,
  };
  const unavailable = reason => ({ ...result, unavailableReason: reason });
  if (!metric[record.unit]) return unavailable("Physical loss is unavailable for count/container output units. A verified common mass or volume basis is required.");
  if (actual === null) return unavailable("Saved usable output quantity is missing or invalid.");
  const lines = record.ingredients, saved = record.recipeSnapshot?.ingredients;
  const validLine = line => line && typeof line === "object" && !Array.isArray(line);
  if (!Array.isArray(lines) || !lines.length || !Array.isArray(saved) || saved.length !== lines.length || !lines.every(validLine) || !saved.every(validLine) ||
      new Set(lines.map(line => String(line.inventoryItem))).size !== lines.length ||
      new Set(saved.map(line => String(line.inventoryItem))).size !== saved.length ||
      lines.some(line => !line.inventoryItem || !saved.some(row => String(row.inventoryItem) === String(line.inventoryItem)))) {
    return unavailable("Complete saved ingredient evidence is unavailable. Missing inputs are not treated as zero.");
  }
  const compatible = line => metric[line.unit]?.[0] === metric[record.unit][0] && positive(line.quantity);
  if (!lines.every(compatible)) return unavailable("Saved inputs and output do not share a verified mass or volume basis. Mass, volume and containers cannot be added together.");
  const sum = entries => round(entries.reduce((total, line) => total + line.quantity * metric[line.unit][1] / metric[record.unit][1], 0));
  const input = sum(lines), balance = round(input - actual);
  if (!positive(input)) return unavailable("Saved ingredient total is outside supported quantity precision.");
  return { ...result, comparable: true, actualInputQuantity: input,
    expectedInputQuantity: saved.every(compatible) && positive(record.multiplier) ? round(sum(saved) * record.multiplier) : null,
    lossQuantity: Math.max(0, balance), gainQuantity: Math.max(0, -balance),
    yieldPercent: Number((actual / input * 100).toFixed(2)),
  };
}

export function yieldReportRange(query = {}, now = new Date()) {
  const period = query.period || "today";
  const end = new Date(startOfRiyadhDay(now).getTime() + ADMIN_DAY_MS);
  let range;
  if (period === "today") range = { $gte: startOfRiyadhDay(now), $lt: end };
  else if (period === "week") range = { $gte: new Date(end.getTime() - 7 * ADMIN_DAY_MS), $lt: end };
  else if (period === "month") range = { $gte: startOfRiyadhMonth(now), $lt: end };
  else if (period === "custom") {
    if (!query.from || !query.to) throw new ValidationError("Select both From and To dates for a custom report");
    range = riyadhDateRange(query);
  } else throw new ValidationError("Unknown yield report period");
  if (range.$lt - range.$gte > 366 * ADMIN_DAY_MS) throw new ValidationError("Select a report range of at most 366 days");
  return { filter: range, period, from: toRiyadhDateKey(range.$gte), to: toRiyadhDateKey(new Date(range.$lt.getTime() - 1)), timeZone: "Asia/Riyadh" };
}

// This accumulator consumes every matching batch, independently of pagination.
// Output variance and physical loss have separate coverage; gains never offset losses.
export function summarizePreparationYields(records) {
  const groups = new Map();
  const add = record => {
    const key = `${record.recipe}:${record.unit}`, evidence = preparationYield(record);
    let group = groups.get(key);
    if (!group) {
      group = { recipe: String(record.recipe), name: record.recipeSnapshot?.name || "Preparation name unavailable", unit: record.unit,
        batches: 0, excludedReversed: 0, comparableBatches: 0, unavailableBatches: 0, outputComparableBatches: 0,
        actualInputQuantity: 0, comparableOutputQuantity: 0, lossQuantity: 0, gainQuantity: 0,
        expectedOutputQuantity: 0, actualOutputQuantity: 0, outputShortfallQuantity: 0, outputSurplusQuantity: 0 };
      groups.set(key, group);
    }
    if (record.status !== "completed") { group.excludedReversed++; return; }
    group.batches++;
    if (evidence.outputShortfallQuantity !== null) {
      group.outputComparableBatches++;
      for (const field of ["expectedOutputQuantity", "actualOutputQuantity", "outputShortfallQuantity", "outputSurplusQuantity"]) group[field] += evidence[field];
    }
    if (!evidence.comparable) { group.unavailableBatches++; return; }
    group.comparableBatches++;
    group.actualInputQuantity += evidence.actualInputQuantity;
    group.comparableOutputQuantity += evidence.actualOutputQuantity;
    group.lossQuantity += evidence.lossQuantity;
    group.gainQuantity += evidence.gainQuantity;
  };
  for (const record of records) add(record);
  return { add, result: () => [...groups.values()].map(group => ({ ...group,
    ...Object.fromEntries(["actualInputQuantity", "comparableOutputQuantity", "lossQuantity", "gainQuantity"].map(field => [field, group.comparableBatches ? round(group[field]) : null])),
    ...Object.fromEntries(["expectedOutputQuantity", "actualOutputQuantity", "outputShortfallQuantity", "outputSurplusQuantity"].map(field => [field, group.outputComparableBatches ? round(group[field]) : null])),
    yieldPercent: group.comparableBatches ? Number((group.comparableOutputQuantity / group.actualInputQuantity * 100).toFixed(2)) : null,
  })) };
}

export async function preparationYieldReport(actor, query = {}, now = new Date()) {
  if (!hasCapability(actor?.role, CAPABILITIES.INVENTORY_READ)) throw Object.assign(new ValidationError("Inventory read permission required"), { status: 403 });
  const range = yieldReportRange(query, now), { page, skip, limit } = parsePagination(query, 20);
  const filter = { preparedAt: range.filter };
  if (query.recipe) filter.recipe = assertObjectId(query.recipe, "preparation recipe");
  const summary = summarizePreparationYields([]), data = [];
  let total = 0, completed = 0, excludedReversed = 0, unavailable = 0;
  // Stream historical evidence: no selection cap or current-page-only totals.
  const cursor = Production.find(filter).select("productionNumber recipe recipeSnapshot.name recipeSnapshot.ingredients recipeSnapshot.version multiplier preparedAt status unit actualQuantity expectedQuantity ingredients.inventoryItem ingredients.quantity ingredients.unit yieldExplanation").sort({ preparedAt: -1, _id: -1 }).lean().cursor();
  try {
    for await (const record of cursor) {
      const evidence = preparationYield(record);
      summary.add(record);
      if (record.status === "completed") { completed++; if (!evidence.comparable) unavailable++; } else excludedReversed++;
      if (total >= skip && data.length < limit) data.push({ _id: record._id, productionNumber: record.productionNumber, recipe: record.recipe, recipeName: record.recipeSnapshot?.name, recipeVersion: record.recipeSnapshot?.version, preparedAt: record.preparedAt, status: record.status, yieldExplanation: record.yieldExplanation || "", yield: evidence });
      total++;
    }
  } finally { await cursor.close(); }
  return { data, summary: summary.result(), coverage: { completed, excludedReversed, unavailable },
    range: { ...range, filter: undefined }, generatedAt: now, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}
