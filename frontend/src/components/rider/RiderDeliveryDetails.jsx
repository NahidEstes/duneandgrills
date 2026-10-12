"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, Info, MapPin, Phone, Store, UserRound, UtensilsCrossed, Wallet } from "lucide-react";
import ProtectedRoute from "@/src/components/ProtectedRoute.jsx";
import { fetchDeliveryDetails, deliveryAction } from "@/src/api/deliveryApi.js";
import { formatPrice } from "@/src/utils/currency.js";
import useDeliverySubmission from "@/src/hooks/useDeliverySubmission.js";
import RiderNav from "./RiderNav.jsx";
import { customerMapHref, customerPhoneHref, deliveryModeQuery, deliveryStatusLabel } from "./deliveryPresentation.js";
import styles from "./rider.module.css";

export function DeliveryDetailContent({ id, preview, rehearsal, admin = false, afterChange }) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [version, setVersion] = useState(0), [updatedAt, setUpdatedAt] = useState(null);
  const [reason, setReason] = useState(""), [amount, setAmount] = useState("");
  const mutation = useDeliverySubmission();
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setLoading(true); setError(""); setData(null); setUpdatedAt(null);
    fetchDeliveryDetails(id, { preview, rehearsal, admin }, controller.signal).then(result => { if (current) { setData(result.data); setUpdatedAt(new Date()); } })
      .catch(error => { if (current) setError(navigator.onLine ? error.response?.data?.message || error.message || "Delivery unavailable." : "You are offline. Reconnect and retry."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [id, preview, rehearsal, admin, version]);
  const refresh = () => setVersion(value => value + 1);
  const act = action => mutation.submit(action, { expectedRevision: data.revision,
    ...(["issue", "resolve_issue", "acknowledge_cash", "report_cash"].includes(action) ? { reason } : {}), ...(action === "report_cash" ? { amount } : {}) },
  payload => deliveryAction(id, action, payload, { admin }), () => { refresh(); afterChange?.(); });
  if (loading) return <div className={styles.empty} role="status">Loading delivery details…</div>;
  if (error) return <div className={styles.empty} role="alert"><h2>Delivery unavailable</h2><p>{error}</p><button type="button" className={styles.action} onClick={refresh}>Retry details</button></div>;
  if (!data) return null;
  const stage = data.deliveryStatus === "issue" ? data.issue?.previousStatus : data.deliveryStatus;
  const phone = !preview && customerPhoneHref(data.customer?.phone), map = !preview && customerMapHref(data.customer?.address);
  return <>
    <div className={styles.banner}><Info aria-hidden="true" /><div><strong>{preview ? "DESIGN PREVIEW • SYNTHETIC DATA" : "ISOLATED LOCAL REHEARSAL"}</strong><p>Live delivery disabled. Delivery status does not confirm payment.</p></div></div>
    {data.eligibilityWarning && <p className={styles.error} role="alert">{data.eligibilityWarning}</p>}
    <section className={styles.card}><div className={styles.cardHeading}><h2>{data.orderNumber}</h2><span className={styles.badge}>{deliveryStatusLabel(data.deliveryStatus)}</span></div><p>{data.restaurantStatus === "ready" ? "Food ready for pickup." : `Restaurant status: ${data.restaurantStatus}`}</p>
      <ol className={styles.progress} aria-label="Delivery progress">{["assigned", "picked_up", "delivered"].map((status, index, steps) => <li key={status} className={index < steps.indexOf(stage) ? styles.completedStep : undefined} aria-current={stage === status ? "step" : undefined}><span />{deliveryStatusLabel(status)}</li>)}</ol></section>
    <section className={styles.card}><div className={styles.recipient}><Store className="text-amber-400" /><div><h2>Pickup · Dune &amp; Grills</h2><p>{data.pickupInstructions}</p></div></div></section>
    {data.customer && <section className={styles.card}><div className={styles.recipient}><UserRound /><div><h2>{data.customer.name}</h2><p><MapPin size={18} />{data.customer.address || "Address not recorded"}</p><p>{data.deliveryNote}</p></div></div>
      <div className={styles.linkActions}>{phone ? <a href={phone}><Phone size={20} />Call Customer</a> : <button type="button" disabled>Call unavailable{preview ? " in preview" : ""}</button>}{map ? <a href={map} target="_blank" rel="noopener noreferrer"><MapPin size={20} />Open Map</a> : <button type="button" disabled>Map unavailable{preview ? " in preview" : ""}</button>}</div></section>}
    {!data.customer && <p className={styles.privacy}>Historical customer contact/address is hidden.</p>}
    <section className={styles.card}><h2 className={styles.detailTitle}><UtensilsCrossed size={23} />Order Summary</h2><ul className={styles.orderItems}>{data.items.map((item, index) => <li key={index}><div><strong>{item.quantity} × {item.name}</strong>{item.selectedAddOns?.map((row, index) => <p key={index}>{row.quantity} × {row.name}</p>)}{item.spiceLevel && <p>Spice: {item.spiceLevel}</p>}{item.itemNote && <p>{item.itemNote}</p>}</div><span>{formatPrice(item.lineTotal)}</span></li>)}</ul><div className={styles.orderTotal}><strong>Order total</strong><strong>{formatPrice(data.orderTotal)}</strong></div></section>
    <section className={styles.card}><h2 className={styles.detailTitle}><Wallet size={23} />Cash to Collect</h2><strong className={styles.balance}>{data.amountToCollect == null ? "Unavailable" : formatPrice(data.amountToCollect)}</strong><p>Payment: {data.paymentStatus} · Cash report: {data.cashReport?.status || "none"}</p>{data.cashReport?.amount != null && <p>Reported: {formatPrice(data.cashReport.amount)}</p>}<p>Cash receipt/payment is confirmed separately by a cashier.</p>{data.cashConfirmationGap && <p role="alert">{data.cashConfirmationGap}</p>}</section>
    {data.issue && <section className={styles.card}><h2>Delivery Issue</h2><p>{data.issue.reason}</p></section>}
    {mutation.error && <p role="alert" className={styles.error}>{mutation.error}</p>}{mutation.message && <p role="status" className={styles.notice}>{mutation.message}</p>}
    {preview && <p className={styles.privacy}>Read-only preview. All pickup, delivery and payment controls are disabled.</p>}
    {preview && !admin && <div className={styles.workflowActions}><button type="button" className={styles.action} disabled>Confirm Pickup · Preview Only</button><button type="button" disabled>Report Delivery Issue · Preview Only</button></div>}
    {rehearsal && !admin && data.canOperate && <div className={styles.workflowActions}>
      {data.deliveryStatus === "assigned" && <button type="button" className={styles.action} disabled={mutation.pending || data.restaurantStatus !== "ready"} onClick={() => act("pickup")}>Confirm Pickup</button>}
      {data.deliveryStatus === "picked_up" && <button type="button" className={styles.action} disabled={mutation.pending} onClick={() => act("deliver")}>Confirm Delivery</button>}
      {["assigned", "picked_up", "delivered"].includes(data.deliveryStatus) && <label>Reason / discrepancy explanation (no customer contact details)<textarea maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>}
      {["assigned", "picked_up"].includes(data.deliveryStatus) && <button type="button" disabled={mutation.pending || !reason.trim()} onClick={() => act("issue")}>Report Delivery Issue</button>}
      {data.deliveryStatus === "delivered" && data.amountToCollect > 0 && data.cashReport?.status === "none" && <><label>Cash actually collected (SAR)<input type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></label><button type="button" disabled={mutation.pending || amount === ""} className={styles.action} onClick={() => act("report_cash")}>Report Cash · Not a Payment</button></>}
    </div>}
    <div className={styles.updated}><button type="button" onClick={refresh}>Refresh details</button>{updatedAt && <time dateTime={updatedAt.toISOString()}>Last loaded · {updatedAt.toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh" })} Riyadh</time>}</div>
  </>;
}
export default function RiderDeliveryDetails(props) {
  const mode = { ...props, rehearsal: props.rehearsal && !props.preview };
  return <ProtectedRoute roles={mode.rehearsal ? ["rider"] : ["admin", "rider"]}><div className={styles.portal}><main className={`${styles.main} ${styles.detailMain}`}><header className={styles.detailHeader}><a href={`/rider${deliveryModeQuery(mode)}`} aria-label="Back to deliveries"><ChevronLeft /></a><div><h1>Delivery Details</h1><p>DUNE &amp; GRILLS</p></div></header><DeliveryDetailContent {...mode} /></main><RiderNav {...mode} /></div></ProtectedRoute>;
}
