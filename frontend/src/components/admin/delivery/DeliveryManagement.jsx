"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, RefreshCw } from "lucide-react";
import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import AdminShell from "@/src/components/admin/AdminShell.jsx";
import { useAuth } from "@/src/context/AuthContext.jsx";
import { deliveryAction } from "@/src/api/deliveryApi.js";
import { inputClass, panelClass } from "@/src/components/admin/staff/staffUi.jsx";
import useDeliverySubmission from "@/src/hooks/useDeliverySubmission.js";
import useDeliveryManagement from "@/src/hooks/useDeliveryManagement.js";
import { deliveryStatusLabel } from "@/src/components/rider/deliveryPresentation.js";
import { emptyDeliveryQuery } from "./deliveryWorkspace.js";
import DeliveryHealthPanel, { CashVisibility } from "./DeliveryHealthPanel.jsx";
import OwnDeliveryEnrollment from "./OwnDeliveryEnrollment.jsx";
import DeliveryFilters from "./DeliveryFilters.jsx";
import DeliveryRows from "./DeliveryRows.jsx";
import DeliveryDialog from "./DeliveryDialog.jsx";
import ManagementDeliveryDetails from "./ManagementDeliveryDetails.jsx";
import DeliveryTimeline from "./DeliveryTimeline.jsx";
import { assignmentConfirmation, canAssignDelivery, confirmationStillCurrent } from "./deliveryManagementPresentation.js";

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
  const [detailsOpen, setDetailsOpen] = useState(false), [confirmation, setConfirmation] = useState(null);
  const mutation = useDeliverySubmission(), actionLock = useRef(false);
  const refresh = () => { if (!actionLock.current && !confirmation) void view.workspace.current?.load(); };
  const apply = next => { if (!actionLock.current && !confirmation) void view.workspace.current?.load(next); };
  const filter = values => { const next = { ...emptyDeliveryQuery(), ...values }; setDraft(next); apply(next); };
  const select = row => {
    if (actionLock.current || mutation.pending || confirmation) return;
    setDetailsOpen(true);
    if (row.id !== selected?.id && view.workspace.current?.select(row)) { setRiderId(row.riderId || ""); setReason(""); setPreviewNotice(""); }
  };
  const blocked = mutation.pending || loading || detailLoading || Boolean(detailError) || changed || Boolean(error);
  const act = async action => {
    if (blocked || actionLock.current || !selected) return;
    if (action === "assign" && !confirmationStillCurrent(confirmation, selected, data.riders.find(row => row.id === riderId), reason)) return;
    const id = selected.id, workspace = view.workspace.current;
    actionLock.current = true; workspace.lock(true);
    try {
      const result = await mutation.submit(`${id}:${action}`, { expectedRevision: selected.revision,
        ...(action === "assign" ? { riderId, ...(reason.trim() ? { reason } : {}) } : action === "confirm_cash" ? { terminal } : { reason }) },
      payload => deliveryAction(id, action, payload, { admin: true }), () => { workspace.lock(false); void workspace.load(); });
      if (result && action === "assign") setConfirmation(null);
    } finally { actionLock.current = false; workspace.lock(false); }
  };
  const operational = data?.mode === "operational";
  const writable = !preview && (operational || (rehearsal && data?.mode === "rehearsal"));
  const visibleQuery = dataQuery || query;
  const rows = preview ? (data?.deliveries || []).filter(row => (visibleQuery.status === "all" || row.deliveryStatus === visibleQuery.status) && row.orderNumber.toLowerCase().includes(visibleQuery.search.toLowerCase())) : data?.deliveries || [];
  const outside = selected && !rows.some(row => row.id === selected.id);
  const assignmentAllowed = selected?.canOperate !== false && ["unassigned", "assigned"].includes(selected?.deliveryStatus);
  const editDraft = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const selectedRider = data?.riders?.find(row => row.id === riderId);
  const canAssign = canAssignDelivery(selected, selectedRider, reason);
  const controlsBusy = loading || mutation.pending || Boolean(confirmation);
  const filterRiders = [...new Map([...(data?.riderFilters || []), ...(data?.riders || [])].map(row => [row.id, row])).values()];
  return <AdminShell activeTab="deliveries" onTabChange={tab => router.push(`/admin?tab=${tab}`)} title="Delivery Management" subtitle="Manually assign restaurant riders; delivery and payment are separate." user={user} onLogout={logout} dashboard={null} searchQuery="" onSearchChange={() => {}} searchResults={[]} searching={false}>
    <div className="mx-auto max-w-[1600px] space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-dune-amber/30 bg-dune-amber/[0.06] p-4"><Info className="shrink-0 text-dune-amber" /><div><strong className="text-dune-amber">{preview ? "DESIGN PREVIEW · SYNTHETIC DATA" : operational ? "RESTAURANT DELIVERY ENABLED" : writable ? "ISOLATED LOCAL REHEARSAL" : "DELIVERY RIDER DISABLED"}</strong><p className="mt-1 text-sm text-neutral-400">{operational ? "Manual restaurant delivery. Website checkout options are unchanged." : preview ? "Live delivery disabled in preview. Controls never dispatch or write records." : "Live delivery disabled. Enable Delivery Rider in Admin Settings, or use an isolated test rehearsal."}</p></div></div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400"><button type="button" onClick={refresh} disabled={controlsBusy} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 disabled:opacity-40"><RefreshCw size={17} />Refresh deliveries</button>{stamp && <time dateTime={stamp.toISOString()} title={stamp.toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })}>Last successful update: {stamp.toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })} Riyadh</time>}<span>Manual refresh only — no timer or focus refresh.</span></div>
      {loading && <p role="status" className="text-sm text-neutral-400">{data ? "Refreshing… previous results remain visible until verified." : "Loading delivery management…"}</p>}
      {error && <div role="alert" className="rounded-xl border border-red-500/30 p-5 text-red-200"><p>{data ? "Retained results may be outdated. " : ""}{error}</p><button type="button" disabled={loading || mutation.pending} onClick={refresh} className="mt-3 min-h-11 rounded-lg border border-white/20 px-4">Retry deliveries</button></div>}
      <p className="text-xs text-neutral-400">Summary: overall authorized scope · all time, independent of filters.</p>
      <div className="grid gap-4 sm:grid-cols-3">{["unassigned", "assigned", "picked_up"].map(state => <button type="button" key={state} disabled={controlsBusy || !data || data.mode === "disabled"} onClick={() => filter({ status: state })} className={`${panelClass} p-5 text-left disabled:opacity-40`}><strong className="text-3xl text-white">{data?.counts?.[state] ?? "—"}</strong><p className="text-sm text-neutral-400">{deliveryStatusLabel(state)}</p></button>)}</div>
      {data?.mode === "disabled" && <div className={`${panelClass} space-y-3 p-6`}><h2 className="font-body text-xl font-semibold">Live delivery is not enabled</h2><p className="text-sm text-neutral-400">No operational orders were queried. Existing delivery records and payments are preserved.</p>{user?.role === "admin" && <a href="/admin?tab=settings" className="block text-dune-amber underline">Open Settings · Delivery Rider</a>}{data.previewAvailable && canManage && <a href="/admin/deliveries?preview=1" className="inline-flex min-h-11 items-center rounded-lg bg-dune-amber px-4 text-black">Open design preview</a>}{data.workflowAvailable && <a href="/admin/deliveries?rehearsal=1" className="ml-3 inline-flex min-h-11 items-center rounded-lg border border-dune-amber px-4 text-dune-amber">Open isolated workflow rehearsal</a>}</div>}
      {data && data.mode !== "disabled" && <><DeliveryHealthPanel health={data.health} onFilter={filter} disabled={controlsBusy} preview={preview} /><div className="space-y-5">
        <section className={`${panelClass} min-w-0 overflow-hidden`} aria-label="Delivery orders">
          <DeliveryFilters draft={draft} editDraft={editDraft} apply={apply} reset={() => filter({})} disabled={controlsBusy} preview={preview} canManage={canManage} riders={filterRiders} ridersHasMore={data.riderFiltersHasMore} applied={visibleQuery} loading={loading} matching={preview ? rows.length : data.pagination.total} />
          <DeliveryRows rows={rows} selected={selected} canManage={canManage} disabled={controlsBusy} select={select} />
          {!rows.length && <p className="p-8 text-neutral-400">No matching deliveries. This is a successful empty result.</p>}
          <div className="flex items-center justify-between border-t border-white/10 p-4 text-xs text-neutral-400"><span>{preview ? `${rows.length} synthetic examples` : `${data.pagination.total} matching records · page ${data.pagination.page}`}</span>{!preview && <div className="flex gap-3"><button type="button" disabled={controlsBusy || query.page === 1} onClick={() => apply({ ...query, page: query.page - 1 })} className="min-h-11 px-3 disabled:opacity-40">Previous</button><button type="button" disabled={controlsBusy || query.page * 20 >= data.pagination.total} onClick={() => apply({ ...query, page: query.page + 1 })} className="min-h-11 px-3 disabled:opacity-40">Next</button></div>}</div>
        </section>
        {!selected && <p className="text-sm text-neutral-400">Select a delivery to inspect or act on it.</p>}
        {selected && <div className={`${panelClass} flex flex-wrap items-center gap-3 p-4`}><p className="min-w-0 break-all text-sm">Selected: {selected.orderNumber}</p><button id="delivery-selected-control" type="button" onClick={() => setDetailsOpen(true)} className="min-h-11 rounded-lg border border-dune-amber/50 px-3 text-dune-amber">Open selected delivery</button>{outside && !detailsOpen && <p className="w-full text-xs text-amber-300">Selected delivery is outside the applied results. Its authorized detail and your drafts are retained.</p>}</div>}
        <DeliveryDialog open={detailsOpen && Boolean(selected)} onClose={() => setDetailsOpen(false)} busy={mutation.pending || Boolean(confirmation)} title="Delivery details & actions">
          {selected && <><p className="break-all font-semibold">{selected.orderNumber}</p><p className="text-sm text-neutral-400">Delivery: {deliveryStatusLabel(selected.deliveryStatus)}</p><CashVisibility delivery={selected} />
            {outside && <p className="text-xs text-amber-300">Selected delivery is outside the applied results. Its authorized detail and your drafts are retained.</p>}
            {detailLoading && <p role="status" className="text-xs text-neutral-400">Verifying selected delivery…</p>}
            {detailError && <p role="alert" className="text-sm text-red-200">Selected delivery could not be verified. Drafts retained; actions blocked. {detailError}</p>}
            {error && <p role="alert" className="text-sm text-red-200">Workspace refresh failed. Retained information may be outdated; actions blocked. {error}</p>}
            {changed && <div role="alert" className="space-y-2 rounded-lg border border-amber-500/40 p-3 text-sm text-amber-300"><p>Order changed — review latest information. Drafts have been retained; actions are blocked.</p><button type="button" disabled={detailLoading || Boolean(detailError) || mutation.pending} onClick={() => view.workspace.current?.review()} className="min-h-11 rounded-lg border border-amber-400 px-3">I reviewed the latest delivery</button></div>}
            {selected.eligibilityWarning && <p role="alert" className="text-sm text-amber-300">{selected.eligibilityWarning}</p>}
            <DeliveryTimeline key={`timeline:${selected.id}`} timeline={selected.timeline} preview={preview} />
            {canManage && riderId && !data.riders.some(rider => rider.id === riderId && rider.available) && <p className="text-xs text-amber-300">Your rider selection is retained but no longer available for assignment. Choose an available rider before submitting.</p>}
            {canManage && assignmentAllowed && <><fieldset className="space-y-3" disabled={blocked || Boolean(confirmation)}><legend className="mb-2 text-sm">Choose an active rider</legend>{data.riders.map(rider => <label key={rider.id} className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 ${riderId === rider.id ? "border-dune-amber" : "border-white/10"}`}><input type="radio" name="rider" checked={riderId === rider.id} onChange={() => setRiderId(rider.id)} disabled={!rider.available} /><span className="min-w-0 flex-1 break-words">{rider.name}<small className="block text-neutral-400">{rider.activeCount} active deliveries · {rider.available ? "Available" : "Unavailable"}</small></span></label>)}</fieldset>{selected.riderId === riderId && riderId && <p className="text-xs text-amber-300">This rider is already assigned. Choose a different rider and give a reassignment reason.</p>}<button type="button" disabled={blocked || !canAssign || Boolean(confirmation)} onClick={() => setConfirmation(assignmentConfirmation(selected, selectedRider, reason))} className="min-h-12 w-full rounded-xl bg-dune-amber p-3 font-semibold text-black disabled:opacity-40">{preview ? "Preview Assignment" : selected.riderId ? operational ? "Reassign Rider" : "Reassign · Isolated Test" : operational ? "Assign Rider" : "Assign · Isolated Test"}</button></>}
            {writable && canManage && <label className="block text-sm text-neutral-400">Authorization reason / resolution (no customer contact details)<textarea value={reason} disabled={mutation.pending} onChange={event => setReason(event.target.value)} maxLength={500} className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white" /></label>}
            {writable && canManage && selected.deliveryStatus === "issue" && <WorkflowButton action="resolve_issue" onAction={act} disabled={blocked || !reason.trim()}>Resolve issue · Resume same rider/stage</WorkflowButton>}
            {writable && canManage && selected.cashReport?.status === "discrepancy" && !selected.cashReport.acknowledgedAt && <WorkflowButton action="acknowledge_cash" onAction={act} disabled={blocked || !reason.trim()}>Acknowledge shortage · No payment posting</WorkflowButton>}
            {selected.cashConfirmationGap && <p className="text-sm text-amber-300" role="alert">{selected.cashConfirmationGap}</p>}
            {writable && <label className="block text-sm text-neutral-400">Your open cashier terminal<input value={terminal} disabled={mutation.pending} onChange={event => setTerminal(event.target.value)} maxLength={60} className={`${inputClass} mt-2`} /></label>}
            {writable && selected.canConfirmCash && <><p className="text-xs text-neutral-400">Backend validates your own open drawer. Confirmation uses the existing payment/shift ledger once.</p><WorkflowButton action="confirm_cash" onAction={act} disabled={blocked || !terminal.trim()}>{operational ? "Confirm Cashier Receipt" : "Confirm Cashier Receipt · Isolated Test"}</WorkflowButton></>}
            <button type="button" onClick={refresh} disabled={controlsBusy} className="min-h-11 rounded-lg border border-white/15 px-3 text-sm text-neutral-300 disabled:opacity-40">Refresh selected & list</button>
            <ManagementDeliveryDetails key={selected.id} selected={selected} />
          </>}
          {previewNotice && <p role="status" className="text-sm text-amber-300">{previewNotice}</p>}
          {!confirmation && mutation.error && <p role="alert" className="text-sm text-red-200">{mutation.error}</p>}{!confirmation && mutation.message && <p role="status" className="text-sm text-emerald-300">{mutation.message}</p>}
          <p className="border-t border-white/10 pt-4 text-xs text-neutral-400">Delivered and Paid are tracked separately. Availability never auto-assigns.</p>
        </DeliveryDialog>
        <DeliveryDialog open={Boolean(confirmation)} onClose={() => setConfirmation(null)} busy={mutation.pending} title="Confirm rider assignment" centered>
          {confirmation && <><p className="break-all font-semibold">{confirmation.orderNumber}</p><dl className="space-y-2 text-sm text-neutral-300"><div><dt className="text-neutral-400">Selected rider</dt><dd>{confirmation.riderName}</dd></div><div><dt className="text-neutral-400">Current delivery state</dt><dd>{deliveryStatusLabel(confirmation.currentStatus)}</dd></div>{confirmation.reason && <div><dt className="text-neutral-400">{confirmation.currentStatus === "assigned" ? "Required reassignment reason" : "Assignment reason"}</dt><dd className="whitespace-pre-wrap break-words">{confirmation.reason}</dd></div>}</dl><p className="text-xs text-neutral-400">{preview ? "Preview only; no dispatch or database write." : "The server rechecks eligibility, rider availability and the current revision. Availability never auto-assigns."}</p><button type="button" disabled={blocked || !confirmationStillCurrent(confirmation, selected, selectedRider, reason)} onClick={() => { if (preview) { setPreviewNotice("Preview selection only. No record was assigned or dispatched."); setConfirmation(null); } else void act("assign"); }} className="min-h-12 w-full rounded-xl bg-dune-amber p-3 font-semibold text-black disabled:opacity-40">{mutation.pending ? "Submitting…" : preview ? "Confirm preview selection" : confirmation.currentStatus === "assigned" ? "Confirm reassignment" : "Confirm assignment"}</button>{mutation.error && <p role="alert" className="text-sm text-red-200">{mutation.error} Close this confirmation and Refresh to review before retrying.</p>}</>}
        </DeliveryDialog>
      </div></>}
      {!detailsOpen && !confirmation && mutation.error && <p role="alert" className="rounded-xl border border-red-500/30 p-4 text-red-200">{mutation.error}</p>}{!detailsOpen && !confirmation && mutation.message && <p role="status" className="p-3 text-emerald-300">{mutation.message}</p>}
      {writable && canManage && <OwnDeliveryEnrollment afterChange={refresh} rehearsal={!operational} />}
    </div>
  </AdminShell>;
}
export default function DeliveryManagement(props) { return <ProtectedRoute roles={["admin", "manager", "cashier"]}><ManagementContent {...props} rehearsal={props.rehearsal && !props.preview} /></ProtectedRoute>; }
