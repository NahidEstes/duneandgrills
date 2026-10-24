// Authoritative server conversions. Browser choices never calculate stock.
import { metricUnits as metric, checkedQuantity, checkedBaseQuantity, recipeConversionFactor, densityEnabled } from "./recipeUnitConversion.js";
export const preparationQuantity = checkedQuantity;
export function preparationUnits(item) {
  const compatible = Object.keys(metric).filter(unit => metric[item.unit]?.[0] === metric[unit][0]);
  const extra = metric[item.unit] && densityEnabled(item) ? Object.keys(metric) : [];
  return [...new Set([item.unit, ...compatible, ...extra, ...(item.purchaseUnit && Number(item.purchaseConversionFactor) > 0 ? [item.purchaseUnit] : [])])];
}
export function preparationBaseQuantity(value, unit, item) {
  const quantity = preparationQuantity(value);
  return checkedBaseQuantity(quantity * recipeConversionFactor(unit, item).factor);
}
