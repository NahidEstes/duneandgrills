import { preparationBaseQuantity, preparationQuantity } from "./preparationUnits.js";
import { ValidationError } from "../utils/inventoryValidation.js";

export const DEFAULT_VARIANCE_THRESHOLD = 10;
export function varianceThreshold(value = DEFAULT_VARIANCE_THRESHOLD) {
  if (!["number", "string"].includes(typeof value) || String(value).trim() === "" || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100) {
    throw new ValidationError("Production variance threshold must be between 0 and 100 percent");
  }
  return Number(value);
}

export function outputVariance(expected, actual, threshold = DEFAULT_VARIANCE_THRESHOLD) {
  const limit = varianceThreshold(threshold);
  const difference = Number((actual - expected).toFixed(6));
  const percent = difference / expected * 100;
  return { calculationVersion: "output-variance-v1", thresholdPercent: limit, percent, direction: difference < 0 ? "below" : difference > 0 ? "above" : "on_target", requiresExplanation: Math.abs(difference) > expected * limit / 100 + 1e-10 };
}

export function productionTarget(payload, recipe, finished) {
  if (payload.targetQuantity === undefined && payload.targetUnit === undefined) return { multiplier: preparationQuantity(payload.multiplier) };
  const targetBaseQuantity = preparationBaseQuantity(payload.targetQuantity, payload.targetUnit, finished);
  return {
    multiplier: preparationQuantity(targetBaseQuantity / recipe.expectedQuantity),
    target: { quantity: preparationQuantity(payload.targetQuantity), unit: payload.targetUnit, baseQuantity: targetBaseQuantity },
  };
}
