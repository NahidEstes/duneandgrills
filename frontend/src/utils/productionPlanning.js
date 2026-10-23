// Form planning hints only. The API independently converts target and actual
// quantities and computes stock availability, costs and variance policy.
const metric = { kg: ["mass", 1000], g: ["mass", 1], L: ["volume", 1000], ml: ["volume", 1] };
function conversionFactor(unit, item) {
  if (!item) throw Error("Stock item is unavailable. Refresh the recipe.");
  if (unit === item.unit) return 1;
  if (metric[unit]?.[0] && metric[unit][0] === metric[item.unit]?.[0]) return metric[unit][1] / metric[item.unit][1];
  if (unit === item.purchaseUnit && Number(item.purchaseConversionFactor) > 0) return Number(item.purchaseConversionFactor);
  throw Error("Choose a compatible unit or configure an explicit purchase conversion.");
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
  return { recipe: recipe._id, expectedVersion: recipe.version, multiplier: String(scale), outputUnit: recipe.outputUnit, actualQuantity: entered(recipe.expectedQuantity, recipe.outputUnit, recipe.finishedItem), ingredients: recipe.ingredients.map(line => ({ inventoryItem: String(line.inventoryItem), quantity: entered(line.quantity, line.enteredUnit, String(line.inventoryItem)), unit: line.enteredUnit })) };
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
