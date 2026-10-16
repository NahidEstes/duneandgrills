"use client";
import { useId, useState } from "react";
import { AlertTriangle, Banknote, Check, ChevronLeft, CircleCheck, Clock3, Info, MapPin, Phone, RefreshCw, ShoppingBag, Store, Truck, UserRound } from "lucide-react";
import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import { fetchDeliveryDetails, deliveryAction } from "@/src/api/deliveryApi.js";
import { formatPrice } from "@/src/utils/currency.js";
import useDeliverySubmission from "@/src/hooks/useDeliverySubmission.js";
import { useAuth } from "@/src/context/AuthContext.jsx";
import useRiderRead from "@/src/hooks/useRiderRead.js";
import DeliveryDialog from "../admin/delivery/DeliveryDialog.jsx";
import RiderNav from "./RiderNav.jsx";
import RiderCash from "./RiderCash.jsx";
import RiderCashReport from "./RiderCashReport.jsx";
import { RestaurantContact } from "./RiderPendingCash.jsx";
import { customerMapHref, customerPhoneHref, deliveryModeQuery, deliveryStatusLabel } from "./deliveryPresentation.js";
import { deliveryFingerprint, restaurantStatusLabel } from "./riderPresentation.js";
import { riderPickupState, riderFoodStatus, riderAmount } from "./riderPickup.js";
import { riderCompletionAction, riyadhRecordedTime } from "./riderCompletion.js";
import styles from "./rider.module.css";

const foodIcons = { issue: AlertTriangle, transit: Truck, completed: CircleCheck, ready: CircleCheck, preparing: Clock3 };

