"use client";
import ResourceStatus from "../ui/ResourceStatus.jsx";

import Link from "next/link";
import {
  AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, CalendarClock,
  CircleDollarSign, ClipboardCheck, PackageX, Plus, ReceiptText, RefreshCw,
} from "lucide-react";
import { fetchInventoryDashboard, fetchInventoryItems, fetchPurchasingActions } from "@/src/api/inventoryApi.js";
import { Badge, Button, DataTable, EmptyState, LoadingState, Money, PageHeader, StatCard, cardClass } from "./InventoryUI.jsx";
import { daysUntil, formatDate, formatQuantity, getStockStatus, humanize } from "./inventoryUtils.js";
import useInventoryResource from "./useInventoryResource.js";

const actionLinks = [
  ["Add item", "/inventory/stock-items?action=add", Plus],
  ["Stock in", "/inventory/stock-in", ArrowDownToLine],
  ["Stock out", "/inventory/stock-out", ArrowUpFromLine],
  ["Purchase order", "/inventory/purchase-orders?action=add", ReceiptText],
  ["Inventory count", "/inventory/inventory-count?action=add", ClipboardCheck],
];

function ValueChart({ points = [] }) {
  if (!points.length) return <EmptyState title="No valuation history yet" description="Stock activity will build this trend automatically." />;
  const values = points.map((point) => Number(point.value) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const coordinates = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${84 - ((value - min) / span) * 68}`).join(" ");
  return <div className="mt-5"><svg viewBox="0 0 100 90" preserveAspectRatio="none" className="h-48 w-full overflow-visible" aria-label="Inventory value over the last 30 days"><defs><linearGradient id="inventory-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f59e0b" stopOpacity="0.35" /><stop offset="1" stopColor="#f59e0b" stopOpacity="0" /></linearGradient></defs><polyline points={`0,90 ${coordinates} 100,90`} fill="url(#inventory-area)" stroke="none" /><polyline points={coordinates} fill="none" stroke="#f59e0b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg><div className="flex justify-between text-[0.65rem] text-neutral-400"><span>{formatDate(points[0]?.date)}</span><span>{formatDate(points.at(-1)?.date)}</span></div></div>;
}

function CategoryChart({ rows = [] }) {
  if (!rows.length) return <EmptyState title="No category data yet" />;
  const slices = rows.reduce(
    (result, row) => ({
      offset: result.offset + row.percentage,
      values: [...result.values, `${row.color || "#f59e0b"} ${result.offset}% ${result.offset + row.percentage}%`],
    }),
    { offset: 0, values: [] }
  ).values;
  return <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row"><div className="h-36 w-36 shrink-0 rounded-full p-5" style={{ background: `conic-gradient(${slices.join(",")})` }}><div className="h-full w-full rounded-full bg-[#111416]" /></div><div className="w-full space-y-2">{rows.slice(0, 6).map((row) => <div key={row.category} className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 text-neutral-400"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} /><span className="truncate">{row.category}</span></span><span className="text-neutral-400">{row.percentage}%</span></div>)}</div></div>;
}

export default function InventoryDashboard() {
  const { data, loading, error, reload, lastSuccessAt, refreshing } = useInventoryResource(async () => {
    const [dashboard, itemsResponse, actionsResponse] = await Promise.all([fetchInventoryDashboard(), fetchInventoryItems({ limit: 8, sortBy: "updatedAt" }), fetchPurchasingActions({ state: "open", limit: 5 })]);
    return { dashboard, items: itemsResponse.data, actions: actionsResponse.data };
  }, []);
  const dashboard = data?.dashboard;
  const summary = dashboard?.summary || {};
  const emptyMessage = message => loading ? "Loading inventory data…" : error ? "Unable to verify this information. Refresh to retry." : message;
  const columns = [
    { key: "name", label: "Item", render: (item) => <div><Link className="inline-block min-h-11 py-2 font-medium text-white underline decoration-white/20 underline-offset-4" href={`/inventory/stock-items?item=${item._id}`}>{item.name}</Link><p className="mt-0.5 text-[0.65rem] text-neutral-400">{item.sku}</p></div> },
    { key: "category", label: "Category", render: (item) => item.category?.name || "—" },
    { key: "stock", label: "Current stock", render: (item) => formatQuantity(item.currentStock, item.unit) },
    { key: "reorder", label: "Reorder", render: (item) => formatQuantity(item.reorderLevel, item.unit) },
    { key: "value", label: "Value", render: (item) => <div><Money value={item.inventoryValue} /><p className="text-[0.6rem] text-neutral-400">{item.valuationMethod === "batch" ? "Batch cost" : "Item cost fallback"}</p></div> },
    { key: "status", label: "Status", render: (item) => { const status = getStockStatus(item); return <Badge tone={status.tone}>{status.label}</Badge>; } },
  ];

  return <div className="mx-auto max-w-[1680px]">
    <PageHeader title="Inventory Dashboard" description="Real-time overview of inventory, purchasing and stock status." actions={<Button variant="secondary" onClick={() => reload().catch(() => undefined)} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>} /><ResourceStatus lastSuccessAt={lastSuccessAt} refreshing={refreshing} loading={loading} error={error} hasData={data !== null} onRetry={() => reload({ silent: true })} showDetails={false} />
    {error && <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">Unable to refresh inventory. Retry to verify the latest information; retained results may be out of date.</div>}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Link href="/inventory/stock-items" aria-label="View total items" className="rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-dune-amber"><StatCard label="Total Items" value={summary.totalItems ?? "—"} caption="Active inventory items" icon={Boxes} /></Link>
      <Link href="/inventory/reports?type=valuation" aria-label="View inventory value" className="rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-dune-amber"><StatCard label="Inventory Value" value={dashboard ? <Money value={summary.inventoryValue} /> : "SAR —"} caption="Current stock valuation" icon={CircleDollarSign} tone="green" /></Link>
      <Link href="/inventory/stock-items?status=low" aria-label="View low stock" className="rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-dune-amber"><StatCard label="Low Stock" value={summary.lowStock ?? "—"} caption="Usable stock at or below reorder level" icon={AlertTriangle} tone="amber" /></Link>
      <Link href="/inventory/stock-items?status=out" aria-label="View out of stock" className="rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-dune-amber"><StatCard label="Out of Stock" value={summary.outOfStock ?? "—"} caption="Items requiring action" icon={PackageX} tone="red" /></Link>
      <Link href="/inventory/stock-items?status=expiring" aria-label="View expiring soon" className="rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-dune-amber"><StatCard label="Expiring Soon" value={summary.expiringSoon ?? "—"} caption="Unique active items within the alert window" icon={CalendarClock} tone="violet" /></Link>
    </section>
    <div className={`${cardClass} mt-4 flex flex-wrap gap-2 p-3`}>{actionLinks.map(([label, href, Icon]) => <Link key={href} href={href} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-medium text-neutral-300 transition hover:border-dune-amber/40 hover:text-white"><Icon className="h-4 w-4 text-dune-amber" />{label}</Link>)}</div>
    {dashboard?.valuation && (dashboard.valuation.missingCostItems > 0 || dashboard.valuation.mismatchWarnings > 0) && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-xs text-amber-200"><AlertTriangle className="h-4 w-4" /><span>Valuation coverage {dashboard.valuation.coveragePercent}% · {dashboard.valuation.missingCostItems} missing-cost item(s) · {dashboard.valuation.mismatchWarnings} batch/stock mismatch(es).</span><Link href="/inventory/reports?type=valuation" className="ml-auto font-semibold text-dune-amber">Review valuation</Link></div>}

    <section className="mt-4 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <article className={cardClass}><div className="flex items-center justify-between border-b border-white/10 p-4"><div><h2 className="font-body text-base font-semibold text-white">Stock Items</h2><p className="mt-0.5 text-xs text-neutral-400">Recently updated inventory records.</p></div><Link href="/inventory/stock-items" className="text-xs font-semibold text-dune-amber">View all</Link></div>{loading ? <LoadingState /> : error && data == null ? null : <DataTable columns={columns} rows={data?.items} empty={<EmptyState title="No stock items yet" description="Add the first item to begin inventory tracking." />} />}</article>
      <div className="space-y-4">
        <article className={`${cardClass} p-4`}><div className="flex items-center justify-between"><h2 className="font-body text-sm font-semibold text-white">Purchasing Action Center</h2><Link href="/inventory/purchasing-actions" className="text-xs font-semibold text-dune-amber">View all</Link></div><div className="mt-4 divide-y divide-white/[0.06]">{data?.actions?.length ? data.actions.map((action) => <Link href={action.href} key={action._id} className="flex items-center justify-between gap-3 py-2.5 text-xs"><span className="min-w-0 truncate text-neutral-300">{action.title}</span><Badge tone={action.severity === "critical" ? "danger" : action.severity === "high" ? "warning" : "info"}>{humanize(action.severity)}</Badge></Link>) : <p className="py-4 text-xs text-neutral-400">{emptyMessage("No open purchasing actions. Run a scan from Action Center.")}</p>}</div></article>
        <article className={`${cardClass} p-4`}><div className="flex items-center justify-between"><h2 className="font-body text-sm font-semibold text-white">Low Stock Alerts</h2><Link href="/inventory/stock-items?status=low" className="text-xs font-semibold text-dune-amber">View all</Link></div><div className="mt-4 divide-y divide-white/[0.06]">{dashboard?.lowStock?.length ? dashboard.lowStock.slice(0, 5).map((item) => <div key={item._id} className="flex items-center justify-between gap-3 py-2.5 text-xs"><Link className="min-w-0 truncate py-2 text-neutral-200 underline decoration-white/20" href={`/inventory/stock-items?item=${item._id}`}>{item.name}</Link><Badge tone={item.currentStock <= 0 ? "danger" : "warning"}>{formatQuantity(item.saleableStock, item.unit)}</Badge></div>) : <p className="py-4 text-xs text-neutral-400">{emptyMessage("No low-stock alerts.")}</p>}</div></article>
        <article className={`${cardClass} p-4`}><div className="flex items-center justify-between"><h2 className="font-body text-sm font-semibold text-white">Expiry Tracking</h2><Link href="/inventory/stock-items?status=expiring" className="text-xs font-semibold text-dune-amber">View all</Link></div><div className="mt-4 divide-y divide-white/[0.06]">{dashboard?.expiring?.length ? dashboard.expiring.slice(0, 4).map((item) => { const days = daysUntil(item.expiryDate); return <div key={item._id} className="flex items-center justify-between gap-3 py-2.5 text-xs"><span className="min-w-0"><Link className="block truncate py-2 text-neutral-200 underline decoration-white/20" href={`/inventory/stock-items?item=${item._id}`}>{item.name}</Link><span className="block truncate text-[0.65rem] text-neutral-400">{item.sku || "Item expiry evidence"}</span></span><Badge tone={days < 0 ? "danger" : "violet"}>{days < 0 ? `${Math.abs(days)}d expired` : `${days}d left`}</Badge></div>; }) : <p className="py-4 text-xs text-neutral-400">{emptyMessage("No expiry alerts.")}</p>}</div></article>
        <article className={`${cardClass} p-4`}><div className="flex items-center justify-between"><h2 className="font-body text-sm font-semibold text-white">Recent Stock Activity</h2><Link href="/inventory/reports?type=movement" className="text-xs font-semibold text-dune-amber">View all</Link></div><div className="mt-4 divide-y divide-white/[0.06]">{dashboard?.recentActivity?.length ? dashboard.recentActivity.slice(0, 5).map((row) => <div key={row._id} className="flex items-center justify-between gap-3 py-2 text-xs"><span><span className="block text-neutral-300">{row.item?.name || "Archived item"}</span><span className="text-[0.65rem] text-neutral-400">{humanize(row.movementType)}</span></span><span className={row.stockAfter >= row.stockBefore ? "text-emerald-400" : "text-red-400"}>{row.stockAfter >= row.stockBefore ? "+" : ""}{formatQuantity(row.stockAfter - row.stockBefore, row.item?.unit)}</span></div>) : <p className="py-4 text-xs text-neutral-400">{emptyMessage("No stock activity yet.")}</p>}</div></article>
      </div>
    </section>

    <section className="mt-4 grid gap-4 xl:grid-cols-3">
      <article className={`${cardClass} p-5`}><div className="flex items-start justify-between"><div><h2 className="font-body text-base font-semibold text-white">Inventory Value Over Time</h2><p className="mt-1 text-xs text-neutral-400">Last 30 days · SAR</p></div><span className="text-sm font-semibold text-emerald-300"><Money value={summary.inventoryValue} /></span></div>{loading ? <LoadingState /> : <ValueChart points={dashboard?.inventoryValueOverTime} />}</article>
      <article className={`${cardClass} p-5`}><h2 className="font-body text-base font-semibold text-white">Category Distribution</h2><p className="mt-1 text-xs text-neutral-400">By inventory value in SAR</p>{loading ? <LoadingState /> : <CategoryChart rows={dashboard?.categoryDistribution} />}</article>
      <article className={`${cardClass} p-5`}><h2 className="font-body text-base font-semibold text-white">Top Suppliers</h2><p className="mt-1 text-xs text-neutral-400">By purchase value</p><div className="mt-5 divide-y divide-white/[0.06]">{dashboard?.topSuppliers?.length ? dashboard.topSuppliers.map((row, index) => <div key={row.supplier._id} className="flex items-center gap-3 py-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-xs font-semibold text-dune-amber">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-neutral-300">{row.supplier.name}</p><p className="text-[0.65rem] text-neutral-400">{row.orders} orders</p></div><span className="text-xs text-neutral-400"><Money value={row.total} /></span></div>) : <p className="py-6 text-xs text-neutral-400">{emptyMessage("No supplier purchase history yet.")}</p>}</div></article>
    </section>
  </div>;
}
