// Authoritative server conversions. Browser choices never calculate stock.
const metric = { kg: ["mass", 1000], g: ["mass", 1], L: ["volume", 1000], ml: ["volume", 1] };
export const preparationQuantity = value => {
  if (!["number", "string"].includes(typeof value) || String(value).trim() === "" || !Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) > 1e9) throw Object.assign(new Error("Quantity must be a positive finite number, at most 1,000,000,000"), { status: 400 });
  return Number(value);
};
export function preparationUnits(item) {
  return [...new Set([item.unit, ...Object.keys(metric).filter(unit => metric[item.unit]?.[0] === metric[unit][0]), ...(item.purchaseUnit && Number(item.purchaseConversionFactor) > 0 ? [item.purchaseUnit] : [])])];
}
export function preparationBaseQuantity(value, unit, item) {
  const quantity = preparationQuantity(value);
  let factor;
  if (unit === item.unit) factor = 1;
  else if (metric[unit] && metric[item.unit] && metric[unit][0] === metric[item.unit][0]) factor = metric[unit][1] / metric[item.unit][1];
  else if (unit === item.purchaseUnit && Number(item.purchaseConversionFactor) > 0) factor = Number(item.purchaseConversionFactor);
  else throw Object.assign(new Error(`Unsupported conversion from ${unit} to ${item.unit}. Configure an explicit purchase conversion; mass/volume is never assumed.`), { status: 400 });
  const result = Number((quantity * factor).toFixed(6));
  if (!Number.isFinite(result) || result < 0.000001 || result > 1e9) throw Object.assign(new Error("Converted quantity must fit the inventory's six-decimal precision"), { status: 400 });
  return result;
}
