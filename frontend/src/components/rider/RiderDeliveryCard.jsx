"use client";
import { AlertTriangle, ArrowRight, Banknote, CircleCheck, Clock3, Info, MapPin, Package, Truck, UtensilsCrossed } from "lucide-react";
import { formatPrice } from "../../utils/currency.js";
import { deliveryModeQuery, deliveryStatusLabel } from "./deliveryPresentation.js";
import { riderCash, riderDeliveryStage, restaurantStatusLabel } from "./riderPresentation.js";
import styles from "./rider.module.css";

const stageIcons = { issue: AlertTriangle, completed: CircleCheck, transit: Truck, ready: Package, preparing: Clock3 };

export default function RiderDeliveryCard({ delivery, rehearsal = false, preview = false }) {
  const stage = riderDeliveryStage(delivery), StatusIcon = stageIcons[stage.icon], cash = riderCash(delivery);
  const completed = delivery.deliveryStatus === "delivered";
  const waiting = delivery.deliveryStatus === "assigned" && delivery.restaurantStatus !== "ready" && delivery.canOperate !== false;
  const stamp = completed ? delivery.deliveredAt : delivery.assignedAt;
  const validStamp = stamp && Number.isFinite(new Date(stamp).getTime());
  return <article className={`${styles.assignmentCard} ${stage.tone === "issue" ? styles.issueCard : ""}`} aria-label={`${preview ? "Preview" : rehearsal ? "Rehearsal" : "Delivery"} ${delivery.orderNumber}`}>
    <div className={styles.assignmentHeading}>
      <h3>{delivery.orderNumber}</h3>
      <span className={`${styles.stageBadge} ${styles[stage.tone]}`}><StatusIcon size={17} aria-hidden="true" />{stage.label}</span>
    </div>
    <div className={styles.assignmentRow}><UtensilsCrossed aria-hidden="true" /><div><span>{completed ? "Restaurant" : "Restaurant pickup"}</span><strong>Dune &amp; Grills</strong><p>Kitchen: {restaurantStatusLabel(delivery.restaurantStatus)} · Delivery: {deliveryStatusLabel(delivery.deliveryStatus)}</p></div></div>
    {!completed && <div className={styles.assignmentRow}><MapPin aria-hidden="true" /><div><span>Customer location</span><strong>{delivery.customerName || "Customer"}</strong><p>{delivery.customerAddress || delivery.address || "Location not included in this response. Open delivery details."}</p></div></div>}
    {completed && <div className={styles.assignmentRow}><CircleCheck aria-hidden="true" /><div><span>Delivered · Riyadh</span><strong>{validStamp ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date(stamp)) : "Completion time not recorded"}</strong><p>Customer contact details are hidden in history.</p></div></div>}
    <div className={styles.assignmentRow}><Banknote aria-hidden="true" /><div><span>{cash.state === "collection_pending" ? "Cash to collect" : cash.label}</span><strong>{cash.amount == null ? "Amount unavailable" : formatPrice(cash.amount)}</strong>{["awaiting_confirmation", "discrepancy"].includes(cash.state) && <p>Do not collect reported cash again. Cashier confirmation is separate.</p>}</div></div>
    {waiting && <p className={styles.pickupHint}><Info size={19} aria-hidden="true" /><span>Pickup available when the kitchen marks this order Ready.</span></p>}
    {delivery.issue && <p className={styles.issueHint}><AlertTriangle size={19} aria-hidden="true" /><span><strong>Awaiting manager review</strong>{delivery.issue.reason && <span>{delivery.issue.reason}</span>}Do not resume until the issue is resolved.</span></p>}
    {delivery.eligibilityWarning && !delivery.canOperate && <p className={styles.issueHint}><AlertTriangle size={19} aria-hidden="true" /><span>{delivery.eligibilityWarning}</span></p>}
    <a className={styles.viewDelivery} href={`/rider/deliveries/${delivery.id}${deliveryModeQuery({ preview, rehearsal })}`} aria-label={`View Delivery ${delivery.orderNumber}`}>View delivery <ArrowRight size={20} aria-hidden="true" /></a>
    {preview && <p className={styles.previewCaption}>Read-only synthetic preview</p>}
  </article>;
}
