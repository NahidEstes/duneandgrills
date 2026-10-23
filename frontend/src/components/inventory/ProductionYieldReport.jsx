"use client";
import { useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { fetchPreparationYieldReport } from "@/src/api/inventoryApi.js";
import { preparationQuantityLabel as quantity } from "@/src/utils/preparationUnits.js";
import useInventoryResource from "./useInventoryResource.js";
import ProductionYieldEvidence, { yieldReportNotice } from "./ProductionYieldEvidence.jsx";
import DarkSelect from "../ui/DarkSelect.jsx";
import DarkDatePicker from "../ui/DarkDatePicker.jsx";
import { Badge, Button, Field, LoadingState, InventoryLoadError, Pagination, cardClass, inputClass } from "./InventoryUI.jsx";

const when = value => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value));
export default function ProductionYieldReport({ recipes, revision, onViewBatch }) {
  const [query, setQuery] = useState({ period: "today", recipe: "", from: "", to: "", page: 1 });
  const ready = query.period !== "custom" || Boolean(query.from && query.to);
  const resource = useInventoryResource(() => ready ? fetchPreparationYieldReport(query) : Promise.resolve(null), [query, revision]);
  const data = resource.data;
  const edit = values => setQuery(current => ({ ...current, ...values, page: 1 }));
  return <section className="space-y-5" aria-label="Preparation Yield / Loss Report" aria-busy={resource.refreshing}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-body text-xl font-semibold text-white">Preparation Yield / Loss Report</h2><Button variant="secondary" disabled={!ready || resource.refreshing} onClick={() => resource.reload({ silent: true }).catch(() => undefined)}><RefreshCw size={16}/>{resource.refreshing ? "Refreshing…" : "Refresh report"}</Button></div>
    <p className="max-w-4xl text-sm leading-6 text-neutral-300">{yieldReportNotice} Figures use saved production quantities, not today’s recipe or prices. Loss measures recorded quantity difference, not a separate waste write-off.</p>
    <div className={`${cardClass} grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4`}>
      <Field label="Report period"><DarkSelect aria-label="Report period" className={inputClass} value={query.period} onChange={event => edit({ period: event.target.value })}><option value="today">Today</option><option value="week">Last 7 days</option><option value="month">This month</option><option value="custom">Custom dates</option></DarkSelect></Field>
      <Field label="Report preparation"><DarkSelect aria-label="Report preparation" className={inputClass} value={query.recipe} onChange={event => edit({ recipe: event.target.value })}><option value="">All preparations</option>{recipes.map(recipe => <option key={recipe._id} value={recipe._id}>{recipe.name}</option>)}</DarkSelect></Field>
      {query.period === "custom" && <><Field label="Report from date"><DarkDatePicker aria-label="Report from date" value={query.from} onChange={event => edit({ from: event.target.value })}/></Field><Field label="Report to date"><DarkDatePicker aria-label="Report to date" value={query.to} onChange={event => edit({ to: event.target.value })}/></Field></>}
    </div>
    <InventoryLoadError label="yield report" error={resource.error} retained={Boolean(data)} onRetry={() => resource.reload({ silent: true })}/>
    {!ready ? <p role="status" className="text-sm text-amber-200">Select both dates to load a custom report (maximum 366 days, Asia/Riyadh).</p> : resource.loading ? <LoadingState label="Loading yield report…"/> : data ? <>
      <p className="text-xs text-neutral-400">{data.range.from} – {data.range.to} · Asia/Riyadh · Last updated {when(data.generatedAt)}. Totals cover all matching batches, across every page.</p>
      <div className={`${cardClass} flex flex-wrap gap-x-6 gap-y-2 p-4 text-sm`}><span>{data.coverage.completed} completed batches</span><span>{data.coverage.excludedReversed} reversed batches excluded</span><span className={data.coverage.unavailable ? "text-amber-200" : "text-neutral-300"}>{data.coverage.unavailable} completed batches without comparable physical loss</span></div>
      {!data.summary.length && <p role="status" className={`${cardClass} p-6 text-sm text-neutral-300`}>No production batches in this date range and preparation filter.</p>}
      <div className="grid items-start gap-4 lg:grid-cols-2">{data.summary.map(group => <article key={`${group.recipe}:${group.unit}`} className={`${cardClass} min-w-0 space-y-4 p-4 sm:p-5`}>
        <h3 className="break-words font-body text-lg font-semibold text-white">{group.name} · {group.unit}</h3>
        <p className="text-xs text-neutral-400">{group.batches} completed · {group.excludedReversed} reversed excluded. Each batch uses its own saved recipe version. Different output units stay separate.</p>
        <dl className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 text-sm">{[
          ["Actual ingredient input", quantity(group.actualInputQuantity, group.unit)],
          ["Comparable usable output", quantity(group.comparableOutputQuantity, group.unit)],
          ["Total preparation loss", quantity(group.lossQuantity, group.unit)],
          ["Recorded quantity gain", quantity(group.gainQuantity, group.unit)],
          ["Usable yield (weighted)", group.yieldPercent === null ? "Unavailable" : `${group.yieldPercent}%`],
          ["Expected usable output", quantity(group.expectedOutputQuantity, group.unit)],
          ["Actual usable output", quantity(group.actualOutputQuantity, group.unit)],
          ["Output below expected", quantity(group.outputShortfallQuantity, group.unit)],
          ["Output above expected", quantity(group.outputSurplusQuantity, group.unit)],
        ].map(([label, value]) => <div key={label}><dt className="text-xs text-neutral-400">{label}</dt><dd className="mt-1 break-words font-semibold text-white">{value}</dd></div>)}</dl>
        <p className="text-xs leading-5 text-neutral-300">Physical totals cover {group.comparableBatches} of {group.batches} completed batches. Yield = comparable output ÷ comparable input. Losses and gains are added separately, without netting. Output comparisons cover {group.outputComparableBatches} of {group.batches} completed batches; shortfalls and surpluses are also separate.</p>
        {group.unavailableBatches > 0 && <p className="flex items-start gap-2 text-sm text-amber-200"><TriangleAlert aria-hidden size={18} className="mt-0.5 shrink-0"/>Incomplete physical-loss coverage: {group.unavailableBatches} batches have incompatible units or missing evidence. Their loss is unknown, not zero.</p>}
      </article>)}</div>
      <section className={`${cardClass} space-y-4 p-4 sm:p-5`}><h3 className="font-body text-lg font-semibold text-white">Batch yield evidence</h3>{data.data.length === 0 && data.pagination.total > 0 && <p className="text-sm text-neutral-300">No batches on this page. Return to an earlier page.</p>}{data.data.map(row => <article key={row._id} className="min-w-0 space-y-3 border-t border-white/10 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="break-all font-semibold text-white">{row.productionNumber}</p><p className="text-sm text-neutral-300">{row.recipeName} · v{row.recipeVersion} · {when(row.preparedAt)}</p></div><Badge tone={row.status === "completed" ? "success" : "warning"}>{row.status === "completed" ? "Completed" : "Reversed · excluded"}</Badge></div>
        <ProductionYieldEvidence evidence={row.yield} explanation={row.yieldExplanation} reversed={row.status === "reversed"}/>
        <Button variant="secondary" className="min-h-11" onClick={() => onViewBatch(row._id)}>View batch details</Button>
      </article>)}<Pagination pagination={data.pagination} onPageChange={page => setQuery(current => ({ ...current, page }))}/></section>
    </> : resource.error ? <p role="status" className="text-sm text-amber-200">Yield report is unavailable. Retry to verify the figures.</p> : null}
  </section>;
}
