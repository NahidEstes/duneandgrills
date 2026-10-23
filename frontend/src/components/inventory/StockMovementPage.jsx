"use client";
import { fetchStockMovements } from "@/src/api/inventoryApi.js";
import useInventoryResource from "./useInventoryResource.js";
import ReviewedStockForm from "./ReviewedStockForm.jsx";
import { Button, EmptyState, InventoryLoadError, LoadingState, PageHeader, cardClass } from "./InventoryUI.jsx";
import { formatDate, humanize } from "./inventoryUtils.js";
import { preparationQuantityLabel as q } from "@/src/utils/preparationUnits.js";
export default function StockMovementPage({ pageType, initialItem = "" }) {
  const history = useInventoryResource(() => fetchStockMovements({ limit: 10, item: initialItem || undefined }), [initialItem]);
  return <div className="mx-auto max-w-[1500px]"><PageHeader title={pageType === "stock-in" ? "Stock In" : "Stock Out"} description="Review a stock change, then confirm it once. Dates and times use Asia/Riyadh."/>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]"><section className={cardClass + " min-w-0 p-4 sm:p-5"}><ReviewedStockForm initialItem={initialItem} initialType={pageType === "stock-in" ? "STOCK_IN" : "STOCK_OUT"} onSaved={() => history.reload({ silent: true })}/></section>
    <section className={cardClass + " min-w-0 space-y-3 p-4"}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Recent stock activity</h2><Button variant="secondary" onClick={() => history.reload({ silent: true }).catch(() => undefined)}>Refresh activity</Button></div><InventoryLoadError error={history.error} retained={Boolean(history.data)} onRetry={history.reload}/>{history.loading ? <LoadingState/> : history.data && (history.data.data.length ? history.data.data.map(row => <article key={row._id} className="space-y-1 rounded-xl border border-white/10 p-3 text-sm"><h3 className="break-words font-semibold">{row.item?.name || "Archived item"}</h3><p>{humanize(row.movementType)} · {row.transactionNumber}</p><p>{q(row.stockBefore, row.sourceDetails?.baseUnit || "recorded base units")} → {q(row.stockAfter, row.sourceDetails?.baseUnit || "recorded base units")}</p><p className="text-xs text-neutral-400">{formatDate(row.occurredAt, true)} · {row.user?.name || "Actor unavailable"}</p></article>) : <EmptyState title="No stock movements recorded"/>)}</section></div>
  </div>;
}
