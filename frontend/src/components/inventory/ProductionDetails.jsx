"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { fetchProductionDetails, reverseProduction } from "@/src/api/inventoryApi.js";
import useInventoryResource from "./useInventoryResource.js";
import DeliveryDialog from "../admin/delivery/DeliveryDialog.jsx";
import { Badge, Button, Field, InventoryLoadError, LoadingState, textareaClass } from "./InventoryUI.jsx";
import { apiErrorMessage, formatSar } from "./inventoryUtils.js";
import { preparationQuantityLabel as formatQuantity } from "@/src/utils/preparationUnits.js";
import ProductionYieldEvidence from "./ProductionYieldEvidence.jsx";
import ProductionBatchLabel from "./ProductionBatchLabel.jsx";
import { ProductionSources } from "./ProductionStockReview.jsx";
const when = value => value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value)) : "Not recorded";
const q = (value, unit) => value == null ? "Unavailable" : formatQuantity(value, unit);
export default function ProductionDetails({ id, onClose, onChanged }) {
  const resource = useInventoryResource(() => fetchProductionDetails(id), [id]);
  const [reason, setReason] = useState(""), [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const row = resource.data;
  const [sourceId, setSourceId] = useState(null);
  const reverse = async () => {
    if (busy || !row?.canReverse || resource.error || resource.refreshing) return;
    setBusy(true); setError("");
    try { await reverseProduction(id, reason); setConfirming(false); setReason(""); await resource.reload(); onChanged(); }
    catch (failure) { setError(apiErrorMessage(failure)); }
    finally { setBusy(false); }
  };
  return <DeliveryDialog open onClose={onClose} title={row?.productionNumber || "Production details"} busy={busy}>
    <InventoryLoadError error={resource.error} onRetry={resource.reload} retained={Boolean(row)}/>
    {resource.loading ? <LoadingState/> : row && <>
      <div className="flex flex-wrap items-center gap-3"><h3 className="font-body text-xl font-semibold">{row.recipeSnapshot.name}</h3><Badge tone={row.status === "completed" ? "success" : "warning"}>{row.status === "completed" ? "Completed" : "Reversed"}</Badge></div>
      <p className="text-sm text-neutral-300">Recipe v{row.recipeSnapshot.version} · Prepared by {row.actorName || "Name unavailable"}<br/>Prepared {when(row.preparedAt)} · Use by {row.expiryDate ? when(row.expiryDate) : "Not expiry-tracked"}<br/>Asia/Riyadh</p>
      <dl className="grid grid-cols-2 gap-4 rounded-xl border border-white/10 p-4 text-sm">{[["Produced", q(row.actualQuantity, row.unit)], ["Remaining physical batch", q(row.remainingQuantity, row.unit)], ["Expected", q(row.expectedQuantity, row.unit)], ["Transferred cost", formatSar(row.totalCost)], ["Finished unit cost", `SAR ${row.unitCost} / ${row.unit}`]].map(([label, value]) => <div key={label}><dt className="text-neutral-400">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>)}</dl>
      <ProductionYieldEvidence evidence={row.yield} explanation={row.yieldExplanation} reversed={row.status === "reversed"}/>
      <p className="text-sm text-neutral-300">{row.variance ? `Output variance: ${Math.abs(row.variance.percent).toFixed(2)}% ${row.variance.direction === "on_target" ? "(on target)" : row.variance.direction + " expected"} · Saved threshold: ${row.variance.thresholdPercent}%${row.variance.requiresExplanation ? " · Explanation required for this batch" : ""}` : "Variance policy was not recorded for this historical batch."}</p>
      {row.target && <p className="text-sm text-neutral-300">Planned target: {q(row.target.quantity, row.target.unit)} · Multiplier: {formatQuantity(row.multiplier)}</p>}
      <ProductionBatchLabel record={row} disabled={Boolean(resource.error) || resource.refreshing || busy}/>
      <section className="space-y-3"><h3 className="font-body font-semibold">Saved ingredients used</h3>{row.ingredients.map(line => <article key={line.inventoryItem} className="rounded-xl border border-white/10 p-3 text-sm"><p className="flex flex-wrap justify-between gap-2"><span>{line.name}</span><span>{q(line.quantity, line.unit)} · {formatSar(line.cost)}</span></p><p className="mt-2 text-xs text-neutral-400">Expected {q(line.expectedQuantity, line.unit)} · Entered {q(line.enteredQuantity, line.enteredUnit)}</p><ul className="mt-2 space-y-1 text-xs text-neutral-400">{line.allocations.map((allocation, index) => <li key={index}>{allocation.lotNumber} · {q(allocation.quantity, line.unit)} · SAR {allocation.unitCost} / {line.unit}</li>)}</ul></article>)}</section>
      <ProductionSources sources={row.ingredientSources} onViewSource={setSourceId}/>
      {sourceId && <ProductionDetails key={sourceId} id={sourceId} onClose={() => setSourceId(null)} onChanged={() => { resource.reload().catch(() => undefined); onChanged(); }}/>}
      {row.recipeSnapshot.notes && <p className="whitespace-pre-wrap text-sm text-neutral-300">Recipe notes: {row.recipeSnapshot.notes}</p>}{row.notes && <p className="whitespace-pre-wrap text-sm text-neutral-300">Production notes: {row.notes}</p>}
      <section className="space-y-3"><h3 className="font-body font-semibold">Batch activity &amp; linked movements</h3><p className="text-xs text-neutral-400">Only recorded ledger activity. Stock movements use the item’s base unit; no estimated route or consumption is shown.</p>{row.activity.map(movement => { const allocations = movement.batchAllocations.filter(allocation => String(allocation.batch) === String(row.finishedBatch)); const amount = allocations.length ? allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) : movement.quantity; const line = row.ingredients.find(ingredient => String(ingredient.inventoryItem) === String(movement.item)); return <article key={movement._id} className="rounded-xl border border-white/10 p-3 text-sm"><p className="flex flex-wrap justify-between gap-2"><strong>{movement.transactionNumber || movement.reference}</strong><span>{movement.movementType} · {q(amount, line?.unit || row.unit)}</span></p><p className="mt-1 text-xs text-neutral-400">{when(movement.occurredAt)} · {movement.user?.name || "Actor unavailable"}</p><p className="mt-1 text-xs text-neutral-300">{movement.sourceDetails?.kind?.replaceAll("_", " ") || (movement.order ? "Order consumption / supported restoration" : "Recorded stock activity")}</p></article>; })}</section>
      {row.status === "reversed" && <p className="rounded-xl border border-amber-400/30 p-4 text-sm text-amber-200">Reversed {when(row.reversedAt)} · {row.reversalReason}</p>}
      <Button variant="secondary" disabled={busy || resource.refreshing} onClick={() => resource.reload().catch(() => undefined)}><RefreshCw size={16}/>Refresh details</Button>
      {row.canReverse && !confirming ? <Button variant="danger" disabled={busy || Boolean(resource.error)} onClick={() => setConfirming(true)}>Reverse production</Button> : row.reversalBlockedReason && <p className="text-sm text-amber-200">{row.reversalBlockedReason}</p>}
      {confirming && <section className="space-y-3 rounded-xl border border-red-400/30 p-4"><h3 className="font-body font-semibold">Confirm reversal of {row.productionNumber}</h3><p className="text-sm text-neutral-300">Remove this untouched finished batch and restore its original ingredient batches. The server rechecks dependencies atomically.</p><Field label="Reversal reason"><textarea aria-label="Reversal reason" minLength={5} maxLength={500} disabled={busy} className={textareaClass} value={reason} onChange={event => setReason(event.target.value)}/></Field><Button variant="danger" disabled={busy || reason.trim().length < 5 || Boolean(resource.error)} onClick={reverse}>{busy ? "Reversing…" : "Confirm reversal"}</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>Go back</Button></section>}
      {error && <p role="alert" className="text-sm text-red-200">{error} Refresh details before retrying.</p>}
    </>}
  </DeliveryDialog>;
}

