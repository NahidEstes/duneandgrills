"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Banknote, CheckCircle2, ClipboardList, Info, Plus, RefreshCw, Search, Truck } from "lucide-react";
import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import AdminShell from "@/src/components/admin/AdminShell.jsx";
import { useAuth } from "@/src/context/AuthContext.jsx";
import { deliveryAction } from "@/src/api/deliveryApi.js";
import { inputClass } from "@/src/components/admin/staff/staffUi.jsx";
import useDeliverySubmission from "@/src/hooks/useDeliverySubmission.js";
import useDeliveryManagement from "@/src/hooks/useDeliveryManagement.js";
import { deliveryStatusLabel } from "@/src/components/rider/deliveryPresentation.js";
import { emptyDeliveryQuery } from "./deliveryWorkspace.js";
import { managementTabs, managementFilterQuery, previewManagementRows, removeManagementFilter } from "./deliveryManagementView.js";
import DeliveryHealthPanel, { CashVisibility } from "./DeliveryHealthPanel.jsx";
import { DeliveryBadge } from "./DeliveryBadges.jsx";
import OwnDeliveryEnrollment from "./OwnDeliveryEnrollment.jsx";
import DeliveryFilters from "./DeliveryFilters.jsx";
import DeliveryRows from "./DeliveryRows.jsx";
import DeliveryDialog from "./DeliveryDialog.jsx";
import ManagementDeliveryDetails from "./ManagementDeliveryDetails.jsx";
import DeliveryTimeline from "./DeliveryTimeline.jsx";
import { assignmentConfirmation, canAssignDelivery, confirmationStillCurrent } from "./deliveryManagementPresentation.js";
import styles from "./deliveryManagement.module.css";

