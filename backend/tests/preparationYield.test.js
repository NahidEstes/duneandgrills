import assert from "node:assert/strict";
import { test } from "node:test";
import { preparationYield, preparationYieldReport, summarizePreparationYields, yieldReportRange } from "../services/preparationYieldService.js";

const batch = (extra = {}) => ({ recipe: "tomato", recipeSnapshot: { name: "Sliced tomato", ingredients: [{ inventoryItem: "raw", quantity: 1000, unit: "g" }] },
  status: "completed", unit: "g", multiplier: 1, expectedQuantity: 900, actualQuantity: 850,
  ingredients: [{ inventoryItem: "raw", quantity: 1000, unit: "g" }], ...extra });

test("1000g raw input / 900g target / 850g usable output separates total loss and shortfall", () => {
  const actual = preparationYield(batch());
  assert.equal(actual.actualInputQuantity, 1000); assert.equal(actual.expectedInputQuantity, 1000);
  assert.equal(actual.lossQuantity, 150); assert.equal(actual.outputShortfallQuantity, 50);
  assert.equal(actual.yieldPercent, 85); assert.equal(actual.gainQuantity, 0);
  assert.equal(actual.outputSurplusQuantity, 0); assert.equal(actual.comparable, true);
  const onTarget = preparationYield(batch({ actualQuantity: 900 }));
  assert.equal(onTarget.lossQuantity, 100); assert.equal(onTarget.outputShortfallQuantity, 0, "Expected trimming loss is still visible when output hits its target");
});
test("loss converts kg/g and L/ml using saved base units, never purchase containers or density", () => {
  const source = batch({ unit: "kg", expectedQuantity: 0.9, actualQuantity: 0.85 });
  assert.equal(preparationYield(source).lossQuantity, 0.15);
  const volume = batch({ unit: "L", expectedQuantity: 0.9, actualQuantity: 0.85, ingredients: [{ inventoryItem: "raw", quantity: 1000, unit: "ml" }] });
  assert.equal(preparationYield(volume).actualInputQuantity, 1);
  for (const unit of ["ml", "bottle", "pcs", "box", undefined]) {
    const result = preparationYield(batch({ ingredients: [{ inventoryItem: "raw", quantity: 1000, unit }] }));
    assert.equal(result.comparable, false); assert.equal(result.lossQuantity, null); assert.equal(result.actualInputQuantity, null);
    assert.equal(result.outputShortfallQuantity, 50, "Output comparison is still known");
  }
  assert.equal(preparationYield(batch({ unit: "pcs" })).lossQuantity, null);
});
test("missing, duplicate, invalid and incomplete historical evidence never becomes zero loss", () => {
  for (const extra of [{ ingredients: [] }, { ingredients: null }, { ingredients: [null] }, { recipeSnapshot: { ingredients: [null] } }, { recipeSnapshot: {} }, { actualQuantity: null },
    { ingredients: [{ inventoryItem: "other", quantity: 1000, unit: "g" }] },
    { ingredients: [{ inventoryItem: "raw", quantity: null, unit: "g" }] },
    { ingredients: [{ inventoryItem: "raw", quantity: -5, unit: "g" }] },
    { ingredients: [{ inventoryItem: "raw", quantity: "1000", unit: "g" }] },
    { ingredients: [{ inventoryItem: "raw", quantity: Infinity, unit: "g" }] },
    { recipeSnapshot: { ingredients: [{ inventoryItem: "raw" }, { inventoryItem: "raw" }] }, ingredients: [{ inventoryItem: "raw", quantity: 500, unit: "g" }, { inventoryItem: "raw", quantity: 500, unit: "g" }] }]) {
    const evidence = preparationYield(batch(extra));
    assert.equal(evidence.lossQuantity, null); assert.equal(evidence.comparable, false); assert.ok(evidence.unavailableReason);
  }
  assert.equal(preparationYield(batch({ expectedQuantity: null })).outputShortfallQuantity, null);
});
test("changed actual input is not mislabelled as output shortfall; quantity gains stay visible", () => {
  const moreInput = preparationYield(batch({ ingredients: [{ inventoryItem: "raw", quantity: 1200, unit: "g" }] }));
  assert.equal(moreInput.lossQuantity, 350); assert.equal(moreInput.outputShortfallQuantity, 50);
  const gain = preparationYield(batch({ actualQuantity: 1100 }));
  assert.equal(gain.lossQuantity, 0); assert.equal(gain.gainQuantity, 100); assert.equal(gain.outputSurplusQuantity, 200); assert.equal(gain.yieldPercent, 110);
});
test("full-range summary separates units, unknown coverage, reversals, losses/gains and weighted yield", () => {
  const report = summarizePreparationYields([
    batch(), batch({ actualQuantity: 1100 }), batch({ status: "reversed" }),
    batch({ ingredients: [{ inventoryItem: "raw", quantity: 1000, unit: "ml" }] }),
    batch({ unit: "kg", actualQuantity: 0.85, expectedQuantity: 0.9 }),
    batch({ recipe: "unknown", ingredients: [] }),
    batch({ recipe: "weighted", actualQuantity: 500 }),
    batch({ recipe: "weighted", actualQuantity: 1800, ingredients: [{ inventoryItem: "raw", quantity: 2000, unit: "g" }] }),
  ]).result();
  const g = report.find(row => row.recipe === "tomato" && row.unit === "g");
  assert.equal(g.batches, 3); assert.equal(g.excludedReversed, 1); assert.equal(g.comparableBatches, 2); assert.equal(g.unavailableBatches, 1);
  assert.equal(g.lossQuantity, 150); assert.equal(g.gainQuantity, 100); assert.equal(g.actualInputQuantity, 2000);
  assert.equal(g.comparableOutputQuantity, 1950); assert.equal(g.yieldPercent, 97.5);
  assert.equal(g.outputShortfallQuantity, 100); assert.equal(g.outputSurplusQuantity, 200);
  assert.equal(report.find(row => row.recipe === "unknown").lossQuantity, null);
  assert.equal(report.find(row => row.unit === "kg").lossQuantity, 0.15);
  assert.equal(report.find(row => row.recipe === "weighted").yieldPercent, 76.67, "Ratio of sums, not average of percentages");
});
test("Riyadh date presets, inclusive custom days and bounded/invalid date ranges", () => {
  const now = new Date("2026-10-22T21:30:00Z"), today = yieldReportRange({}, now);
  assert.equal(today.from, "2026-10-23"); assert.equal(today.filter.$gte.toISOString(), "2026-10-22T21:00:00.000Z");
  assert.equal(yieldReportRange({ period: "week" }, now).from, "2026-10-17");
  assert.equal(yieldReportRange({ period: "month" }, now).from, "2026-10-01");
  assert.equal(yieldReportRange({ period: "custom", from: "2026-10-01", to: "2026-10-02" }).filter.$lt.toISOString(), "2026-10-02T21:00:00.000Z");
  for (const query of [{ period: "bad" }, { period: "custom" }, { period: "custom", from: "2026-02-30", to: "2026-03-01" }, { period: "custom", from: "2026-10-23", to: "2026-10-22" }, { period: "custom", from: "2024-01-01", to: "2026-10-22" }]) assert.throws(() => yieldReportRange(query));
});
test("report permissions are checked before reading any database", async () => {
  for (const role of ["customer", "kitchen", "cashier", "rider"]) await assert.rejects(preparationYieldReport({ role }), error => error.status === 403);
});
