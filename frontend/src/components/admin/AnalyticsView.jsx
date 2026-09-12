"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, FileText, Percent, ReceiptText, RefreshCw, RotateCcw, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { fetchAdminAnalytics } from "../../api/api.js";
import { exportAnalyticsCsv, printAnalyticsReport } from "../../utils/adminExports.js";
import DarkDatePicker from "../ui/DarkDatePicker.jsx";
import DarkSelect from "../ui/DarkSelect.jsx";
import { formatAdminCurrency, labelStatus } from "./adminUi.js";

const CARD = "rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.045] to-white/[0.018]";
const inputClass = "h-10 rounded-lg border border-white/10 bg-[#101315] px-3 text-sm text-neutral-300 outline-none focus:border-dune-amber/60";
const periods = [["today", "Today"], ["week", "Last 7 Days"], ["month", "This Month"], ["custom", "Custom Date"]];

const SummaryCard = ({ icon: Icon, label, value, tone = "text-dune-amber" }) => (
  <article className={`${CARD} flex items-start gap-3 p-4`}><span className={`rounded-xl bg-white/[0.04] p-2.5 ${tone}`}><Icon className="h-5 w-5" /></span><span><span className="block text-xs text-neutral-500">{label}</span><strong className="mt-1 block text-xl text-white">{value}</strong></span></article>
);