const tabIcons = { active: Truck, cash: Banknote, history: ClipboardList };
function WorkflowButton({ children, action, onAction, disabled }) {
  return <button type="button" disabled={disabled} onClick={() => onAction(action)} className={styles.primary}>{children}</button>;
}
function ManagementContent({ preview, rehearsal }) {
  const { user, logout } = useAuth(), router = useRouter();
  const canManage = ["admin", "manager"].includes(user?.role);
  const view = useDeliveryManagement({ preview, rehearsal });
  const { data, loading, error, stamp, selected, changed, detailError, detailLoading, query, dataQuery } = view;
  const [draft, setDraft] = useState(() => emptyDeliveryQuery(canManage ? "active" : "cash"));
  const [riderId, setRiderId] = useState(""), [reason, setReason] = useState(""), [terminal, setTerminal] = useState("MAIN");
  const [previewNotice, setPreviewNotice] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false), [confirmation, setConfirmation] = useState(null);
  const [enrollmentOpen, setEnrollmentOpen] = useState(false), [enrollmentBusy, setEnrollmentBusy] = useState(false), [actionNeedsRefresh, setActionNeedsRefresh] = useState(false);
  const mutation = useDeliverySubmission(), actionLock = useRef(false), tabsId = useId(), tabButtons = useRef({});
  const refresh = async () => {
    if (actionLock.current || confirmation) return;
    await view.workspace.current?.load();
    const latest = view.workspace.current?.snapshot();
    if (latest && !latest.error && !latest.detailError) setActionNeedsRefresh(false);
  };
  const apply = next => { if (!actionLock.current && !confirmation && !enrollmentBusy) { setDraft(next); void view.workspace.current?.load(next); } };
  const visibleQuery = dataQuery || query, workspace = visibleQuery.workspace;
  const filter = (values, tab = workspace) => apply(managementFilterQuery(tab, values));
  const select = row => {
    if (actionLock.current || mutation.pending || confirmation || enrollmentOpen) return;
    setDetailsOpen(true);
    if (row.id !== selected?.id && view.workspace.current?.select(row)) { setRiderId(row.riderId || ""); setReason(""); setPreviewNotice(""); setActionNeedsRefresh(false); mutation.clearFeedback(); }
  };
  const operational = data?.mode === "operational";
  const writable = !preview && (operational || (rehearsal && data?.mode === "rehearsal"));
  const blocked = mutation.pending || loading || detailLoading || Boolean(detailError) || changed || Boolean(error) || actionNeedsRefresh || selected?.canOperate === false;
  const selectedRider = data?.riders?.find(row => row.id === riderId);
  const act = async action => {
    if (!writable || blocked || actionLock.current || !selected) return;
    if (action === "assign" && (!canManage || !confirmationStillCurrent(confirmation, selected, selectedRider, reason))) return;
    if (action === "resolve_issue" && (!canManage || selected.deliveryStatus !== "issue" || !reason.trim())) return;
    if (action === "acknowledge_cash" && (!canManage || selected.cashReport?.status !== "discrepancy" || selected.cashReport.acknowledgedAt || !reason.trim())) return;
    if (action === "confirm_cash" && (!selected.canConfirmCash || !terminal.trim())) return;
    const id = selected.id, current = view.workspace.current;
    actionLock.current = true; current.lock(true);
    try {
      const result = await mutation.submit(`${id}:${action}`, { expectedRevision: selected.revision,
        ...(action === "assign" ? { riderId, ...(reason.trim() ? { reason } : {}) } : action === "confirm_cash" ? { terminal } : { reason }) },
      async payload => { try { return await deliveryAction(id, action, payload, { admin: true }); } catch (failure) { if (failure.response?.status === 409) setActionNeedsRefresh(true); throw failure; } },
      () => { current.lock(false); void current.load(); });
      if (result && action === "assign") setConfirmation(null);
    } finally { actionLock.current = false; current.lock(false); }
  };
  const rows = preview ? previewManagementRows(data?.deliveries || [], visibleQuery) : data?.deliveries || [];
  const outside = selected && !rows.some(row => row.id === selected.id);
  const assignmentAllowed = selected?.canOperate !== false && ["unassigned", "assigned"].includes(selected?.deliveryStatus);
  const editDraft = (key, value) => setDraft(previous => ({ ...previous, [key]: value, ...(key === "datePeriod" && value !== "custom" ? { from: "", to: "" } : {}) }));
  const canAssign = canAssignDelivery(selected, selectedRider, reason);
  const tabBusy = mutation.pending || Boolean(confirmation) || (enrollmentOpen && writable && canManage);
  const controlsBusy = loading || tabBusy;
  const filterRiders = [...new Map([...(data?.riderFilters || []), ...(data?.riders || [])].map(row => [row.id, row])).values()];
  const tabs = managementTabs.filter(tab => canManage || tab.key !== "active");
  const needsReason = canManage && ((assignmentAllowed && selected?.riderId) || (writable && selected?.deliveryStatus === "issue") || (writable && selected?.cashReport?.status === "discrepancy" && !selected.cashReport.acknowledgedAt));
  const reasonLabel = assignmentAllowed ? "Reassignment reason (no customer contact details)" : selected?.deliveryStatus === "issue" ? "Issue resolution reason (no customer contact details)" : "Discrepancy acknowledgment reason (no customer contact details)";
  const tabKeyboard = (event, key) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || tabBusy) return;
    event.preventDefault(); const index = tabs.findIndex(tab => tab.key === key);
    const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    tabButtons.current[next.key]?.focus(); filter({}, next.key);
  };
  return <AdminShell activeTab="deliveries" onTabChange={tab => router.push(`/admin?tab=${tab}`)} title="Deliveries" subtitle="Manage deliveries, rider cash and recorded history." user={user} onLogout={logout} showGlobalSearch={false} showOrderControls={false} dashboard={null} searchQuery="" onSearchChange={() => {}} searchResults={[]} searching={false}>
    <div className={styles.workspace}>
      <div className={styles.header}><div className={styles.headerInfo}><span className={`${styles.mode} ${!operational ? styles.modeWarning : ""}`}>{operational ? <CheckCircle2 size={14} aria-hidden="true" /> : <Info size={14} aria-hidden="true" />}{preview ? "Design preview" : operational ? "Delivery enabled" : writable ? "Local rehearsal" : "Delivery disabled"}</span>{stamp && <time dateTime={stamp.toISOString()}>Updated {stamp.toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })} Riyadh</time>}</div><div className={styles.headerActions}>{writable && canManage && <button type="button" className={styles.secondary} disabled={controlsBusy} onClick={() => setEnrollmentOpen(true)}><Plus size={17} aria-hidden="true" />Add existing order</button>}<button type="button" onClick={refresh} disabled={controlsBusy} className={styles.secondary}><RefreshCw size={17} aria-hidden="true" />Refresh deliveries</button></div></div>
      {preview && <p className={styles.notice}>Read-only synthetic design preview. No dispatch, enrollment or payment writes.</p>}
      {writable && !operational && <p className={styles.notice}>Isolated local rehearsal · disposable test records only.</p>}
      {loading && <p role="status" className={styles.scope}>{data ? "Refreshing… retained results still represent the last successfully applied filters." : "Loading deliveries…"}</p>}
      {error && <div role="alert" className={styles.error}><p>{data ? "Retained results may be outdated. " : ""}{error}</p><button type="button" disabled={loading || mutation.pending} onClick={refresh} className={styles.secondary}>Retry deliveries</button></div>}
      {data?.mode === "disabled" && <div className={styles.notice}><h2>Live delivery is not enabled</h2><p>No operational orders were queried. Existing records and payments are preserved.</p>{user?.role === "admin" && <a href="/admin?tab=settings">Open Settings · Delivery Rider</a>}{data.previewAvailable && canManage && <a href="/admin/deliveries?preview=1">Open design preview</a>}{data.workflowAvailable && <a href="/admin/deliveries?rehearsal=1">Open isolated workflow rehearsal</a>}</div>}
      {data && data.mode !== "disabled" && <>
        <div className={styles.tabs} role="tablist" aria-label="Delivery workspaces">{tabs.map(tab => { const Icon = tabIcons[tab.key]; return <button key={tab.key} type="button" role="tab" id={`${tabsId}-${tab.key}`} aria-controls={`${tabsId}-panel`} aria-selected={workspace === tab.key} tabIndex={workspace === tab.key ? 0 : -1} ref={node => { tabButtons.current[tab.key] = node; }} disabled={tabBusy} onKeyDown={event => tabKeyboard(event, tab.key)} onClick={() => filter({}, tab.key)}><Icon size={18} aria-hidden="true" />{tab.label}</button>; })}</div>
        <section role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${workspace}`} className={styles.summarySection}>
          <DeliveryHealthPanel data={data} onFilter={filter} disabled={controlsBusy} preview={preview} workspace={workspace} />
          <section className={styles.list} aria-label="Delivery orders">
            <DeliveryFilters key={workspace} draft={draft} editDraft={editDraft} apply={apply} reset={() => filter({})} removeFilter={key => apply(removeManagementFilter(visibleQuery, key))} disabled={controlsBusy} preview={preview} canManage={canManage} riders={filterRiders} ridersHasMore={data.riderFiltersHasMore} applied={visibleQuery} loading={loading} matching={preview ? rows.length : data.pagination.total} />
            <DeliveryRows rows={rows} selected={selected} canManage={canManage} disabled={controlsBusy} select={select} workspace={workspace} serverNow={data.serverNow} />
            {!rows.length && <div className={styles.empty}><Search size={28} aria-hidden="true" /><h2>{workspace === "active" ? "No matching active deliveries" : workspace === "cash" ? "No matching cash records" : "No matching delivery history"}</h2><p>{workspace === "active" ? "Unfinished deliveries include previous days and unresolved issues." : "Try a different order number or date range."}</p><button type="button" className={styles.secondary} disabled={controlsBusy} onClick={() => filter({})}>Clear filters</button></div>}
            <div className={styles.pagination}><span>{preview ? `${rows.length} synthetic examples` : `${data.pagination.total} matching records · page ${data.pagination.page}`}</span>{!preview && <div><button type="button" disabled={controlsBusy || query.page === 1} onClick={() => apply({ ...query, page: query.page - 1 })} className={styles.secondary}>Previous</button><button type="button" disabled={controlsBusy || query.page * data.pagination.limit >= data.pagination.total} onClick={() => apply({ ...query, page: query.page + 1 })} className={styles.secondary}>Next</button></div>}</div>
          </section>
        </section>
        {selected && <div className={styles.selectedBar}><p>Selected: {selected.orderNumber}{outside && !detailsOpen ? " · Outside applied results; authorized details and drafts retained." : ""}</p><button id="delivery-selected-control" type="button" disabled={controlsBusy} onClick={() => setDetailsOpen(true)} className={styles.secondary}>Open selected delivery</button></div>}
        <DeliveryDialog open={detailsOpen && Boolean(selected)} onClose={() => setDetailsOpen(false)} busy={mutation.pending || Boolean(confirmation)} title="Delivery details & actions">
          {selected && <div className={styles.drawer}>
            <div className={styles.drawerIdentity}><h3>{selected.orderNumber}</h3><div className={styles.currentStatus}><span><small>Kitchen</small><DeliveryBadge kind="restaurant" value={selected.restaurantStatus} /></span><span><small>Delivery</small><DeliveryBadge kind="delivery" value={selected.deliveryStatus} /></span></div></div>
            {outside && <p className={styles.scope}>Outside applied results. Authorized details and your drafts are retained.</p>}
            {detailLoading && <p role="status" className={styles.scope}>Verifying selected delivery…</p>}
            {(detailError || error) && <p role="alert" className={styles.error}>Retained information may be outdated; actions blocked. {detailError || error}</p>}
            {actionNeedsRefresh && <p role="alert" className={styles.error}>Action rejected because the order or availability changed. Close any confirmation, then refresh and review before acting.</p>}
            {changed && <div role="alert" className={styles.notice}><p>Order changed — review latest information. Drafts retained; actions blocked.</p><button type="button" disabled={detailLoading || Boolean(detailError) || mutation.pending || actionNeedsRefresh} onClick={() => view.workspace.current?.review()} className={styles.secondary}>I reviewed the latest delivery</button></div>}
            {selected.eligibilityWarning && <p role="alert" className={styles.error}>{selected.eligibilityWarning}</p>}
            {selected.issue && <div className={styles.error}><strong>Unresolved delivery issue</strong><p>{selected.issue.reason || "Reason unavailable"}</p></div>}
            {canManage && assignmentAllowed && <section className={styles.drawerSection} aria-label="Rider assignment"><h3>{selected.riderId ? "Reassign rider" : "Assign rider"}</h3><fieldset disabled={blocked || Boolean(confirmation)}><legend className="sr-only">Choose an active rider</legend><div className={styles.riderChoices}>{data.riders.map(rider => <label key={rider.id}><input type="radio" name="rider" checked={riderId === rider.id} onChange={() => setRiderId(rider.id)} disabled={!rider.available} /><span>{rider.name}<small>{rider.activeCount} active deliveries · {rider.available ? "Available" : "Unavailable"}</small></span></label>)}</div></fieldset>{!data.riders.length && <p>No eligible riders in the available directory.</p>}{riderId && !data.riders.some(rider => rider.id === riderId && rider.available) && <p className={styles.blocked}>Your retained rider selection is unavailable. Choose an available rider.</p>}{selected.riderId === riderId && riderId && <p className={styles.blocked}>This rider is already assigned. Choose another rider and give a reassignment reason.</p>}{needsReason && <label>{reasonLabel}<textarea value={reason} disabled={mutation.pending} onChange={event => setReason(event.target.value)} maxLength={500} /></label>}<button type="button" disabled={blocked || !canAssign || Boolean(confirmation)} onClick={() => { mutation.clearFeedback(); setConfirmation(assignmentConfirmation(selected, selectedRider, reason)); }} className={styles.primary}>{preview ? "Preview Assignment" : selected.riderId ? operational ? "Reassign Rider" : "Reassign · Isolated Test" : operational ? "Assign Rider" : "Assign · Isolated Test"}</button></section>}
            {needsReason && !assignmentAllowed && <section className={styles.drawerSection}><label>{reasonLabel}<textarea value={reason} disabled={mutation.pending} onChange={event => setReason(event.target.value)} maxLength={500} /></label>{selected.deliveryStatus === "issue" && <WorkflowButton action="resolve_issue" onAction={act} disabled={blocked || !reason.trim()}>Resolve issue · Resume same rider/stage</WorkflowButton>}{selected.cashReport?.status === "discrepancy" && !selected.cashReport.acknowledgedAt && <WorkflowButton action="acknowledge_cash" onAction={act} disabled={blocked || !reason.trim()}>Acknowledge shortage · No payment posting</WorkflowButton>}</section>}
            {selected.deliveryStatus === "delivered" ? <section className={styles.drawerSection} aria-label="Cash and payment"><h3>Cash &amp; Payment</h3><CashVisibility delivery={selected} />{selected.cashConfirmationGap && <p className={styles.error} role="alert">{selected.cashConfirmationGap}</p>}{writable && selected.canConfirmCash && <><label>Your open cashier terminal<input value={terminal} disabled={mutation.pending} onChange={event => setTerminal(event.target.value)} maxLength={60} className={inputClass} /></label><p>Your own open shift is validated by the server. Confirmation posts once to the existing payment ledger.</p><WorkflowButton action="confirm_cash" onAction={act} disabled={blocked || !terminal.trim()}>{operational ? "Confirm Cashier Receipt" : "Confirm Cashier Receipt · Isolated Test"}</WorkflowButton></>}<p>Delivered and Paid are separate. A rider report or shortage acknowledgment does not confirm payment.</p></section> : <details className={styles.disclosure}><summary>Cash &amp; Payment</summary><div><CashVisibility delivery={selected} /></div></details>}
            <button type="button" onClick={refresh} disabled={controlsBusy} className={styles.secondary}><RefreshCw size={16} aria-hidden="true" />Refresh selected &amp; list</button>
            <ManagementDeliveryDetails key={selected.id} selected={selected} />
            <DeliveryTimeline key={`timeline:${selected.id}`} timeline={selected.timeline} preview={preview} />
            {mutation.pending && !confirmation && <p role="status" className={styles.scope}>Submitting action… Waiting for server confirmation.</p>}
            {previewNotice && <p role="status" className={styles.notice}>{previewNotice}</p>}
            {!confirmation && mutation.error && <p role="alert" className={styles.error}>{mutation.error}</p>}{!confirmation && mutation.message && <p role="status" className="text-sm text-emerald-300">{mutation.message}</p>}
          </div>}
        </DeliveryDialog>
        <DeliveryDialog open={Boolean(confirmation)} onClose={() => { if (!mutation.pending) setConfirmation(null); }} busy={mutation.pending} title="Confirm rider assignment" centered>
          {confirmation && <><p className="break-all font-semibold">{confirmation.orderNumber}</p><dl className="space-y-2 text-sm text-neutral-300"><div><dt>Selected rider</dt><dd>{confirmation.riderName}</dd></div><div><dt>Current delivery state</dt><dd>{deliveryStatusLabel(confirmation.currentStatus)}</dd></div>{confirmation.reason && <div><dt>Required reassignment reason</dt><dd className="whitespace-pre-wrap break-words">{confirmation.reason}</dd></div>}</dl><p className="text-xs text-neutral-400">{preview ? "Read-only preview; no dispatch or database write." : "The server rechecks eligibility, rider availability and revisions."}</p><button type="button" disabled={blocked || !confirmationStillCurrent(confirmation, selected, selectedRider, reason)} onClick={() => { if (preview) { setPreviewNotice("Preview selection only. No record was assigned or dispatched."); setConfirmation(null); } else void act("assign"); }} className={styles.primary}>{mutation.pending ? "Submitting…" : preview ? "Confirm preview selection" : confirmation.currentStatus === "assigned" ? "Confirm reassignment" : "Confirm assignment"}</button><button type="button" disabled={mutation.pending} onClick={() => setConfirmation(null)} className={styles.secondary}>Go back</button>{mutation.error && <p role="alert" className={styles.error}>{mutation.error} Close this confirmation and Refresh to review before retrying.</p>}</>}
        </DeliveryDialog>
      </>}
      {!detailsOpen && !confirmation && mutation.error && <p role="alert" className={styles.error}>{mutation.error}</p>}{!detailsOpen && !confirmation && mutation.message && <p role="status" className="text-sm text-emerald-300">{mutation.message}</p>}
      {writable && canManage && <DeliveryDialog open={enrollmentOpen} onClose={() => setEnrollmentOpen(false)} busy={enrollmentBusy} title="Add existing order" centered><OwnDeliveryEnrollment afterChange={refresh} rehearsal={!operational} onBusyChange={setEnrollmentBusy} /></DeliveryDialog>}
    </div>
  </AdminShell>;
}
export default function DeliveryManagement(props) {
  const { user } = useAuth();
  return <ProtectedRoute roles={["admin", "manager", "cashier"]}><ManagementContent key={`${user?._id || user?.id}:${user?.role}:${props.preview}:${props.rehearsal}`} {...props} rehearsal={props.rehearsal && !props.preview} /></ProtectedRoute>;
}
