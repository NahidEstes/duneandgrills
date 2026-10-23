import { preparationQuantityLabel as quantity } from "@/src/utils/preparationUnits.js";

export const yieldReportNotice = "Informational only. Ingredients are deducted once during production; this report creates no extra stock deduction, Waste entry or expense. Later waste of finished stock is recorded separately.";

export default function ProductionYieldEvidence({ evidence, explanation, reversed = false, preview = false }) {
  if (!evidence) return <p className="text-sm text-amber-200">Yield evidence is unavailable. Refresh details to verify this batch.</p>;
  const metrics = [
    ["Expected usable output", quantity(evidence.expectedOutputQuantity, evidence.unit)],
    ["Actual usable output", quantity(evidence.actualOutputQuantity, evidence.unit)],
    ["Output below expected", quantity(evidence.outputShortfallQuantity, evidence.unit)],
    ["Output above expected", quantity(evidence.outputSurplusQuantity, evidence.unit)],
  ];
  if (evidence.comparable) metrics.push(
    ["Actual ingredient input", quantity(evidence.actualInputQuantity, evidence.unit)],
    ["Total preparation loss", quantity(evidence.lossQuantity, evidence.unit)],
    ["Recorded quantity gain", quantity(evidence.gainQuantity, evidence.unit)],
    ["Usable yield", `${evidence.yieldPercent}%`],
  );
  return <section aria-label="Preparation yield evidence" className="space-y-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.035] p-4">
    <h3 className="font-body font-semibold text-white">Preparation yield / loss{preview ? " preview" : ""}</h3>
    {reversed && <p className="text-sm text-amber-200">Reversed batch · excluded from report totals. Original recorded evidence remains visible.</p>}
    <dl className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">{metrics.map(([label, value]) => <div key={label}><dt className="text-xs text-neutral-400">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-white">{value}</dd></div>)}</dl>
    {!evidence.comparable && <p role="note" className="text-sm text-amber-200">Physical loss unavailable. {evidence.unavailableReason}</p>}
    <p className="text-xs leading-5 text-neutral-300">Total preparation loss = actual input − usable output, on a compatible mass or volume basis. A quantity gain is shown separately. Output below expected compares the recipe’s saved output target with actual output; it is a different measure.</p>
    {!preview && <p className="whitespace-pre-wrap break-words text-sm text-neutral-300">Yield explanation: {explanation || "Not recorded"}</p>}
    <p className="text-xs leading-5 text-neutral-400">{yieldReportNotice}</p>
  </section>;
}