const Breakdown = ({ title, rows, labelKey }) => {
  const max = Math.max(...rows.map((row) => row.revenue), 1);
  return <section className={`${CARD} p-5`}><h2 className="text-sm font-semibold text-white">{title}</h2><div className="mt-4 space-y-4">{rows.map((row) => <div key={row[labelKey]}><div className="mb-1.5 flex justify-between gap-3 text-xs"><span className="capitalize text-neutral-300">{String(row[labelKey]).replaceAll("-", " ")}</span><span className="text-neutral-500">{row.orders} orders · {formatAdminCurrency(row.revenue)}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-gradient-to-r from-dune-amberDeep to-dune-amber" style={{ width: `${Math.max(3, row.revenue / max * 100)}%` }} /></div></div>)}{!rows.length && <p className="py-8 text-center text-sm text-neutral-600">No sales in this range.</p>}</div></section>;
};

const ProductList = ({ title, items }) => <section className={`${CARD} p-5`}><h2 className="text-sm font-semibold text-white">{title}</h2><div className="mt-3 divide-y divide-white/[0.06]">{items.map((item, index) => <div key={`${item.product || item.name}-${index}`} className="flex items-center gap-3 py-3 text-sm"><span className="grid h-8 w-8 place-items-center rounded-lg bg-dune-amber/10 text-xs font-semibold text-dune-amber">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-white">{item.name}</span><span className="text-xs capitalize text-neutral-600">{item.productType} · {item.quantity} sold</span></span><span className="text-xs text-neutral-300">{formatAdminCurrency(item.revenue)}</span></div>)}{!items.length && <p className="py-8 text-center text-sm text-neutral-600">No sold items in this range.</p>}</div></section>;

export default function AnalyticsView() {
  const [period, setPeriod] = useState("week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState("all");
  const [orderType, setOrderType] = useState("all");
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (period === "custom" && (!from || !to)) return;
    let active = true;
    setLoading(true);
    fetchAdminAnalytics({ period, from: period === "custom" ? from : undefined, to: period === "custom" ? to : undefined, source, orderType })
      .then((data) => active && setAnalytics(data))
      .catch((error) => active && toast.error(error.response?.data?.message || "Unable to load sales analytics."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [period, from, to, source, orderType]);

  const maxRevenue = useMemo(() => Math.max(...(analytics?.series || []).map((row) => row.revenue), 1), [analytics]);
  const summary = analytics?.summary || {};
  const exportCsv = () => analytics && exportAnalyticsCsv(analytics);
  const exportPdf = () => {
    if (analytics && !printAnalyticsReport(analytics)) toast.error("Allow pop-ups to print or save the report as PDF.");
  };

  return <div className="space-y-4">
    <section className={`${CARD} p-4`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">{periods.map(([value, label]) => <button key={value} type="button" onClick={() => setPeriod(value)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${period === value ? "border-dune-amber bg-dune-amber text-black" : "border-white/10 text-neutral-400 hover:border-dune-amber/50 hover:text-white"}`}>{label}</button>)}</div>
        <div className="flex flex-wrap gap-2"><DarkSelect className={inputClass} value={source} onChange={(event) => setSource(event.target.value)}><option value="all">All sales sources</option><option value="website">Website</option><option value="pos">POS / Counter</option><option value="phone">Phone</option><option value="jahez">Jahez</option><option value="hungerstation">HungerStation</option></DarkSelect><DarkSelect className={inputClass} value={orderType} onChange={(event) => setOrderType(event.target.value)}><option value="all">All order types</option><option value="dine-in">Dine-in</option><option value="takeaway">Takeaway</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option></DarkSelect><button type="button" onClick={exportCsv} disabled={!analytics} className={`${inputClass} inline-flex items-center gap-2 disabled:opacity-40`}><Download className="h-4 w-4" />CSV</button><button type="button" onClick={exportPdf} disabled={!analytics} className={`${inputClass} inline-flex items-center gap-2 disabled:opacity-40`}><FileText className="h-4 w-4" />PDF / Print</button></div>
      </div>
      {period === "custom" && <div className="mt-3 flex flex-wrap gap-3 border-t border-white/[0.07] pt-3"><label className="text-xs text-neutral-500">From<DarkDatePicker className={`${inputClass} mt-1 w-44`} value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="text-xs text-neutral-500">To<DarkDatePicker className={`${inputClass} mt-1 w-44`} value={to} onChange={(event) => setTo(event.target.value)} /></label></div>}
    </section>
    {loading && !analytics ? <div className={`${CARD} grid min-h-72 place-items-center text-sm text-neutral-500`}><RefreshCw className="mr-2 inline h-4 w-4 animate-spin text-dune-amber" />Loading analytics…</div> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><SummaryCard icon={BarChart3} label="Sales Revenue" value={formatAdminCurrency(summary.totalRevenue)} /><SummaryCard icon={ShoppingBag} label="Orders" value={summary.totalOrders || 0} tone="text-sky-400" /><SummaryCard icon={ReceiptText} label="Average Order Value" value={formatAdminCurrency(summary.averageOrderValue)} tone="text-emerald-400" /><SummaryCard icon={Percent} label="Discount Total" value={formatAdminCurrency(summary.discountTotal)} tone="text-violet-400" /><SummaryCard icon={RotateCcw} label="Refund Total" value={formatAdminCurrency(summary.refundTotal)} tone="text-red-400" /></div>
      <section className={`${CARD} p-5 sm:p-6`}><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-white">Revenue Performance</h2><p className="mt-1 text-xs text-neutral-500">{analytics?.range?.from} — {analytics?.range?.to} · SAR</p></div>{loading && <RefreshCw className="h-4 w-4 animate-spin text-dune-amber" />}</div><div className="mt-7 flex h-60 items-end gap-1 overflow-x-auto pb-1 sm:gap-2">{(analytics?.series || []).map((entry) => <div key={entry.date} className="flex h-full min-w-8 flex-1 flex-col items-center justify-end gap-2"><span className="text-[0.58rem] text-neutral-600">{entry.orders}</span><div className="flex h-44 w-full items-end rounded-t bg-white/[0.03]"><div className="w-full rounded-t bg-gradient-to-t from-dune-amberDeep to-dune-amber" style={{ height: `${Math.max(entry.revenue ? 5 : 1, entry.revenue / maxRevenue * 100)}%` }} /></div><span className="text-[0.58rem] text-neutral-600">{entry.date.slice(5)}</span></div>)}</div></section>
      <div className="grid gap-4 xl:grid-cols-2"><Breakdown title="Website vs POS / Sales Source" rows={analytics?.sourceBreakdown || []} labelKey="source" /><Breakdown title="Dine-in / Takeaway / Delivery" rows={analytics?.orderTypeBreakdown || []} labelKey="orderType" /></div>
      <div className="grid gap-4 xl:grid-cols-2"><ProductList title="Best-selling Items" items={analytics?.bestSelling || []} /><ProductList title="Least-selling Items" items={analytics?.leastSelling || []} /></div>
      <section className={`${CARD} p-5`}><h2 className="text-sm font-semibold text-white">Order Status</h2><div className="mt-4 flex flex-wrap gap-2">{(analytics?.statusBreakdown || []).map((row) => <span key={row.status} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-neutral-400"><strong className="mr-2 text-white">{row.count}</strong>{labelStatus(row.status)}</span>)}</div></section>
    </>}
  </div>;
}
