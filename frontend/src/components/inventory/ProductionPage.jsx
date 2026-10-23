"use client";
import { useState } from "react";
import { Factory, Plus, RefreshCw } from "lucide-react";
import { fetchPreparationOptions, fetchProduction, fetchProductionDetails, reverseProduction } from "@/src/api/inventoryApi.js";
import useInventoryResource from "./useInventoryResource.js";
import ProductionForm from "./ProductionForm.jsx";
import ProductionYieldReport from "./ProductionYieldReport.jsx";
import ProductionYieldEvidence from "./ProductionYieldEvidence.jsx";
import DeliveryDialog from "../admin/delivery/DeliveryDialog.jsx";
import DarkSelect from "../ui/DarkSelect.jsx";
import DarkDatePicker from "../ui/DarkDatePicker.jsx";
import { Badge, Button, EmptyState, Field, PageHeader, Pagination, InventoryLoadError, LoadingState, cardClass, inputClass, textareaClass } from "./InventoryUI.jsx";
import { apiErrorMessage, formatSar } from "./inventoryUtils.js";

import { preparationQuantityLabel as formatQuantity } from "@/src/utils/preparationUnits.js";

const when = value => value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value)) : "Not recorded";
const q = (value, unit) => value == null ? "Unavailable" : `${formatQuantity(value)} ${unit}`;
function ProductionDetails({ id, onClose, onChanged }) {
  const resource = useInventoryResource(() => fetchProductionDetails(id), [id]);
  const [reason, setReason] = useState(""), [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const row = resource.data;
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
      <section className="space-y-3"><h3 className="font-body font-semibold">Saved ingredients used</h3>{row.ingredients.map(line => <article key={line.inventoryItem} className="rounded-xl border border-white/10 p-3 text-sm"><p className="flex flex-wrap justify-between gap-2"><span>{line.name}</span><span>{q(line.quantity, line.unit)} · {formatSar(line.cost)}</span></p><p className="mt-2 text-xs text-neutral-400">Expected {q(line.expectedQuantity, line.unit)} · Entered {q(line.enteredQuantity, line.enteredUnit)}</p><ul className="mt-2 space-y-1 text-xs text-neutral-400">{line.allocations.map((allocation, index) => <li key={index}>{allocation.lotNumber} · {q(allocation.quantity, line.unit)} · SAR {allocation.unitCost} / {line.unit}</li>)}</ul></article>)}</section>
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

export default function ProductionPage() {
  const [view, setView] = useState("history"), [revision, setRevision] = useState(0);
  const [recording, setRecording] = useState(false), [selected, setSelected] = useState(null), [query, setQuery] = useState({ search: "", recipe: "", status: "all", page: 1, from: "", to: "" });
  const options = useInventoryResource(fetchPreparationOptions, []), history = useInventoryResource(() => fetchProduction(query), [query]);
  const reload = () => Promise.all([history.reload(), options.reload()]);
  const data = history.data, editQuery = values => setQuery(current => ({ ...current, ...values, page: 1 }));
  return <>
    <InventoryLoadError error={options.error || (view === "history" && history.error)} onRetry={reload} retained={Boolean(data)}/>
    {recording ? options.loading ? <LoadingState/> : options.data && <ProductionForm recipes={options.data.recipes} items={options.data.items} blocked={Boolean(options.error) || options.refreshing} onCancel={() => setRecording(false)} onSaved={id => { setRecording(false); setSelected(id); reload().catch(() => undefined); }}/> : <>
      <PageHeader descriptionClassName="!text-neutral-400" title="Production" description="Track prepared batches, remaining physical stock and preparation yield." actions={<><Button variant="secondary" disabled={history.refreshing || options.refreshing} onClick={() => { setRevision(value => value + 1); reload().catch(() => undefined); }}><RefreshCw size={16}/>Refresh</Button><Button disabled={options.loading || Boolean(options.error)} onClick={() => setRecording(true)}><Plus size={16}/>Record production</Button></>}/>
      <nav aria-label="Production views" className="mb-5 flex flex-wrap gap-2"><Button variant={view === "history" ? "primary" : "secondary"} aria-pressed={view === "history"} onClick={() => setView("history")}>Production history</Button><Button variant={view === "yield" ? "primary" : "secondary"} aria-pressed={view === "yield"} onClick={() => setView("yield")}>Yield / Loss Report</Button></nav>
      {view === "yield" ? <ProductionYieldReport recipes={options.data?.recipes || []} revision={revision} onViewBatch={setSelected}/> : <>
      {data?.generatedAt && <p className="mb-4 text-xs text-neutral-400">Last updated {when(data.generatedAt)} · Asia/Riyadh · summaries follow these filters</p>}
      {data?.summary?.length > 0 && <div className="mb-5 grid gap-3 sm:grid-cols-3">{data.summary.map(row => <article key={row._id} className={`${cardClass} p-4`}><Factory className="mb-3 h-5 w-5 text-dune-amber"/><h2 className="font-body font-semibold">Stock summary · {row._id}</h2><p className="mt-2 text-xl font-semibold text-white">{q(row.remaining, row._id)}</p><p className="mt-2 text-xs text-neutral-400">Physical remaining · Produced today: {q(row.producedToday, row._id)}<br/>{row.completedBatches} completed batches · {row.expiringBatches} expiring within 3 days</p>{row.missingBatches > 0 && <p className="mt-2 text-xs text-amber-200">{row.missingBatches} missing batch records; remaining total is incomplete.</p>}</article>)}</div>}
      <div className={`${cardClass} mb-5 grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5`}><Field label="Search batch or preparation"><input className={inputClass} value={query.search} onChange={event => editQuery({ search: event.target.value })}/></Field><Field label="Preparation"><DarkSelect aria-label="Preparation" className={inputClass} value={query.recipe} onChange={event => editQuery({ recipe: event.target.value })}><option value="">All preparations</option>{options.data?.recipes.map(recipe => <option key={recipe._id} value={recipe._id}>{recipe.name}</option>)}</DarkSelect></Field><Field label="Production status"><DarkSelect aria-label="Production status" className={inputClass} value={query.status} onChange={event => editQuery({ status: event.target.value })}><option value="all">All statuses</option><option value="completed">Completed</option><option value="reversed">Reversed</option></DarkSelect></Field><Field label="From date"><DarkDatePicker aria-label="From date" value={query.from} onChange={event => editQuery({ from: event.target.value })}/></Field><Field label="To date"><DarkDatePicker aria-label="To date" value={query.to} onChange={event => editQuery({ to: event.target.value })}/></Field></div>
      <section className={`${cardClass} p-4 sm:p-5`}><h2 className="mb-4 font-body text-xl font-semibold text-white">Production History</h2>{history.loading ? <LoadingState/> : history.error && !data ? <p role="status" className="p-4 text-sm text-amber-200">Production history is unavailable. Retry to verify records.</p> : !data?.data?.length ? <EmptyState title="No production recorded" description="Create a preparation recipe, then record its actual production. Filters may hide existing records."/> : <div className="space-y-3">{data.data.map(row => <article key={row._id} className="grid min-w-0 items-center gap-4 rounded-xl border border-white/10 bg-black/10 p-4 md:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]">
        <div className="min-w-0"><p className="break-all font-semibold text-white">{row.productionNumber}</p><p className="mt-1 text-sm text-neutral-300">{row.recipeSnapshot.name}</p><p className="mt-1 text-xs text-neutral-400">{row.actorName || "Actor unavailable"} · {when(row.preparedAt)}<br/>Use by: {row.expiryDate ? when(row.expiryDate) : "Not expiry-tracked"}</p></div><dl className="grid grid-cols-2 gap-3 text-sm md:contents"><div><dt className="text-xs text-neutral-400">Produced</dt><dd className="mt-1">{q(row.actualQuantity, row.unit)}</dd></div><div><dt className="text-xs text-neutral-400">Remaining batch</dt><dd className="mt-1">{q(row.remainingQuantity, row.unit)}</dd></div></dl><div className="flex flex-wrap items-center gap-3 md:flex-col"><Badge tone={row.status === "completed" ? "success" : "warning"}>{row.status === "completed" ? "Completed" : "Reversed"}</Badge><Button variant="secondary" className="min-h-11" onClick={() => setSelected(row._id)}>View batch</Button></div>
      </article>)}</div>}<Pagination pagination={data?.pagination} onPageChange={page => setQuery({ ...query, page })}/></section>
      </>}
    </>}
    {selected && <ProductionDetails key={selected} id={selected} onClose={() => setSelected(null)} onChanged={() => { setRevision(value => value + 1); history.reload().catch(() => undefined); }}/>}
  </>;
}
