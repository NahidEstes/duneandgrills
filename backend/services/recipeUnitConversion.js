// A recipe stores base quantities once. Configuration edits never reprice or
// reinterpret saved recipe lines, batches, or stock movements.
export const metricUnits = { kg: ["mass", 1000], g: ["mass", 1], L: ["volume", 1000], ml: ["volume", 1] };
const invalid = message => Object.assign(new Error(message), { status: 400 });
export const densityEnabled = item => item?.weightVolumeConversion?.enabled === true && Number.isFinite(item.weightVolumeConversion.gramsPerLiter) && item.weightVolumeConversion.gramsPerLiter > 0;

export function recipeConversionFactor(unit, item) {
  if (unit === item.unit) return { factor: 1 };
  if (metricUnits[unit] && metricUnits[item.unit] && metricUnits[unit][0] === metricUnits[item.unit][0]) return { factor: metricUnits[unit][1] / metricUnits[item.unit][1] };
  // Existing explicitly configured purchase conversions keep their precedence.
  if (unit === item.purchaseUnit && Number(item.purchaseConversionFactor) > 0) return { factor: Number(item.purchaseConversionFactor) };
  if (metricUnits[unit] && metricUnits[item.unit] && densityEnabled(item)) {
    const gramsPerLiter = item.weightVolumeConversion.gramsPerLiter;
    const factor = metricUnits[unit][0] === "mass"
      ? metricUnits[unit][1] / gramsPerLiter * 1000 / metricUnits[item.unit][1]
      : metricUnits[unit][1] / 1000 * gramsPerLiter / metricUnits[item.unit][1];
    return { factor, gramsPerLiter };
  }
  throw invalid(`Unsupported conversion from ${unit} to ${item.unit}. Configure a verified weight–volume conversion or an explicit purchase conversion on this stock item.`);
}

export function checkedQuantity(value) {
  if (!["number", "string"].includes(typeof value) || String(value).trim() === "" || !Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) > 1e9) throw invalid("Quantity must be a positive finite number, at most 1,000,000,000");
  return Number(value);
}
export function checkedBaseQuantity(value) {
  const result = Number(Number(value).toFixed(6));
  if (!Number.isFinite(result) || result < 0.000001 || result > 1e9) throw invalid("Converted quantity must fit the inventory's six-decimal precision");
  return result;
}

export function normalizeRecipeQuantity({ quantity, enteredUnit, item, previous, baseKey = "quantity", reapplyConversion, expectedGramsPerLiter, requireReview = false }) {
  const enteredQuantity = checkedQuantity(quantity);
  if (reapplyConversion !== undefined && typeof reapplyConversion !== "boolean") throw invalid("Apply current conversion must be an explicit boolean");
  const unchanged = previous && previous.unit === item.unit && enteredUnit === (previous.enteredUnit || previous.unit) && enteredQuantity === Number(previous.enteredQuantity ?? previous[baseKey]);
  if (unchanged && !reapplyConversion) {
    return { quantity: previous[baseKey], enteredQuantity, enteredUnit, ...(previous.conversionSnapshot ? { conversionSnapshot: previous.conversionSnapshot.toObject?.() || previous.conversionSnapshot } : {}) };
  }
  const conversionSnapshot = recipeConversionFactor(enteredUnit, item);
  if (requireReview && conversionSnapshot.gramsPerLiter && expectedGramsPerLiter !== conversionSnapshot.gramsPerLiter) throw Object.assign(invalid("Weight–volume conversion changed or has not been reviewed. Refresh the conversion and review before saving."), { status: 409 });
  return { quantity: checkedBaseQuantity(enteredQuantity * conversionSnapshot.factor), enteredQuantity, enteredUnit, conversionSnapshot };
}
