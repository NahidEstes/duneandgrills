"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Info, RefreshCw, Search, Truck, UserRound } from "lucide-react";
import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import AdminShell from "@/src/components/admin/AdminShell.jsx";
import { useAuth } from "@/src/context/AuthContext.jsx";
import { fetchDeliveryManagement, deliveryAction } from "@/src/api/deliveryApi.js";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import { inputClass, panelClass } from "@/src/components/admin/staff/staffUi.jsx";
import { formatPrice } from "@/src/utils/currency.js";
import useDeliverySubmission from "@/src/hooks/useDeliverySubmission.js";
import { DeliveryDetailContent } from "@/src/components/rider/RiderDeliveryDetails.jsx";
import { deliveryStatusLabel } from "@/src/components/rider/deliveryPresentation.js";
import OwnDeliveryEnrollment from "./OwnDeliveryEnrollment.jsx";

const states = ["all", "unassigned", "assigned", "picked_up", "delivered", "issue"];
function ManagementContent({ preview, rehearsal }) {
  const { user, logout } = useAuth(), router = useRouter();
  const canManage = ["admin", "manager"].includes(user?.role);
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [stamp, setStamp] = useState(null);
  const [search, setSearch] = useState(""), [status, setStatus] = useState("all"), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null), [riderId, setRiderId] = useState(""), [reason, setReason] = useState(""), [terminal, setTerminal] = useState("MAIN");
  const [previewNotice, setPreviewNotice] = useState("");
  const mutation = useDeliverySubmission();
  const refresh = () => setRevision(value => value + 1);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setLoading(true); setError(""); setData(null); setStamp(null);
    const timer = setTimeout(() => {
      fetchDeliveryManagement({ preview, rehearsal, status, search, page }, controller.signal)
        .then(data => { if (current) { setData(data); setStamp(new Date()); setSelected(previous => previous ? data.deliveries.find(row => row.id === previous.id) || null : null); } })
        .catch(error => { if (current) { setError(navigator.onLine ? error.response?.data?.message || error.message || "Delivery management unavailable." : "You are offline. Reconnect and retry."); setSelected(null); } })
        .finally(() => { if (current) setLoading(false); });
    }, 200);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [preview, rehearsal, status, search, page, revision]);
  const select = row => { setSelected(row); setRiderId(row.riderId || ""); setReason(""); setPreviewNotice(""); };
  const act = action => mutation.submit(action, { expectedRevision: selected.revision,
    ...(action === "assign" ? { riderId, ...(reason.trim() ? { reason } : {}) } : action === "confirm_cash" ? { terminal } : { reason }) },
  payload => deliveryAction(selected.id, action, payload, { admin: true }), () => { refresh(); });
  const writable = rehearsal && data?.mode === "rehearsal";
  const previewRows = data?.deliveries.filter(row => (status === "all" || row.deliveryStatus === status) && row.orderNumber.toLowerCase().includes(search.toLowerCase())) || [];
  const rows = preview ? previewRows : data?.deliveries || [];
  return <AdminShell activeTab="deliveries" onTabChange={tab => router.push(`/admin?tab=${tab}`)} title="Delivery Management" subtitle="Manually assign restaurant riders; delivery and payment are separate." user={user} onLogout={logout} dashboard={null} searchQuery="" onSearchChange={() => {}} searchResults={[]} searching={false}>
    <div className="mx-auto max-w-[1600px] space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-dune-amber/30 bg-dune-amber/[0.06] p-4"><Info className="shrink-0 text-dune-amber" /><div><strong className="text-dune-amber">{preview ? "DESIGN PREVIEW · SYNTHETIC DATA" : writable ? "ISOLATED LOCAL REHEARSAL" : "PRIVATE DELIVERY WORKSPACE"}</strong><p className="mt-1 text-sm text-neutral-400">Live delivery disabled. No website delivery activation or customer notifications. {preview ? "Preview controls never dispatch or write records." : "Only explicitly enrolled own-delivery test orders are eligible."}</p></div></div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400"><button type="button" onClick={refresh} disabled={loading} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4"><RefreshCw size={17} />Refresh deliveries</button>{stamp && <time dateTime={stamp.toISOString()}>Last successful load: {stamp.toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh" })} Riyadh</time>}</div>
      <div className="grid gap-4 sm:grid-cols-3">{[["unassigned", Box], ["assigned", UserRound], ["picked_up", Truck]].map(([state, Icon]) => <div key={state} className={`${panelClass} flex items-center gap-4 p-5`}><Icon className="h-8 w-8 text-dune-amber" /><div><strong className="text-3xl text-white">{data?.counts?.[state] ?? "—"}</strong><p className="text-sm text-neutral-400">{deliveryStatusLabel(state)}</p></div></div>)}</div>
      {loading && <div role="status" className={`${panelClass} p-8 text-neutral-400`}>Loading delivery management…</div>}
      {error && <div role="alert" className="rounded-xl border border-red-500/30 p-5 text-red-200"><p>{error}</p><button type="button" onClick={refresh} className="mt-3 min-h-11 rounded-lg border border-white/20 px-4">Retry deliveries</button><a className="ml-4 text-amber-300 underline" href="/admin/deliveries">Return to private workspace</a></div>}
      {data?.mode === "disabled" && <div className={`${panelClass} space-y-3 p-6`}><h2 className="font-body text-xl font-semibold">Live delivery is not enabled</h2><p className="text-sm text-neutral-400">No operational orders were queried. Production remains disabled even if a future activation flag is set.</p>{data.previewAvailable && canManage && <a href="/admin/deliveries?preview=1" className="inline-flex min-h-11 items-center rounded-lg bg-dune-amber px-4 text-black">Open design preview</a>}{data.workflowAvailable && <a href="/admin/deliveries?rehearsal=1" className="ml-3 inline-flex min-h-11 items-center rounded-lg border border-dune-amber px-4 text-dune-amber">Open isolated workflow rehearsal</a>}</div>}
      {data && data.mode !== "disabled" && <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
        <section className={`${panelClass} min-w-0 overflow-hidden`} aria-label="Delivery orders">
          <div className="flex flex-wrap gap-3 border-b border-white/10 p-4"><label className="relative min-w-0 flex-1"><span className="sr-only">Search order number</span><Search className="absolute left-3 top-3 text-neutral-500" size={18} /><input className={`${inputClass} pl-10`} placeholder="Search order number…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} maxLength={80} /></label><div className="w-48"><DarkSelect aria-label="Delivery status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>{states.map(state => <option key={state} value={state}>{state === "all" ? "All" : deliveryStatusLabel(state)}</option>)}</DarkSelect></div></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-neutral-400"><tr>{["Order", "Customer", "Restaurant", "Delivery", "Rider", "To Collect", "Action"].map(label => <th className="whitespace-nowrap p-4" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className={`border-t border-white/[0.07] ${selected?.id === row.id ? "bg-dune-amber/10" : ""}`}><td className="whitespace-nowrap p-4 font-semibold text-white">{row.orderNumber}</td><td className="max-w-40 break-words p-4">{row.customerName}</td><td className="p-4"><span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">{row.restaurantStatus}</span></td><td className="whitespace-nowrap p-4 text-dune-amber">{deliveryStatusLabel(row.deliveryStatus)}</td><td className="max-w-36 break-words p-4">{row.riderName || "—"}</td><td className="whitespace-nowrap p-4">{row.amountToCollect == null ? "Unavailable" : formatPrice(row.amountToCollect)}<p className="text-xs text-neutral-500">{row.paymentStatus}</p></td><td className="p-4"><button type="button" onClick={() => select(row)} className="min-h-11 rounded-lg border border-dune-amber/50 px-4 text-dune-amber">{canManage && ["unassigned", "assigned"].includes(row.deliveryStatus) ? "Assign" : "Details"}</button></td></tr>)}</tbody></table></div>
          {!rows.length && <p className="p-8 text-neutral-400">No matching deliveries. This is a successful empty result.</p>}
          <div className="flex items-center justify-between border-t border-white/10 p-4 text-xs text-neutral-400"><span>{preview ? `${rows.length} synthetic examples` : `${data.pagination.total} matching records · page ${page}`}</span>{!preview && <div className="flex gap-3"><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)} className="min-h-11 px-3 disabled:opacity-40">Previous</button><button type="button" disabled={page * 20 >= data.pagination.total} onClick={() => setPage(value => value + 1)} className="min-h-11 px-3 disabled:opacity-40">Next</button></div>}</div>
        </section>
        <aside className={`${panelClass} space-y-4 p-5`} aria-label="Delivery assignment and reconciliation"><h2 className="font-body text-xl font-semibold">{canManage ? "Assign Rider" : "Cashier Confirmation"}</h2>
          {!selected && <p className="text-sm text-neutral-400">Select a delivery to inspect or act on it.</p>}
          {selected && <><p className="break-all font-semibold">{selected.orderNumber}</p><p className="text-sm text-neutral-400">Delivery: {deliveryStatusLabel(selected.deliveryStatus)} · Cash: {selected.cashReport?.status}</p>
            {selected.eligibilityWarning && <p role="alert" className="text-sm text-amber-300">{selected.eligibilityWarning}</p>}
            {canManage && selected.canOperate !== false && ["unassigned", "assigned"].includes(selected.deliveryStatus) && <><fieldset className="space-y-3"><legend className="mb-2 text-sm">Choose an active rider</legend>{data.riders.map(rider => <label key={rider.id} className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-3 ${riderId === rider.id ? "border-dune-amber" : "border-white/10"}`}><input type="radio" name="rider" checked={riderId === rider.id} onChange={() => setRiderId(rider.id)} disabled={!rider.available} /><span className="min-w-0 flex-1 break-words">{rider.name}<small className="block text-neutral-400">{rider.activeCount} active deliveries · {rider.available ? "Available" : "Unavailable"}</small></span></label>)}</fieldset><button type="button" disabled={mutation.pending || !riderId || (selected.riderId && !reason.trim())} onClick={() => preview ? setPreviewNotice("Preview selection only. No record was assigned or dispatched.") : act("assign")} className="min-h-12 w-full rounded-xl bg-dune-amber p-3 font-semibold text-black disabled:opacity-40">{preview ? "Preview Assignment" : selected.riderId ? "Reassign · Isolated Test" : "Assign · Isolated Test"}</button></>}
            {writable && canManage && <label className="block text-sm text-neutral-400">Authorization reason / resolution (no customer contact details)<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white" /></label>}
            {writable && canManage && selected.deliveryStatus === "issue" && <button type="button" disabled={mutation.pending || !reason.trim()} onClick={() => act("resolve_issue")} className="min-h-11 w-full rounded-xl border border-dune-amber px-3 text-dune-amber">Resolve issue · Resume same rider/stage</button>}
            {writable && canManage && selected.cashReport?.status === "discrepancy" && !selected.cashReport.acknowledgedAt && <button type="button" disabled={mutation.pending || !reason.trim()} onClick={() => act("acknowledge_cash")} className="min-h-11 w-full rounded-xl border border-dune-amber px-3 text-dune-amber">Acknowledge shortage · No payment posting</button>}
            {selected.cashConfirmationGap && <p className="text-sm text-amber-300" role="alert">{selected.cashConfirmationGap}</p>}
            {writable && selected.canConfirmCash && <><label className="block text-sm text-neutral-400">Your open cashier terminal<input value={terminal} onChange={event => setTerminal(event.target.value)} maxLength={60} className={`${inputClass} mt-2`} /></label><p className="text-xs text-neutral-400">Backend validates your own open drawer. Confirmation uses the existing payment/shift ledger once.</p><button type="button" disabled={mutation.pending || !terminal.trim()} onClick={() => act("confirm_cash")} className="min-h-12 w-full rounded-xl bg-dune-amber p-3 font-semibold text-black disabled:opacity-40">Confirm Cashier Receipt · Isolated Test</button></>}
            <details key={`${selected.id}-${revision}`}><summary className="cursor-pointer py-3 text-sm text-dune-amber">View delivery details</summary><DeliveryDetailContent id={selected.id} preview={preview} rehearsal={rehearsal} admin afterChange={refresh} /></details>
          </>}
          {previewNotice && <p role="status" className="text-sm text-amber-300">{previewNotice}</p>}
          <p className="border-t border-white/10 pt-4 text-xs text-neutral-400">Delivered and Paid are tracked separately. Availability never auto-assigns.</p>
        </aside>
      </div>}
      {mutation.error && <p role="alert" className="rounded-xl border border-red-500/30 p-4 text-red-200">{mutation.error}</p>}{mutation.message && <p role="status" className="p-3 text-emerald-300">{mutation.message}</p>}
      {writable && canManage && <OwnDeliveryEnrollment afterChange={refresh} />}
    </div>
  </AdminShell>;
}
export default function DeliveryManagement(props) { return <ProtectedRoute roles={["admin", "manager", "cashier"]}><ManagementContent {...props} rehearsal={props.rehearsal && !props.preview} /></ProtectedRoute>; }
