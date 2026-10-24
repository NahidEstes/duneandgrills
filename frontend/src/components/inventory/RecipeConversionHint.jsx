import { planningBaseQuantity } from "@/src/utils/productionPlanning.js";
import { preparationQuantityLabel as q } from "@/src/utils/preparationUnits.js";

export function savedConversionApplies(line, previous, unitKey = "unit") {
  return previous && !line.reapplyConversion && line[unitKey] === (previous.enteredUnit || previous.unit) && Number(line.quantity) === Number(previous.enteredQuantity ?? previous.quantity);
}

export default function RecipeConversionHint({ line, item, previous, normalized, unitKey = "unit", onReapply, disabled }) {
  if (!item || !line[unitKey]) return null;
  const saved = previous?.unit === item.unit && savedConversionApplies(line, previous, unitKey);
  let usage, error;
  try { usage = normalized?.quantity ?? (saved ? previous.quantity : planningBaseQuantity(line.quantity, line[unitKey], item)); }
  catch (failure) { error = failure.message; }
  const oldDensity = previous?.conversionSnapshot?.gramsPerLiter;
  const config = item.weightVolumeConversion;
  const changed = oldDensity && (!config?.enabled || oldDensity !== config.gramsPerLiter);
  return <div className="space-y-2 text-xs leading-relaxed text-neutral-400">
    {usage != null && <p>Stock usage: ≈ {q(usage, item.unit)}{saved ? " · saved quantity" : " · validated when saved"}</p>}
    {error && Number(line.quantity) > 0 && <p role="alert" className="text-amber-200">{error}</p>}
    {changed && <p className="text-amber-200">Saved conversion: 1 L = {q(oldDensity, "g")}. {config?.enabled ? `Current conversion: 1 L = ${q(config.gramsPerLiter, "g")}.` : "Conversion is currently disabled."} Saved quantities stay unchanged unless explicitly updated.</p>}
    {changed && config?.enabled && onReapply && <label className="flex min-h-10 items-center gap-2 text-neutral-300"><input type="checkbox" disabled={disabled} checked={line.reapplyConversion === true} onChange={event => onReapply(event.target.checked)} className="h-4 w-4 accent-amber-500" />Apply current conversion to this quantity</label>}
  </div>;
}