export function DeliveryDetailContent({ id, preview, rehearsal, admin = false, afterChange, record, onRefresh, stamp }) {
  const { user } = useAuth();
  const userId = user?._id || user?.id;
  const scope = `${userId}:${user?.role}:${id}:${preview}:${rehearsal}:${admin}`;
  const read = useRiderRead(scope, id, async signal => {
    const result = await fetchDeliveryDetails(id, { preview, rehearsal, admin }, signal);
    if (!admin && !preview && user?.role === "rider" && String(result.data.riderId) !== String(userId)) {
      const denied = new Error("This delivery is not assigned to your account.");
      denied.response = { status: 403, data: { message: denied.message } };
      throw denied;
    }
    return { ...result.data, mode: result.mode };
  }, !!user && !record);
  const { error, loading, refreshing, offline, updatedAt } = read;
  const data = record || read.data;
  const [reason, setReason] = useState(""), [amount, setAmount] = useState("");
  const [cashReason, setCashReason] = useState("");
  const [confirmation, setConfirmation] = useState(null), [validation, setValidation] = useState(""), [reviewRequired, setReviewRequired] = useState(false);
  const [acceptedFingerprint, setAcceptedFingerprint] = useState(null);
  const pickupReasonId = useId();
  const mutation = useDeliverySubmission();
  const refresh = () => record ? onRefresh?.() : read.refresh();
  const awaitingUpdate = !!acceptedFingerprint && acceptedFingerprint === deliveryFingerprint(data);
  const actionContext = { userId, role: user?.role, preview, rehearsal, admin, loading, refreshing, offline, error, pending: mutation.pending, awaitingUpdate };
  const pickup = riderPickupState(data, { ...actionContext, pending: mutation.pending || awaitingUpdate });
  const confirmationChanged = !!confirmation && (reviewRequired || confirmation.fingerprint !== deliveryFingerprint(data));
  const contents = action => ({ expectedRevision: data.revision, expectedOrderRevision: data.orderRevision,
    ...(action === "issue" ? { reason } : {}), ...(action === "report_cash" ? { amount, reason: cashReason } : {}) });
  const actionState = (action, payload = contents(action)) => action === "pickup" ? pickup : riderCompletionAction(data, action, actionContext, payload);
  const act = (action, payload) => {
    const eligible = actionState(action, payload);
    if (!eligible.allowed || confirmationChanged || !confirmation || confirmation.action !== action) {
      setValidation(confirmationChanged ? "Delivery changed. Go back, refresh and review the current details." : eligible.reason);
      return;
    }
    return mutation.submit(action, payload, async request => {
      try { return await deliveryAction(id, action, request, { admin }); }
      catch (failure) { if (failure.response?.status === 409) { setReviewRequired(true); refresh(); } throw failure; }
    }, () => { setAcceptedFingerprint(deliveryFingerprint(data)); setConfirmation(null); record ? onRefresh?.() : read.invalidate(); afterChange?.(); });
  };
  const ask = action => {
    const eligible = actionState(action), problem = eligible.allowed ? "" : eligible.reason;
    setValidation(problem); if (problem) return;
    mutation.clearFeedback();
    setReviewRequired(false); setConfirmation({ action, orderNumber: data.orderNumber, payload: contents(action), fingerprint: deliveryFingerprint(data) });
  };
  const closeConfirmation = () => { if (!mutation.pending) { setConfirmation(null); setValidation(""); } };

  if (!record && loading) return <div className={styles.loadingState} role="status"><RefreshCw aria-hidden="true" /><p>Loading delivery details…</p><div className={styles.skeletonCards} aria-hidden="true"><span /><span /></div></div>;
  if (!record && error && !data) return <div className={styles.empty} role="alert"><AlertTriangle aria-hidden="true" /><h2>Delivery unavailable</h2><p>{error}</p>{read.denied ? <a className={styles.action} href="/rider">Return to private dashboard</a> : <button type="button" className={styles.action} onClick={refresh}>Retry details</button>}</div>;
  if (!data) return null;

  const historical = data.deliveryStatus === "delivered";
  const customer = historical ? null : data.customer;
  const stage = data.deliveryStatus === "issue" ? data.issue?.previousStatus : data.deliveryStatus;
  const progressIndex = ["assigned", "picked_up", "delivered"].indexOf(stage);
  const phone = !preview && customerPhoneHref(customer?.phone), map = !preview && customerMapHref(customer?.address, customer?.deliveryDetails?.coordinates);
  const food = riderFoodStatus(data), FoodIcon = foodIcons[food.icon];
  const ownRider = user?.role === "rider" && String(data.riderId) === String(userId);
  const canAct = !preview && !admin && ownRider && data.canOperate && (data.mode === "operational" || (rehearsal && data.mode === "rehearsal"));
  const pickupDialog = confirmation?.action === "pickup";
  const deliver = actionState("deliver"), cash = actionState("report_cash"), issue = actionState("issue");
  const confirmedAction = confirmation ? actionState(confirmation.action, confirmation.payload) : null;
  const confirmDisabled = !confirmedAction?.allowed || confirmationChanged;
  const dialogTitle = ({ pickup: "Confirm pickup", deliver: "Confirm delivery", report_cash: "Confirm cash report", issue: "Report delivery issue" })[confirmation?.action] || "Confirm rider action";
  const yesLabel = ({ pickup: "Yes, confirm pickup", deliver: "Yes, confirm delivery", report_cash: "Yes, report cash collected", issue: "Yes, report delivery issue" })[confirmation?.action];

  return <>
    <div className={styles.detailsIdentity}><h2>{data.orderNumber}</h2><div className={styles.detailStatusLabels}><span><Store size={15} aria-hidden="true" />Kitchen: {restaurantStatusLabel(data.restaurantStatus)}</span><span><Truck size={15} aria-hidden="true" />Delivery: {deliveryStatusLabel(data.deliveryStatus)}</span></div></div>
    {refreshing && <p role="status" className={styles.refreshNotice}><RefreshCw size={17} aria-hidden="true" />Updating details… your inputs stay in place.</p>}
    {(error || offline) && <p role="alert" className={styles.error}>Retained details may be outdated. {offline ? "Offline — no actions are queued." : error}</p>}
    {(preview || (rehearsal && data.mode !== "operational")) && <div className={styles.banner}><Info aria-hidden="true" /><div><strong>{preview ? "DESIGN PREVIEW · SYNTHETIC DATA" : "ISOLATED LOCAL REHEARSAL"}</strong><p>{preview ? "Read-only preview. No real pickup or payment actions." : "Only disposable local test records. No production activity."}</p></div></div>}
    {data.eligibilityWarning && <p className={styles.error} role="alert">{data.eligibilityWarning}</p>}
    {historical ? <section className={styles.completionHero} aria-label="Delivery completion"><CircleCheck aria-hidden="true" /><div><h3>Delivery completed</h3><p>Order {data.orderNumber}</p><strong>Delivered</strong><p>Completed at · {riyadhRecordedTime(data.deliveredAt)}</p></div></section> : <section className={`${styles.foodStatus} ${styles[food.tone]}`} aria-label="Food and pickup status"><FoodIcon aria-hidden="true" /><div><h3>{data.deliveryStatus === "picked_up" && data.restaurantStatus === "out-for-delivery" ? "Picked up · Out for delivery" : food.title}</h3><p>{food.message}</p></div></section>}
    <ol className={styles.pickupProgress} aria-label="Delivery progress">{[["assigned", "Assigned"], ["picked_up", "Picked up"], ["delivered", "Delivered"]].map(([status, label], index) => <li key={status} className={`${index < progressIndex ? styles.progressDone : ""} ${data.deliveryStatus === "issue" && index === progressIndex ? styles.progressPaused : ""}`} aria-current={data.deliveryStatus !== "issue" && stage === status ? "step" : undefined}><span>{index < progressIndex && <Check size={15} aria-hidden="true" />}</span>{label}</li>)}</ol>
    {data.deliveryStatus === "issue" && <p className={styles.privacy}>Delivery paused at {deliveryStatusLabel(stage)}. Waiting for manager review.</p>}
    {historical && <><RiderCashReport data={data} amount={amount} reason={cashReason} onAmount={setAmount} onReason={setCashReason} onConfirm={() => ask("report_cash")} action={cash} preview={preview} admin={admin} pending={mutation.pending} /><a className={styles.backToDeliveries} href={`/rider/deliveries${deliveryModeQuery({ preview, rehearsal })}`}><ChevronLeft size={21} aria-hidden="true" />Back to deliveries</a></>}
    {data.issue && <section className={`${styles.detailCard} ${styles.detailIssue}`}><h3><AlertTriangle size={21} aria-hidden="true" />Delivery Issue · Awaiting manager review</h3><p>{data.issue.reason}</p><p>Previous stage: {deliveryStatusLabel(data.issue.previousStatus)}. Contact the restaurant. Wait for authorized resolution; do not resume, cancel or refund the order yourself.</p><RestaurantContact contact={data.restaurantContact} preview={preview} /></section>}
    {admin && <dl className={styles.adminDetailTimes}>{[["Food ready", data.readyAt], ["Rider assigned", data.assignedAt], ["Picked up", data.pickedUpAt]].map(([label, date]) => <div key={label}><dt>{label}</dt><dd>{date ? new Date(date).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" }) + " Riyadh" : "Not recorded — timing unavailable where required"}</dd></div>)}</dl>}
    <div className={styles.detailPanels}>
      <div className={styles.detailColumn}>
        <section className={styles.detailCard}><div className={styles.detailRecipient}><span className={styles.restaurantMark} aria-hidden="true">D<span>&amp;</span>G</span><div><h3>Dune &amp; Grills</h3><p>{data.pickupInstructions || "Pickup instructions are not recorded. Contact the restaurant before collecting."}</p></div></div></section>
        <section className={styles.detailCard} aria-label="Customer delivery information"><div className={styles.detailRecipient}><span className={styles.customerIcon}><UserRound aria-hidden="true" /></span><div><h3>{historical ? "Completed delivery" : customer?.name || "Customer details unavailable"}</h3><p className={styles.customerAddress}><MapPin size={18} aria-hidden="true" />{historical ? "Historical customer contact/address is hidden." : customer?.address || "Delivery address not recorded."}</p>{!historical && data.deliveryNote && <p className={styles.deliveryNote}><strong>Delivery note</strong>{data.deliveryNote}</p>}</div></div>
          {!historical && customer?.deliveryDetails && <div className={styles.deliveryNote}>{['building', 'apartment', 'landmark', 'instructions'].map(key => customer.deliveryDetails[key] && <p key={key}>{key}: {customer.deliveryDetails[key]}</p>)}</div>}
          {!historical && <><div className={styles.customerActions}>{phone ? <a href={phone}><Phone size={19} aria-hidden="true" />Call Customer</a> : <button type="button" disabled><Phone size={19} aria-hidden="true" />Call unavailable</button>}{map ? <a href={map} target="_blank" rel="noopener noreferrer"><MapPin size={19} aria-hidden="true" />Open Map</a> : <button type="button" disabled><MapPin size={19} aria-hidden="true" />Map unavailable</button>}</div>{(!phone || !map) && <p className={styles.contactExplanation}>{preview ? "Calls and maps are disabled in the synthetic preview." : !phone && !map ? "A valid customer phone number and address are not included in this response." : !phone ? "A valid customer phone number is not included in this response." : "A delivery address is not included in this response."}</p>}</>}
        </section>
      </div>
      <div className={styles.detailColumn}>
        <section className={styles.detailCard}><h3 className={styles.detailTitle}><ShoppingBag size={22} aria-hidden="true" />Order Summary</h3><ul className={styles.detailItems}>{(data.items || []).map((item, index) => <li key={index}><div><strong>{item.quantity} × {item.name}</strong>{item.selectedAddOns?.map((row, addIndex) => <p key={addIndex}>{row.quantity} × {row.name}</p>)}{item.spiceLevel && <p>Spice: {item.spiceLevel}</p>}{!historical && item.itemNote && <p>Note: {item.itemNote}</p>}</div><span>{riderAmount(item.lineTotal)}</span></li>)}</ul>{!data.items?.length && <p>No item details are included in this response.</p>}<div className={styles.orderTotal}><strong>Order total</strong><strong>{riderAmount(data.orderTotal)}</strong></div></section>
        <section className={`${styles.detailCard} ${styles.detailPayment}`}><h3 className={styles.detailTitle}><Banknote size={22} aria-hidden="true" />Cash &amp; Payment</h3><RiderCash delivery={data} /><p className={styles.paymentReminder}><Info size={16} aria-hidden="true" />Pickup and delivery confirmation do not confirm payment.</p><details className={styles.paymentDetails}><summary>View payment details</summary><RiderCash delivery={data} detail /></details>{data.cashConfirmationGap && <p role="alert" className={styles.error}>{data.cashConfirmationGap}</p>}</section>
      </div>
    </div>
    {!admin && !["picked_up", "delivered"].includes(data.deliveryStatus) && <section className={styles.pickupAction} aria-label="Pickup confirmation"><button type="button" className={styles.pickupPrimary} aria-describedby={pickupReasonId} disabled={!pickup.allowed} onClick={() => ask("pickup")}><ShoppingBag size={21} aria-hidden="true" />{mutation.pending ? "Waiting for server…" : preview ? "Confirm Pickup · Preview Only" : "Confirm Pickup"}</button><p id={pickupReasonId}>{pickup.reason}</p></section>}
    {!admin && data.deliveryStatus === "picked_up" && <section className={styles.pickupAction} aria-label="Delivery confirmation"><button type="button" className={styles.pickupPrimary} aria-describedby={pickupReasonId} disabled={!deliver.allowed} onClick={() => ask("deliver")}><Truck size={22} aria-hidden="true" />Confirm Delivery</button><div id={pickupReasonId}><p>Confirm after the customer receives the order.</p>{!deliver.allowed && <p>{deliver.reason}</p>}</div></section>}
    <RestaurantContact contact={data.restaurantContact} preview={preview} />
    {mutation.error && <p role="alert" className={styles.error}>{mutation.error}</p>}{mutation.message && <p role="status" className={styles.notice}>{mutation.message}</p>}
    {canAct && <div className={styles.workflowActions}>
      {["assigned", "picked_up"].includes(data.deliveryStatus) && <section className={`${styles.detailCard} ${styles.issueReportForm}`} aria-label="Report delivery issue"><h3><AlertTriangle size={21} aria-hidden="true" />Report delivery issue</h3><p>A manager must resolve the issue before pickup or delivery can continue.</p><label>Delivery issue reason (no customer contact details)<textarea maxLength={500} value={reason} disabled={mutation.pending} onChange={event => setReason(event.target.value)} /></label><button type="button" className={styles.issueReportButton} disabled={!issue.allowed} onClick={() => ask("issue")}><AlertTriangle size={20} aria-hidden="true" />Report Delivery Issue</button>{!issue.allowed && <p>{issue.reason}</p>}</section>}
    </div>}
    {data.riderTimeline && <details className={styles.detailTimeline}><summary>Delivery Timeline · Riyadh</summary><ol className={styles.timeline}>{data.riderTimeline.steps.map(row => <li key={row.label} data-recorded={!!row.at}><strong>{row.label}</strong><span>{row.at ? new Date(row.at).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" }) : "Pending / timestamp not recorded"}</span></li>)}</ol>{data.riderTimeline.events.map((row, index) => <p key={index}>{row.label} · {new Date(row.at).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })}{row.reason ? ` · ${row.reason}` : ""}{row.previousStatus ? ` · ${deliveryStatusLabel(row.previousStatus)}` : ""}</p>)}</details>}
    {validation && <p role="alert" className={styles.error}>{validation}</p>}
    <DeliveryDialog open={!!confirmation} onClose={closeConfirmation} title={dialogTitle} centered busy={mutation.pending} className={styles.pickupDialog} returnFocusSelector="[data-rider-return-focus]">
      {confirmation && <>
        <div className={styles.pickupPrompt}><div className={styles.pickupIllustration} aria-hidden="true">{confirmation.action === "report_cash" ? <Banknote /> : confirmation.action === "issue" ? <AlertTriangle /> : <ShoppingBag />}<span><Check /></span></div><p className={styles.confirmOrderNumber}>Order {confirmation.orderNumber}</p><h3>{pickupDialog ? "Have you received this order from the restaurant?" : confirmation.action === "deliver" ? "Has the customer received this order?" : confirmation.action === "report_cash" ? `Report ${formatPrice(Number(confirmation.payload.amount))} collected?` : "Report this delivery issue?"}</h3><p>{pickupDialog ? "Confirm only after collecting the food." : confirmation.action === "deliver" ? "Confirm after the customer receives the order. Delivery confirmation does not confirm payment." : confirmation.action === "report_cash" ? "Reporting cash does not confirm payment. Cashier confirmation is separate." : "This delivery will be paused until a manager reviews and resolves the issue."}</p></div>
        {confirmation.payload.reason && <p>Explanation: {confirmation.payload.reason}</p>}
        {confirmationChanged && <p role="alert" className={styles.error}>Delivery/payment state changed. Go back, refresh details, review the order and explicitly start a new confirmation.</p>}
        {!confirmedAction?.allowed && !mutation.pending && !confirmationChanged && <p role="alert" className={styles.error}>{confirmedAction?.reason}</p>}
        {mutation.error && <p role="alert" className={styles.error}>{mutation.error}</p>}
        {mutation.pending && <p role="status" className={styles.confirmPending}><RefreshCw size={17} aria-hidden="true" />Waiting for server confirmation…</p>}
        <div className={styles.pickupDialogActions}>
          <button type="button" className={styles.pickupPrimary} disabled={confirmDisabled} onClick={() => act(confirmation.action, confirmation.payload)}>{mutation.pending ? "Waiting for server…" : yesLabel}</button>
          <button type="button" disabled={mutation.pending} autoFocus onClick={closeConfirmation}>Go back</button>
          {(confirmationChanged || !!error) && <button type="button" disabled={refreshing || mutation.pending || offline} onClick={refresh}><RefreshCw size={16} aria-hidden="true" />Refresh details</button>}
        </div>
      </>}
    </DeliveryDialog>
    <div className={styles.updated}><button type="button" data-rider-return-focus disabled={refreshing || mutation.pending} onClick={refresh}><RefreshCw size={16} aria-hidden="true" />Refresh details</button>{(stamp || updatedAt) && <time dateTime={new Date(stamp || updatedAt).toISOString()}>Last successful update · {new Date(stamp || updatedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh" })} Riyadh</time>}</div>
  </>;
}

export default function RiderDeliveryDetails(props) {
  const { user } = useAuth();
  const mode = { ...props, rehearsal: props.rehearsal && !props.preview };
  return <ProtectedRoute roles={mode.rehearsal ? ["rider"] : ["admin", "rider"]}><div className={styles.portal}><main className={`${styles.main} ${styles.detailMain} ${styles.pickupMain}`}><header className={styles.detailHeader}><a href={`/rider/deliveries${deliveryModeQuery(mode)}`} data-rider-return-focus aria-label="Back to deliveries"><ChevronLeft aria-hidden="true" /></a><div><h1>Delivery Details</h1><p>DUNE &amp; GRILLS</p></div></header><DeliveryDetailContent key={`${user?._id || user?.id}:${user?.role}:${mode.id}:${mode.preview}:${mode.rehearsal}`} {...mode} /></main><RiderNav {...mode} /></div></ProtectedRoute>;
}
