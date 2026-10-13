"use client";
import { useState } from "react";
import { ChevronLeft, Info, MapPin, Phone, Store, UserRound, UtensilsCrossed, Wallet } from "lucide-react";
import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import { fetchDeliveryDetails, deliveryAction } from "@/src/api/deliveryApi.js";
import { formatPrice } from "@/src/utils/currency.js";
import useDeliverySubmission from "@/src/hooks/useDeliverySubmission.js";
import RiderNav from "./RiderNav.jsx";
import { customerMapHref, customerPhoneHref, deliveryModeQuery, deliveryStatusLabel } from "./deliveryPresentation.js";
import styles from "./rider.module.css";
import { useAuth } from "@/src/context/AuthContext.jsx";
import useRiderRead from "@/src/hooks/useRiderRead.js";
import DeliveryDialog from "../admin/delivery/DeliveryDialog.jsx";
import RiderCash from "./RiderCash.jsx";
import { RestaurantContact } from "./RiderPendingCash.jsx";
import { cashReportError, deliveryFingerprint } from "./riderPresentation.js";

export function DeliveryDetailContent({ id, preview, rehearsal, admin = false, afterChange, record, onRefresh, stamp }) {
  const { user } = useAuth();
  const scope = `${user?._id || user?.id}:${user?.role}:${id}:${preview}:${rehearsal}:${admin}`;
  const read = useRiderRead(scope, id, async signal => {
    const result = await fetchDeliveryDetails(id, { preview, rehearsal, admin }, signal);
    return { ...result.data, mode: result.mode };
  }, !!user && !record);
  const { error, loading, refreshing, offline, updatedAt } = read;
  const data = record || read.data;
  const [reason, setReason] = useState(""), [amount, setAmount] = useState("");
  const [confirmation, setConfirmation] = useState(null), [validation, setValidation] = useState(""), [reviewRequired, setReviewRequired] = useState(false);
  const mutation = useDeliverySubmission();
  const refresh = () => record ? onRefresh?.() : read.refresh();
  const contents = action => ({ expectedRevision: data.revision, expectedOrderRevision: data.orderRevision,
    ...(["issue", "report_cash"].includes(action) ? { reason } : {}), ...(action === "report_cash" ? { amount } : {}) });
  const act = (action, payload) => mutation.submit(action, payload, async request => {
    try { return await deliveryAction(id, action, request, { admin }); }
    catch (error) { if (error.response?.status === 409) { setReviewRequired(true); refresh(); } throw error; }
  }, () => { setConfirmation(null); record ? onRefresh?.() : read.invalidate(); afterChange?.(); });
  const ask = action => {
    const problem = action === "report_cash" ? cashReportError(amount, reason, data) : "";
    setValidation(problem); if (problem) return;
    setReviewRequired(false); setConfirmation({ action, payload: contents(action), fingerprint: deliveryFingerprint(data) });
  };
  if (!record && loading) return <div className={styles.empty} role="status">Loading delivery details…</div>;
  if (!record && error && !data) return <div className={styles.empty} role="alert"><h2>Delivery unavailable</h2><p>{error}</p>{read.denied ? <a className={styles.action} href="/rider">Return to private dashboard</a> : <button type="button" className={styles.action} onClick={refresh}>Retry details</button>}</div>;
  if (!data) return null;
  const stage = data.deliveryStatus === "issue" ? data.issue?.previousStatus : data.deliveryStatus;
  const phone = !preview && customerPhoneHref(data.customer?.phone), map = !preview && customerMapHref(data.customer?.address);
  return <>
    {refreshing && <p role="status" className={styles.privacy}>Updating details… your inputs stay in place.</p>}
    {(error || offline) && <p role="alert" className={styles.error}>Retained details may be outdated. {offline ? "Offline — no actions are queued." : error}</p>}
    <div className={styles.banner}><Info aria-hidden="true" /><div><strong>{preview ? "DESIGN PREVIEW • SYNTHETIC DATA" : data.mode === "operational" ? "RESTAURANT DELIVERY" : "ISOLATED LOCAL REHEARSAL"}</strong><p>{data.mode !== "operational" && "Live delivery disabled. "}Delivery status does not confirm payment.</p></div></div>
    {data.eligibilityWarning && <p className={styles.error} role="alert">{data.eligibilityWarning}</p>}
    <section className={styles.card}><div className={styles.cardHeading}><h2>{data.orderNumber}</h2><span className={styles.badge}>{deliveryStatusLabel(data.deliveryStatus)}</span></div><p>{data.restaurantStatus === "ready" ? "Food ready for pickup." : `Restaurant status: ${data.restaurantStatus}`}</p>
      {admin && <dl className="mt-3 space-y-1 text-xs text-neutral-400">{[["Food ready", data.readyAt], ["Rider assigned", data.assignedAt], ["Picked up", data.pickedUpAt]].map(([label, date]) => <div key={label}><dt className="inline">{label}: </dt><dd className="inline">{date ? new Date(date).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" }) + " Riyadh" : "Not recorded — timing unavailable where required"}</dd></div>)}</dl>}
      <ol className={styles.progress} aria-label="Delivery progress">{["assigned", "picked_up", "delivered"].map((status, index, steps) => <li key={status} className={index < steps.indexOf(stage) ? styles.completedStep : undefined} aria-current={stage === status ? "step" : undefined}><span />{deliveryStatusLabel(status)}</li>)}</ol></section>
    <section className={styles.card}><div className={styles.recipient}><Store className="text-amber-400" /><div><h2>Pickup · Dune &amp; Grills</h2><p>{data.pickupInstructions}</p></div></div></section>
    {data.customer && <section className={styles.card}><div className={styles.recipient}><UserRound /><div><h2>{data.customer.name}</h2><p><MapPin size={18} />{data.customer.address || "Address not recorded"}</p><p>{data.deliveryNote}</p></div></div>
      <div className={styles.linkActions}>{phone ? <a href={phone}><Phone size={20} />Call Customer</a> : <button type="button" disabled>Call unavailable{preview ? " in preview" : ""}</button>}{map ? <a href={map} target="_blank" rel="noopener noreferrer"><MapPin size={20} />Open Map</a> : <button type="button" disabled>Map unavailable{preview ? " in preview" : ""}</button>}</div></section>}
    {!data.customer && <p className={styles.privacy}>Historical customer contact/address is hidden.</p>}
    <section className={styles.card}><h2 className={styles.detailTitle}><UtensilsCrossed size={23} />Order Summary</h2><ul className={styles.orderItems}>{data.items.map((item, index) => <li key={index}><div><strong>{item.quantity} × {item.name}</strong>{item.selectedAddOns?.map((row, index) => <p key={index}>{row.quantity} × {row.name}</p>)}{item.spiceLevel && <p>Spice: {item.spiceLevel}</p>}{item.itemNote && <p>{item.itemNote}</p>}</div><span>{formatPrice(item.lineTotal)}</span></li>)}</ul><div className={styles.orderTotal}><strong>Order total</strong><strong>{formatPrice(data.orderTotal)}</strong></div></section>
    <section className={styles.card}><h2 className={styles.detailTitle}><Wallet size={23} />Cash &amp; Payment</h2><RiderCash delivery={data} detail /><p>Cash receipt/payment is confirmed separately by a cashier.</p>{data.cashConfirmationGap && <p role="alert">{data.cashConfirmationGap}</p>}</section>
    {data.issue && <section className={styles.card}><h2>Delivery Issue · Awaiting manager review</h2><p>{data.issue.reason}</p><p>Previous stage: {deliveryStatusLabel(data.issue.previousStatus)}. Contact the restaurant. Wait for authorized resolution; do not resume, cancel or refund the order yourself.</p></section>}
    {data.riderTimeline && <section className={styles.card}><h2>Delivery Timeline · Riyadh</h2><ol className={styles.timeline}>{data.riderTimeline.steps.map(row => <li key={row.label} data-recorded={!!row.at}><strong>{row.label}</strong><span>{row.at ? new Date(row.at).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" }) : "Pending / timestamp not recorded"}</span></li>)}</ol>{data.riderTimeline.events.map((row, index) => <p key={index}>{row.label} · {new Date(row.at).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })}{row.reason ? ` · ${row.reason}` : ""}{row.previousStatus ? ` · ${deliveryStatusLabel(row.previousStatus)}` : ""}</p>)}</section>}
    <RestaurantContact contact={data.restaurantContact} preview={preview} />
    {mutation.error && <p role="alert" className={styles.error}>{mutation.error}</p>}{mutation.message && <p role="status" className={styles.notice}>{mutation.message}</p>}
    {preview && <p className={styles.privacy}>Read-only preview. All pickup, delivery and payment controls are disabled.</p>}
    {preview && !admin && <div className={styles.workflowActions}><button type="button" className={styles.action} disabled>Confirm Pickup · Preview Only</button><button type="button" disabled>Report Delivery Issue · Preview Only</button></div>}
    {!preview && (data.mode === "operational" || rehearsal) && !admin && data.canOperate && <div className={styles.workflowActions}>
      {data.deliveryStatus === "assigned" && <button type="button" className={styles.action} disabled={mutation.pending || offline || refreshing || !!error || data.restaurantStatus !== "ready"} onClick={() => ask("pickup")}>Confirm Pickup</button>}
      {data.deliveryStatus === "picked_up" && <button type="button" className={styles.action} disabled={mutation.pending || offline || refreshing || !!error} onClick={() => ask("deliver")}>Confirm Delivery</button>}
      {["assigned", "picked_up", "delivered"].includes(data.deliveryStatus) && <label>Reason / discrepancy explanation (no customer contact details)<textarea maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>}
      {["assigned", "picked_up"].includes(data.deliveryStatus) && <button type="button" disabled={mutation.pending || offline || refreshing || !!error || !reason.trim()} onClick={() => act("issue", contents("issue"))}>Report Delivery Issue</button>}
      {data.deliveryStatus === "delivered" && data.cashState === "collection_pending" && <><label>Cash actually collected (SAR)<input type="text" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label><button type="button" disabled={mutation.pending || offline || refreshing || !!error || amount === ""} className={styles.action} onClick={() => ask("report_cash")}>Report Cash · Not a Payment</button></>}
    </div>}
    {validation && <p role="alert" className={styles.error}>{validation}</p>}
    <DeliveryDialog open={!!confirmation} onClose={() => setConfirmation(null)} title="Confirm rider action" centered busy={mutation.pending}>
      {confirmation && <><p className="text-amber-300 font-semibold">{data.orderNumber}</p><p>{confirmation.action === "pickup" ? "Confirm Pickup — you are collecting this order from the restaurant." : confirmation.action === "deliver" ? "Confirm Delivery — delivery does not confirm payment." : `Report Cash: ${formatPrice(Number(confirmation.payload.amount))}. This records your collection only; cashier confirmation is separate.`}</p>
        {confirmation.payload.reason && <p>Explanation: {confirmation.payload.reason}</p>}
        {(reviewRequired || confirmation.fingerprint !== deliveryFingerprint(data)) && <p role="alert" className={styles.error}>Delivery/payment state changed. Close this dialog, review refreshed details and explicitly start the action again.</p>}
        {mutation.error && <p role="alert" className={styles.error}>{mutation.error}</p>}
        <div className={styles.linkActions}><button type="button" disabled={mutation.pending} onClick={() => setConfirmation(null)}>Cancel / Review details</button><button type="button" disabled={mutation.pending || offline || refreshing || !!error || reviewRequired || confirmation.fingerprint !== deliveryFingerprint(data)} onClick={() => act(confirmation.action, confirmation.payload)}>{mutation.pending ? "Waiting for server…" : "Confirm action"}</button></div></>}
    </DeliveryDialog>
    <div className={styles.updated}><button type="button" disabled={refreshing || mutation.pending} onClick={refresh}>Refresh details</button>{(stamp || updatedAt) && <time dateTime={new Date(stamp || updatedAt).toISOString()}>Last successful update · {new Date(stamp || updatedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh" })} Riyadh</time>}</div>
  </>;
}
export default function RiderDeliveryDetails(props) {
  const { user } = useAuth();
  const mode = { ...props, rehearsal: props.rehearsal && !props.preview };
  return <ProtectedRoute roles={mode.rehearsal ? ["rider"] : ["admin", "rider"]}><div className={styles.portal}><main className={`${styles.main} ${styles.detailMain}`}><header className={styles.detailHeader}><a href={`/rider${deliveryModeQuery(mode)}`} aria-label="Back to deliveries"><ChevronLeft /></a><div><h1>Delivery Details</h1><p>DUNE &amp; GRILLS</p></div></header><DeliveryDetailContent key={`${user?._id || user?.id}:${user?.role}:${mode.id}:${mode.preview}:${mode.rehearsal}`} {...mode} /></main><RiderNav {...mode} /></div></ProtectedRoute>;
}
