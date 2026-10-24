// Selection hints only. The server validates/converts every actual quantity.
export const preparationQuantityLabel = (value, unit = "") => value == null || !Number.isFinite(Number(value)) ? "Unavailable" : `${new Intl.NumberFormat("en-SA", { maximumFractionDigits: 6 }).format(Number(value))}${unit ? ` ${unit}` : ""}`;
export function preparationUnits(item) {
  const compatible = { kg: ["kg", "g"], g: ["kg", "g"], L: ["L", "ml"], ml: ["L", "ml"] };
  const density = item.weightVolumeConversion;
  const extra = compatible[item.unit] && density?.enabled === true && Number.isFinite(density.gramsPerLiter) && density.gramsPerLiter > 0 ? ["kg", "g", "L", "ml"] : [];
  return [...new Set([item.unit, ...(compatible[item.unit] || []), ...extra, ...(item.purchaseUnit && Number(item.purchaseConversionFactor) > 0 ? [item.purchaseUnit] : [])])];
}
