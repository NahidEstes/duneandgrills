// Form planning hints only. The API independently converts target and actual
// quantities and computes stock availability, costs and variance policy.
const metric = { kg: ["mass", 1000], g: ["mass", 1], L: ["volume", 1000], ml: ["volume", 1] };
function conversionFactor(unit, item) {
  if (!item) throw Error("Stock item is unavailable. Refresh the recipe.");
  if (unit === item.unit) return 1;
  if (metric[unit]?.[0] && metric[unit][0] === metric[item.unit]?.[0]) return metric[unit][1] / metric[item.unit][1];
  if (unit === item.purchaseUnit && Number(item.purchaseConversionFactor) > 0) return Number(item.purchaseConversionFactor);
  const density = item.weightVolumeConversion;
  if (metric[unit] && metric[item.unit] && density?.enabled === true && Number.isFinite(density.gramsPerLiter) && density.gramsPerLiter > 0) return metric[unit][0] === "mass" ? metric[unit][1] / density.gramsPerLiter * 1000 / metric[item.unit][1] : metric[unit][1] / 1000 * density.gramsPerLiter / metric[item.unit][1];
  throw Error("Configure a verified weight–volume conversion on this stock item, or choose a compatible unit.");
}
export function planningBaseQuantity(value, unit, item) {
  const quantity = Number(value);
  if (!item || String(value).trim() === "" || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1e9) throw Error("Enter a positive quantity, at most 1,000,000,000.");
  const factor = conversionFactor(unit, item);
  const result = Number((quantity * factor).toFixed(6));
  if (!Number.isFinite(result) || result < 0.000001 || result > 1e9) throw Error("Quantity must fit the inventory's six-decimal precision.");
  return result;
}

export function plannedRecipeValues(recipe, multiplier, items) {
  if (!recipe) return { recipe: "", ingredients: [], multiplier, actualQuantity: "", outputUnit: "" };
  const scale = Number(multiplier);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1e9) throw Error("Enter a valid batch multiplier.");
  const entered = (quantity, unit, id) => {
    const item = items.find(row => row._id === id);
    const factor = conversionFactor(unit, item);
    const base = Number((quantity * scale).toFixed(6));
    if (!Number.isFinite(base) || base < 0.000001 || base > 1e9 || base / factor > 1e9) throw Error("Planned quantities must fit the inventory's six-decimal precision.");
    return String(base / factor);
  };
  // Production defaults use saved base quantities for density-converted lines,
  // including after that ingredient's conversion has changed or been disabled.
  const outputUnit = recipe.outputConversionSnapshot?.gramsPerLiter ? recipe.baseUnit : recipe.outputUnit;
  return { recipe: recipe._id, expectedVersion: recipe.version, multiplier: String(scale), outputUnit, actualQuantity: entered(recipe.expectedQuantity, outputUnit, recipe.finishedItem), ingredients: recipe.ingredients.map(line => {
    const unit = line.conversionSnapshot?.gramsPerLiter ? line.unit : line.enteredUnit;
    return { inventoryItem: String(line.inventoryItem), quantity: entered(line.quantity, unit, String(line.inventoryItem)), unit };
  }) };
}

export function formOutputVariance(draft, recipe, finished, threshold) {
  if (!recipe || !finished) return null;
  try {
    const expected = Number((recipe.expectedQuantity * Number(draft.multiplier)).toFixed(6));
    if (!Number.isFinite(expected) || expected <= 0) return null;
    const actual = planningBaseQuantity(draft.actualQuantity, draft.outputUnit, finished);
    const difference = Number((actual - expected).toFixed(6));
    return { percent: difference / expected * 100, direction: difference < 0 ? "below" : difference > 0 ? "above" : "on_target", thresholdPercent: threshold, requiresExplanation: Math.abs(difference) > expected * threshold / 100 + 1e-10 };
  } catch { return null; }
}
