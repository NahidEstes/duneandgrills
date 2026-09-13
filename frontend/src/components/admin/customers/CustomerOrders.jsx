"use client";

import DarkDatePicker from "../../ui/DarkDatePicker.jsx";
import DarkSelect from "../../ui/DarkSelect.jsx";
import { Eye, Printer, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchAdminCustomerOrders, fetchPublicRestaurantSettings } from "../../../api/api.js";
import { printOrderInvoice } from "../../../utils/adminExports.js";
import { OrderRowModal } from "../../OrdersTab.jsx";
import { formatAdminCurrency, formatAdminDate, labelStatus } from "../adminUi.js";
import { customerCardClass, customerInputClass, EmptySection, Pagination, SectionLoading, StatusPill } from "./customerUi.jsx";

const STATUSES = ["all", "pending", "confirmed", "preparing", "ready", "out-for-delivery", "delivered", "cancelled", "refunded", "failed"];
const SOURCES = ["all", "website", "pos", "phone", "jahez", "hungerstation"];
const sourceLabel = (value = "website") => value === "pos" ? "POS / Counter" : labelStatus(value);

export default function CustomerOrders({ customerId, onChanged }) {
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState({ data: [], pagination: {} });
  const [loading, setLoading] = useState(true);
  const [viewOrder, setViewOrder] = useState(null);
  const [receiptSettings, setReceiptSettings] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchPublicRestaurantSettings().then(setReceiptSettings).catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchAdminCustomerOrders(customerId, { status, source, from: from || undefined, to: to || undefined, page, limit: 10 })
      .then((data) => active && setPayload(data))
      .catch((error) => active && toast.error(error.response?.data?.message || "Unable to load customer orders."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [customerId, from, page, refreshKey, source, status, to]);

  const reset = () => { setStatus("all"); setSource("all"); setFrom(""); setTo(""); setPage(1); };
  const handleSaved = (updated) => {
    const normalized = {
      ...updated,
      itemsSummary: updated.items?.map((item) => `${item.name} ×${item.quantity}`).join(", ") || "",
    };
    setPayload((current) => ({ ...current, data: current.data.map((order) => order._id === normalized._id ? normalized : order) }));
    setViewOrder(normalized);
    onChanged?.();
  };

  return (
    <div className="space-y-3">
      <section className={`${customerCardClass} flex flex-col gap-3 p-3 xl:flex-row xl:items-center`}>
        <DarkSelect value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className={customerInputClass}>{STATUSES.map((value) => <option key={value} value={value}>{value === "all" ? "All statuses" : labelStatus(value)}</option>)}</DarkSelect>
        <DarkSelect value={source} onChange={(event) => { setSource(event.target.value); setPage(1); }} className={customerInputClass}>{SOURCES.map((value) => <option key={value} value={value}>{value === "all" ? "All sources" : sourceLabel(value)}</option>)}</DarkSelect>
        <DarkDatePicker value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} placeholder="From date" className={customerInputClass} />
        <DarkDatePicker value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} placeholder="To date" className={customerInputClass} />
        <button type="button" onClick={reset} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-neutral-400 hover:text-white"><RefreshCw className="h-3.5 w-3.5" />Reset</button>
      </section>

      <section className={`${customerCardClass} overflow-hidden`}>
        {loading ? <SectionLoading /> : payload.data.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-white/[0.07] text-xs text-neutral-600"><tr><th className="px-4 py-3 font-medium">Order</th><th className="px-3 py-3 font-medium">Items</th><th className="px-3 py-3 font-medium">Source / Type</th><th className="px-3 py-3 font-medium">Status</th><th className="px-3 py-3 font-medium">Payment</th><th className="px-3 py-3 font-medium">Total</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr></thead><tbody className="divide-y divide-white/[0.055]">{payload.data.map((order) => <tr key={order._id} className="hover:bg-white/[0.025]"><td className="px-4 py-3"><p className="font-medium text-white">#{order.orderNumber}</p><p className="mt-1 text-xs text-neutral-600">{formatAdminDate(order.createdAt, { hour: "2-digit", minute: "2-digit" })}</p></td><td className="max-w-xs px-3 py-3"><p className="truncate text-xs text-neutral-300" title={order.itemsSummary}>{order.itemsSummary}</p></td><td className="px-3 py-3"><p className="text-xs text-neutral-300">{sourceLabel(order.source)}</p><p className="mt-1 text-xs text-neutral-600">{labelStatus(order.orderType)}</p></td><td className="px-3 py-3"><StatusPill value={order.status} /></td><td className="px-3 py-3"><p className="text-xs text-neutral-300">{labelStatus(order.paymentStatus)}</p><p className="mt-1 text-xs text-neutral-600">{labelStatus(order.paymentMethod)}</p></td><td className="px-3 py-3 font-semibold text-dune-amber">{formatAdminCurrency(order.totalAmount)}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" onClick={() => printOrderInvoice(order, receiptSettings)} className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 hover:bg-white/5 hover:text-dune-amber" aria-label={`Print order ${order.orderNumber}`}><Printer className="h-4 w-4" /></button><button type="button" onClick={() => setViewOrder(order)} className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 hover:bg-white/5 hover:text-white" aria-label={`View order ${order.orderNumber}`}><Eye className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div> : <EmptySection>No orders match these filters.</EmptySection>}
        {!loading && <Pagination pagination={payload.pagination} onPage={setPage} />}
      </section>

      {viewOrder && <OrderRowModal order={viewOrder} receiptSettings={receiptSettings} onClose={() => setViewOrder(null)} onSaved={(updated) => { handleSaved(updated); setRefreshKey((value) => value + 1); }} />}
    </div>
  );
}
