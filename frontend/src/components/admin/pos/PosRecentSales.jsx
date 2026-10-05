"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, Printer, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { fetchPosHistory, fetchPosSaleDetail, fetchPosTerminals, fetchPosCashiers, reprintPosSale } from "@/src/api/api.js";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import DarkDatePicker from "@/src/components/ui/DarkDatePicker.jsx";
import PosSaleActionsDialog from "./PosSaleActionsDialog.jsx";
import { formatAdminCurrency, formatAdminDate } from "../adminUi.js";

const input = "min-h-10 w-full rounded-xl border border-white/10 bg-[#101618] px-3 text-sm";
const emptyFilters = { search: "", from: "", to: "", cashier: "", terminal: "", paymentMethod: "", paymentStatus: "", status: "", orderType: "" };
export default function PosRecentSales({ user, revision, locked, onReceipt, onRepeat }) {
  const [expanded, setExpanded] = useState(false);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1); const [result, setResult] = useState({ data: [], pagination: { pages: 0, total: 0 } });
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [terminals, setTerminals] = useState([]); const [cashiers, setCashiers] = useState([]);
  const [detail, setDetail] = useState(null);
  const [reload, setReload] = useState(0);
  const manager = ["admin", "manager"].includes(user?.role);
  useEffect(() => {
    if (locked || !expanded) return;
    fetchPosTerminals(manager).then(setTerminals).catch(() => undefined);
    if (manager) fetchPosCashiers().then(setCashiers).catch(() => undefined);
  }, [manager, locked, expanded]);
  useEffect(() => {
    if (locked || !expanded) return;
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError("");
      try { const rows = await fetchPosHistory({ ...filters, page, limit: 10 }); if (active) setResult(rows); }
      catch (failure) { if (active) setError(failure.response?.data?.message || "Unable to load POS history."); }
      finally { if (active) setLoading(false); }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [filters, page, revision, reload, locked, expanded]);
  const update = (key, value) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); };
  const openDetail = async row => { try { setDetail(await fetchPosSaleDetail(row._id)); } catch (failure) { toast.error(failure.response?.data?.message || "Unable to load sale details."); } };
  const refresh = useCallback(async () => { if (detail?.data?._id) setDetail(await fetchPosSaleDetail(detail.data._id)); setReload(value => value + 1); }, [detail]);
  const receipt = async row => { try { onReceipt(await reprintPosSale(row._id)); } catch (failure) { toast.error(failure.response?.data?.message || "Unable to load receipt."); } };
  const selects = [
    ["paymentMethod", "All payment methods", ["cash", "card", "other"]],
    ["paymentStatus", "All payment statuses", ["paid", "voided", "partially_refunded", "refunded"]],
    ["status", "All order statuses", ["pending", "confirmed", "preparing", "ready", "delivered", "cancelled", "failed"]],
    ["orderType", "All order types", ["dine-in", "takeaway"]],
  ];
  return <section className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="flex min-h-14 w-full items-center gap-2 px-4 text-left"><Clock3 className="h-4 w-4 text-dune-amber" /><h2 className="flex-1 text-sm font-semibold">Recent POS Sales</h2><ChevronDown className={"h-4 w-4 transition " + (expanded ? "rotate-180" : "")} /></button>
    {expanded && <div className="border-t border-white/10">
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs text-neutral-400">Order / pickup name<input type="search" value={filters.search} onChange={event => update("search", event.target.value)} placeholder="Search sale…" className={input + " mt-1"} /></label>
        {["from", "to"].map(key => <label key={key} className="text-xs capitalize text-neutral-400">{key} date<DarkDatePicker value={filters[key]} onChange={event => update(key, event.target.value)} className={input + " mt-1"} /></label>)}
        <label className="text-xs text-neutral-400">Terminal<DarkSelect value={filters.terminal} onChange={event => update("terminal", event.target.value)} className={input + " mt-1"}><option value="">All terminals</option>{terminals.map(row => <option key={row._id} value={row.code}>{row.name} · {row.code}</option>)}</DarkSelect></label>
        {manager && <label className="text-xs text-neutral-400">Cashier<DarkSelect value={filters.cashier} onChange={event => update("cashier", event.target.value)} className={input + " mt-1"}><option value="">All cashiers</option>{cashiers.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}</DarkSelect></label>}
        {selects.map(([key, label, values]) => <label key={key} className="text-xs capitalize text-neutral-400">{key.replace(/([A-Z])/g, " $1")}<DarkSelect value={filters[key]} onChange={event => update(key, event.target.value)} className={input + " mt-1"}><option value="">{label}</option>{values.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</DarkSelect></label>)}
      </div>
      {error ? <p role="alert" className="p-6 text-sm text-red-400">{error}<button onClick={() => setReload(value => value + 1)} className="ml-3 text-dune-amber">Retry</button></p> : loading ? <p className="p-6 text-sm text-neutral-500">Loading sales…</p> : <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="border-y border-white/10 uppercase text-neutral-500"><tr>{["Order", "Type / Terminal", "Items", "Total", "Payment / Status", "Time", "Cashier", "Actions"].map(label => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-white/5">{result.data.map(sale => <tr key={sale._id}><td className="whitespace-nowrap px-4 py-3 text-white">#{sale.orderNumber}</td><td className="px-4 py-3 capitalize text-neutral-400">{sale.orderType}<br />{sale.terminal || "MAIN"}</td><td className="max-w-60 truncate px-4 py-3 text-neutral-400">{sale.items.map(line => line.name + " ×" + line.quantity).join(", ")}</td><td className="whitespace-nowrap px-4 py-3 text-dune-amber">{formatAdminCurrency(sale.totalAmount)}</td><td className="whitespace-nowrap px-4 py-3 capitalize text-neutral-400">{sale.paymentMethod}<br /><span className={["refunded", "voided"].includes(sale.paymentStatus) ? "text-red-400" : "text-emerald-400"}>{sale.paymentStatus.replaceAll("_", " ")}</span><br />{sale.status}</td><td className="whitespace-nowrap px-4 py-3 text-neutral-500">{formatAdminDate(sale.createdAt, { hour: "2-digit", minute: "2-digit" })}</td><td className="px-4 py-3 text-neutral-400">{sale.createdBy?.name || "—"}</td><td className="whitespace-nowrap px-4 py-3"><button onClick={() => openDetail(sale)} className="min-h-10 px-2 text-dune-amber">Details</button><button onClick={() => receipt(sale)} aria-label={"Reprint " + sale.orderNumber} className="min-h-10 px-2 text-neutral-400"><Printer className="h-4 w-4" /></button></td></tr>)}{!result.data.length && <tr><td colSpan={8} className="p-8 text-center text-neutral-500">No sales match these filters.</td></tr>}</tbody></table></div>}
      <div className="flex items-center justify-between border-t border-white/10 p-4 text-xs text-neutral-400"><span>{result.pagination.total} sales · Page {page} of {Math.max(1, result.pagination.pages)}</span><div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)} className="min-h-10 rounded-lg border border-white/10 px-3 disabled:opacity-30">Previous</button><button disabled={page >= result.pagination.pages || loading} onClick={() => setPage(value => value + 1)} className="min-h-10 rounded-lg border border-white/10 px-3 disabled:opacity-30">Next</button></div></div>
    </div>}
    {detail && <PosSaleActionsDialog key={detail.data._id} data={detail} canManage={manager} onClose={() => setDetail(null)} onRefresh={refresh} onReceipt={() => receipt(detail.data)} onRepeat={onRepeat} />}
  </section>;
}
