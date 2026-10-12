"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, RefreshCw, Search } from "lucide-react";
import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import AdminShell from "@/src/components/admin/AdminShell.jsx";
import { useAuth } from "@/src/context/AuthContext.jsx";
import { deliveryAction } from "@/src/api/deliveryApi.js";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import { inputClass, panelClass } from "@/src/components/admin/staff/staffUi.jsx";
import useDeliverySubmission from "@/src/hooks/useDeliverySubmission.js";
import useDeliveryManagement from "@/src/hooks/useDeliveryManagement.js";
import { DeliveryDetailContent } from "@/src/components/rider/RiderDeliveryDetails.jsx";
import { deliveryStatusLabel } from "@/src/components/rider/deliveryPresentation.js";
import { emptyDeliveryQuery } from "./deliveryWorkspace.js";
import DeliveryHealthPanel, { attentionLabels, cashLabels, CashVisibility } from "./DeliveryHealthPanel.jsx";
import OwnDeliveryEnrollment from "./OwnDeliveryEnrollment.jsx";

const states = ["all", "unassigned", "assigned", "picked_up", "delivered", "issue"];
function WorkflowButton({ children, action, onAction, disabled }) {
  return <button type="button" disabled={disabled} onClick={() => onAction(action)} className="min-h-12 w-full rounded-xl border border-dune-amber p-3 text-dune-amber disabled:opacity-40">{children}</button>;
}
function ManagementContent({ preview, rehearsal }) {
  const { user, logout } = useAuth(), router = useRouter();
  const canManage = ["admin", "manager"].includes(user?.role);
  const view = useDeliveryManagement({ preview, rehearsal });
  const { data, loading, error, stamp, selected, changed, detailError, detailLoading, query, dataQuery } = view;
  const [draft, setDraft] = useState(emptyDeliveryQuery), [riderId, setRiderId] = useState(""), [reason, setReason] = useState(""), [terminal, setTerminal] = useState("MAIN");
  const [previewNotice, setPreviewNotice] = useState("");
  const mutation = useDeliverySubmission(), actionLock = useRef(false);
  const refresh = () => { if (!actionLock.current) void view.workspace.current?.load(); };
  const apply = next => { if (!actionLock.current) void view.workspace.current?.load(next); };
  const filter = values => { const next = { ...emptyDeliveryQuery(), ...values }; setDraft(next); apply(next); };
  const select = row => {
    if (actionLock.current || mutation.pending || row.id === selected?.id) return;
    if (view.workspace.current?.select(row)) { setRiderId(row.riderId || ""); setReason(""); setPreviewNotice(""); }
  };
  const blocked = mutation.pending || loading || detailLoading || Boolean(detailError) || changed || Boolean(error);
  const act = async action => {
    if (blocked || actionLock.current || !selected) return;
    const id = selected.id, workspace = view.workspace.current;
    actionLock.current = true; workspace.lock(true);
    try {
      await mutation.submit(`${id}:${action}`, { expectedRevision: selected.revision,
        ...(action === "assign" ? { riderId, ...(reason.trim() ? { reason } : {}) } : action === "confirm_cash" ? { terminal } : { reason }) },
      payload => deliveryAction(id, action, payload, { admin: true }), () => { workspace.lock(false); void workspace.load(); });
    } finally { actionLock.current = false; workspace.lock(false); }
  };
  const operational = data?.mode === "operational";
  const writable = !preview && (operational || (rehearsal && data?.mode === "rehearsal"));
  const visibleQuery = dataQuery || query;
  const rows = preview ? (data?.deliveries || []).filter(row => (visibleQuery.status === "all" || row.deliveryStatus === visibleQuery.status) && row.orderNumber.toLowerCase().includes(visibleQuery.search.toLowerCase())) : data?.deliveries || [];
  const outside = selected && !rows.some(row => row.id === selected.id);
  const assignmentAllowed = selected?.canOperate !== false && ["unassigned", "assigned"].includes(selected?.deliveryStatus);
  const editDraft = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  return <AdminShell activeTab="deliveries" onTabChange={tab => router.push(`/admin?tab=${tab}`)} title="Delivery Management" subtitle="Manually assign restaurant riders; delivery and payment are separate." user={user} onLogout={logout} dashboard={null} searchQuery="" onSearchChange={() => {}} searchResults={[]} searching={false}>
    <div className="mx-auto max-w-[1600px] space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-dune-amber/30 bg-dune-amber/[0.06] p-4"><Info className="shrink-0 text-dune-amber" /><div><strong className="text-dune-amber">{preview ? "DESIGN PREVIEW · SYNTHETIC DATA" : operational ? "RESTAURANT DELIVERY ENABLED" : writable ? "ISOLATED LOCAL REHEARSAL" : "DELIVERY RIDER DISABLED"}</strong><p className="mt-1 text-sm text-neutral-400">{operational ? "Manual restaurant delivery. Website checkout options are unchanged." : preview ? "Live delivery disabled in preview. Controls never dispatch or write records." : "Live delivery disabled. Enable Delivery Rider in Admin Settings, or use an isolated test rehearsal."}</p></div></div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400"><button type="button" onClick={refresh} disabled={loading || mutation.pending} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 disabled:opacity-40"><RefreshCw size={17} />Refresh deliveries</button>{stamp && <time dateTime={stamp.toISOString()} title={stamp.toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })}>Last successful update: {stamp.toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })} Riyadh</time>}<span>Manual refresh only — no timer or focus refresh.</span></div>
      {loading && <p role="status" className="text-sm text-neutral-400">{data ? "Refreshing… previous results remain visible until verified." : "Loading delivery management…"}</p>}
      {error && <div role="alert" className="rounded-xl border border-red-500/30 p-5 text-red-200"><p>{data ? "Retained results may be outdated. " : ""}{error}</p><button type="button" disabled={loading || mutation.pending} onClick={refresh} className="mt-3 min-h-11 rounded-lg border border-white/20 px-4">Retry deliveries</button></div>}
      <div className="grid gap-4 sm:grid-cols-3">{["unassigned", "assigned", "picked_up"].map(state => <div key={state} className={`${panelClass} p-5`}><strong className="text-3xl text-white">{data?.counts?.[state] ?? "—"}</strong><p className="text-sm text-neutral-400">{deliveryStatusLabel(state)}</p></div>)}</div>
      {data?.mode === "disabled" && <div className={`${panelClass} space-y-3 p-6`}><h2 className="font-body text-xl font-semibold">Live delivery is not enabled</h2><p className="text-sm text-neutral-400">No operational orders were queried. Existing delivery records and payments are preserved.</p>{user?.role === "admin" && <a href="/admin?tab=settings" className="block text-dune-amber underline">Open Settings · Delivery Rider</a>}{data.previewAvailable && canManage && <a href="/admin/deliveries?preview=1" className="inline-flex min-h-11 items-center rounded-lg bg-dune-amber px-4 text-black">Open design preview</a>}{data.workflowAvailable && <a href="/admin/deliveries?rehearsal=1" className="ml-3 inline-flex min-h-11 items-center rounded-lg border border-dune-amber px-4 text-dune-amber">Open isolated workflow rehearsal</a>}</div>}
      {data && data.mode !== "disabled" && <><DeliveryHealthPanel health={data.health} onFilter={filter} disabled={loading || mutation.pending} preview={preview} /><div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
        <section className={`${panelClass} min-w-0 overflow-hidden`} aria-label="Delivery orders">
          <form onSubmit={event => { event.preventDefault(); apply({ ...draft, search: draft.search.trim(), page: 1 }); }} className="flex flex-wrap gap-3 border-b border-white/10 p-4">
            <label className="relative min-w-48 flex-1"><span className="sr-only">Search order number</span><Search className="absolute left-3 top-3 text-neutral-500" size={18} /><input className={`${inputClass} pl-10`} placeholder="Search order number…" value={draft.search} onChange={event => editDraft("search", event.target.value)} maxLength={80} /></label>
            <div className="w-44"><DarkSelect aria-label="Delivery status" value={draft.status} onChange={event => editDraft("status", event.target.value)}>{states.map(state => <option key={state} value={state}>{state === "all" ? "All deliveries" : deliveryStatusLabel(state)}</option>)}</DarkSelect></div>
            {!preview && <><div className="w-52"><DarkSelect aria-label="Cash status" value={draft.cashStatus} onChange={event => editDraft("cashStatus", event.target.value)}><option value="all">All cash states</option>{Object.entries(cashLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="confirmed_today">Confirmed · Today Riyadh</option></DarkSelect></div><div className="w-48"><DarkSelect aria-label="Attention condition" value={draft.attention} onChange={event => editDraft("attention", event.target.value)}><option value="all">All attention states</option>{Object.entries(attentionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</DarkSelect></div></>}
            <button type="submit" disabled={mutation.pending || loading} className="min-h-11 rounded-xl bg-dune-amber px-4 font-semibold text-black disabled:opacity-40">Search / Apply</button><button type="button" disabled={mutation.pending || loading} onClick={() => filter({})} className="min-h-11 rounded-xl border border-white/20 px-4 disabled:opacity-40">Reset filters</button>
          </form>
          <p className="border-b border-white/10 px-4 py-2 text-xs text-neutral-400">Applied: {visibleQuery.search || "all order numbers"} · {visibleQuery.status} · {cashLabels[visibleQuery.cashStatus] || (visibleQuery.cashStatus === "confirmed_today" ? "Confirmed Today" : "all cash states")} · {attentionLabels[visibleQuery.attention] || "all attention states"}. {loading ? "New query loading; table still shows the previous applied query." : "Draft filters apply only with Search / Apply."}</p>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-neutral-400"><tr>{["Order", "Customer", "Restaurant", "Delivery", "Rider", "Cash / Payment", "Action"].map(label => <th className="whitespace-nowrap p-4" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className={`border-t border-white/[0.07] ${selected?.id === row.id ? "bg-dune-amber/10" : ""}`}><td className="whitespace-nowrap p-4 font-semibold text-white">{row.orderNumber}</td><td className="max-w-40 break-words p-4">{row.customerName}</td><td className="p-4"><span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">{row.restaurantStatus}</span></td><td className="whitespace-nowrap p-4 text-dune-amber">{deliveryStatusLabel(row.deliveryStatus)}</td><td className="max-w-36 break-words p-4">{row.riderName || "—"}</td><td className="p-4"><CashVisibility delivery={row} /></td><td className="p-4"><button type="button" disabled={mutation.pending || loading} onClick={() => select(row)} className="min-h-11 rounded-lg border border-dune-amber/50 px-4 text-dune-amber disabled:opacity-40">{canManage && ["unassigned", "assigned"].includes(row.deliveryStatus) ? "Assign" : "Details"}</button></td></tr>)}</tbody></table></div>
          {!rows.length && <p className="p-8 text-neutral-400">No matching deliveries. This is a successful empty result.</p>}
          <div className="flex items-center justify-between border-t border-white/10 p-4 text-xs text-neutral-400"><span>{preview ? `${rows.length} synthetic examples` : `${data.pagination.total} matching records · page ${data.pagination.page}`}</span>{!preview && <div className="flex gap-3"><button type="button" disabled={loading || mutation.pending || query.page === 1} onClick={() => apply({ ...query, page: query.page - 1 })} className="min-h-11 px-3 disabled:opacity-40">Previous</button><button type="button" disabled={loading || mutation.pending || query.page * 20 >= data.pagination.total} onClick={() => apply({ ...query, page: query.page + 1 })} className="min-h-11 px-3 disabled:opacity-40">Next</button></div>}</div>
        </section>
        <aside className={`${panelClass} space-y-4 p-5`} aria-label="Delivery assignment and reconciliation"><h2 className="font-body text-xl font-semibold">{canManage ? "Assign Rider" : "Cashier Confirmation"}</h2>
          {!selected && <p className="text-sm text-neutral-400">Select a delivery to inspect or act on it.</p>}
          {selected && <><p className="break-all font-semibold">{selected.orderNumber}</p><p className="text-sm text-neutral-400">Delivery: {deliveryStatusLabel(selected.deliveryStatus)}</p><CashVisibility delivery={selected} />
            {outside && <p className="text-xs text-amber-300">Selected delivery is outside the applied results. Its authorized detail and your drafts are retained.</p>}
            {detailLoading && <p role="status" className="text-xs text-neutral-400">Verifying selected delivery…</p>}
            {detailError && <p role="alert" className="text-sm text-red-200">Selected delivery could not be verified. Drafts retained; actions blocked. {detailError}</p>}
            {changed && <div role="alert" className="space-y-2 rounded-lg border border-amber-500/40 p-3 text-sm text-amber-300"><p>Order changed — review latest information. Drafts have been retained; actions are blocked.</p><button type="button" disabled={detailLoading || Boolean(detailError) || mutation.pending} onClick={() => view.workspace.current?.review()} className="min-h-11 rounded-lg border border-amber-400 px-3">I reviewed the latest delivery</button></div>}
            {selected.eligibilityWarning && <p role="alert" className="text-sm text-amber-300">{selected.eligibilityWarning}</p>}
            {canManage && riderId && !data.riders.some(rider => rider.id === riderId && rider.available) && <p className="text-xs text-amber-300">Your rider selection is retained but no longer available for assignment. Choose an available rider before submitting.</p>}
            {canManage && <><fieldset className="space-y-3" disabled={blocked || !assignmentAllowed}><legend className="mb-2 text-sm">Choose an active rider {assignmentAllowed ? "" : "· assignment unavailable at this stage"}</legend>{data.riders.map(rider => <label key={rider.id} className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 ${riderId === rider.id ? "border-dune-amber" : "border-white/10"}`}><input type="radio" name="rider" checked={riderId === rider.id} onChange={() => setRiderId(rider.id)} disabled={!rider.available} /><span className="min-w-0 flex-1 break-words">{rider.name}<small className="block text-neutral-400">{rider.activeCount} active deliveries · {rider.available ? "Available" : "Unavailable"}</small></span></label>)}</fieldset><button type="button" disabled={blocked || !assignmentAllowed || !data.riders.some(row => row.id === riderId && row.available) || (selected.riderId && !reason.trim())} onClick={() => preview ? setPreviewNotice("Preview selection only. No record was assigned or dispatched.") : act("assign")} className="min-h-12 w-full rounded-xl bg-dune-amber p-3 font-semibold text-black disabled:opacity-40">{preview ? "Preview Assignment" : selected.riderId ? operational ? "Reassign Rider" : "Reassign · Isolated Test" : operational ? "Assign Rider" : "Assign · Isolated Test"}</button></>}
            {writable && canManage && <label className="block text-sm text-neutral-400">Authorization reason / resolution (no customer contact details)<textarea value={reason} disabled={mutation.pending} onChange={event => setReason(event.target.value)} maxLength={500} className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white" /></label>}
            {writable && canManage && selected.deliveryStatus === "issue" && <WorkflowButton action="resolve_issue" onAction={act} disabled={blocked || !reason.trim()}>Resolve issue · Resume same rider/stage</WorkflowButton>}
            {writable && canManage && selected.cashReport?.status === "discrepancy" && !selected.cashReport.acknowledgedAt && <WorkflowButton action="acknowledge_cash" onAction={act} disabled={blocked || !reason.trim()}>Acknowledge shortage · No payment posting</WorkflowButton>}
            {selected.cashConfirmationGap && <p className="text-sm text-amber-300" role="alert">{selected.cashConfirmationGap}</p>}
            {writable && <label className="block text-sm text-neutral-400">Your open cashier terminal<input value={terminal} disabled={mutation.pending} onChange={event => setTerminal(event.target.value)} maxLength={60} className={`${inputClass} mt-2`} /></label>}
            {writable && selected.canConfirmCash && <><p className="text-xs text-neutral-400">Backend validates your own open drawer. Confirmation uses the existing payment/shift ledger once.</p><WorkflowButton action="confirm_cash" onAction={act} disabled={blocked || !terminal.trim()}>{operational ? "Confirm Cashier Receipt" : "Confirm Cashier Receipt · Isolated Test"}</WorkflowButton></>}
            <details key={selected.id}><summary className="cursor-pointer py-3 text-sm text-dune-amber">View delivery details</summary>{selected.items ? <DeliveryDetailContent id={selected.id} record={selected} stamp={view.selectedStamp} onRefresh={refresh} preview={preview} rehearsal={rehearsal} admin /> : <p className="text-sm text-neutral-400">{detailError ? "Details unavailable; Retry deliveries to verify." : "Loading authorized details…"}</p>}</details>
          </>}
          {previewNotice && <p role="status" className="text-sm text-amber-300">{previewNotice}</p>}<p className="border-t border-white/10 pt-4 text-xs text-neutral-400">Delivered and Paid are tracked separately. Availability never auto-assigns.</p>
        </aside>
      </div></>}
      {mutation.error && <p role="alert" className="rounded-xl border border-red-500/30 p-4 text-red-200">{mutation.error}</p>}{mutation.message && <p role="status" className="p-3 text-emerald-300">{mutation.message}</p>}
      {writable && canManage && <OwnDeliveryEnrollment afterChange={refresh} rehearsal={!operational} />}
    </div>
  </AdminShell>;
}
export default function DeliveryManagement(props) { return <ProtectedRoute roles={["admin", "manager", "cashier"]}><ManagementContent {...props} rehearsal={props.rehearsal && !props.preview} /></ProtectedRoute>; }
