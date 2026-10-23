"use client";
import { useState } from "react";
import Link from "next/link";
import { fetchInventoryWorkspace, fetchItemBatches, fetchItemHistory, fetchItemUsage } from "@/src/api/inventoryApi.js";
import DeliveryDialog from "../admin/delivery/DeliveryDialog.jsx";
import useInventoryResource from "./useInventoryResource.js";
import StockEligibilityBreakdown from "./StockEligibilityBreakdown.jsx";
import StockItemActions from "./StockItemActions.jsx";
import { Button, InventoryLoadError, LoadingState, EmptyState, Pagination } from "./InventoryUI.jsx";
import { preparationQuantityLabel as q } from "@/src/utils/preparationUnits.js";
import { formatDate, formatSar, humanize } from "./inventoryUtils.js";

export default function StockItemDrawer({ id, onClose, onEdit, revision = 0 }) {
  const [tab, setTab] = useState("overview"), [page, setPage] = useState(1), [type, setType] = useState("preparation");
  const info = useInventoryResource(() => fetchInventoryWorkspace(id), [id, revision]);
  const content = useInventoryResource(() => tab === "batches" ? fetchItemBatches(id, { page, limit: 10, status: "all" }) : tab === "history" ? fetchItemHistory(id, { page, limit: 10 }) : tab === "usage" ? fetchItemUsage(id, { page, limit: 10, type }) : Promise.resolve(null), [id, tab, page, type, revision]);
  const item = info.data?.item;
  const refresh = () => Promise.all([info.reload({ silent: true }), content.reload({ silent: true })]);
  return <DeliveryDialog open onClose={onClose} title={item?.name || "Stock item details"}>
    <Button variant="secondary" disabled={info.refreshing || content.refreshing} onClick={() => refresh().catch(() => undefined)}>Refresh item details</Button>
    <InventoryLoadError error={info.error} onRetry={info.reload} retained={Boolean(item)}/>
    {info.loading ? <LoadingState/> : item && <>
      <p className="text-sm text-neutral-300">{item.sku} · {item.category?.name || "No category"} · {item.isActive === false ? "Inactive" : "Active"}</p>
      <p className="text-xs text-neutral-400">Updated {formatDate(info.data.generatedAt, true)} · Asia/Riyadh</p>
      <StockItemActions inline item={item} disabled={Boolean(info.error) || info.refreshing} onEdit={onEdit}/>
      <nav aria-label="Item detail views" className="flex flex-wrap gap-2">{[["overview", "Overview"], ["batches", "Batches"], ["history", "Movements"], ["usage", "Recipe usage"]].map(([value, label]) => <Button key={value} variant={tab === value ? "primary" : "secondary"} aria-pressed={tab === value} onClick={() => { setTab(value); setPage(1); }}>{label}</Button>)}</nav>
      {tab === "overview" ? <>
        <StockEligibilityBreakdown breakdown={info.data.breakdown}/>
        <dl className="grid grid-cols-2 gap-4 text-sm">{[["Base unit", item.unit], ["Purchase conversion", `1 ${item.purchaseUnit || item.unit} = ${q(item.purchaseConversionFactor || 1, item.unit)}`], ["Reorder level", q(item.reorderLevel, item.unit)], ["Preferred brand", item.preferredBrand || "Not recorded"], ["Storage", item.storageLocation || "Not recorded"], ["Supplier", item.supplier?.name || "Not recorded"], ["Supplier contact", item.supplier?.phone || "Not recorded"], ["Current item cost", item.unitCost == null ? "Unavailable" : `${formatSar(item.unitCost)} / ${item.unit}`]].map(([label, value]) => <div className="min-w-0" key={label}><dt className="text-xs text-neutral-400">{label}</dt><dd className="mt-1 break-words text-white">{value}</dd></div>)}</dl><p className="text-xs text-neutral-400">Current item cost is a reference. Historical batches retain their saved lot costs.</p>
      </> : <>
        {tab === "history" && <p className="text-xs text-neutral-400">Older movements may lack a saved base unit. These quantities are labelled recorded base units rather than assuming today’s item unit.</p>}
        {tab === "usage" && <nav aria-label="Recipe usage types" className="flex flex-wrap gap-2">{["preparation", "menu", "addon"].map(value => <Button key={value} variant={type === value ? "primary" : "secondary"} aria-pressed={type === value} onClick={() => { setType(value); setPage(1); }}>{humanize(value)}</Button>)}</nav>}
        <InventoryLoadError error={content.error} onRetry={content.reload} retained={Boolean(content.data)}/>
        {content.loading ? <LoadingState/> : content.data && <>
          {!content.data.data.length && <EmptyState title={`No ${tab === "usage" ? "recipe references" : tab} recorded`} description={tab === "batches" ? "No saved batches. See Overview for legacy stock evidence." : "No saved evidence matched this item."}/>}
          {content.data.data.map(row => <article key={row._id} className="space-y-2 rounded-xl border border-white/10 p-4 text-sm">
            {tab === "batches" ? <><h3 className="break-words font-semibold">{row.lotNumber}</h3><p>Remaining: {q(row.remainingQuantity, item.unit)}</p><p>{humanize(row.usability)} · Use by: {row.expiryDate ? formatDate(row.expiryDate) : "Not recorded"}</p><p className="text-xs text-neutral-400">Saved cost: {row.unitCost == null ? "Unavailable" : `${formatSar(row.unitCost)} / recorded base unit`}</p></> : tab === "history" ? <><h3 className="font-semibold">{row.transactionNumber || row.reference}</h3><p>{humanize(row.movementType)} · {q(row.quantity, row.sourceDetails?.baseUnit || "recorded base units")}</p><p>{q(row.stockBefore, row.sourceDetails?.baseUnit || "recorded base units")} → {q(row.stockAfter, row.sourceDetails?.baseUnit || "recorded base units")}</p><p className="break-words">{row.reason}</p><p className="text-xs text-neutral-400">{formatDate(row.occurredAt, true)} · {row.user?.name || "Actor unavailable"}</p></> : <><h3 className="break-words font-semibold">{row.name}</h3><p>{row.relation} · {row.isActive ? "Active" : "Inactive"}{row.doNotTrack ? " · Do not track" : ""}</p><Link href={row.href} className="inline-block min-h-11 py-2 text-dune-amber underline">Open recipe library</Link></>}
          </article>)}
          <Pagination pagination={content.data.pagination} onPageChange={setPage}/>
        </>}
      </>}
    </>}
  </DeliveryDialog>;
}
