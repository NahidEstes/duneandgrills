"use client";
import { ArrowRight, Clock3, MapPin, UserRound, UtensilsCrossed, Wallet } from "lucide-react";
import RiderCash from "./RiderCash.jsx";
import { deliveryModeQuery, deliveryStatusLabel } from "./deliveryPresentation.js";
import styles from "./rider.module.css";

export default function RiderDeliveryCard({ delivery, rehearsal = false, preview = false }) {
  return <article className={styles.card} aria-label={`${preview ? "Preview" : rehearsal ? "Rehearsal" : "Delivery"} ${delivery.orderNumber}`}>
    <div className={styles.cardHeading}>
      <div><h3>{delivery.orderNumber}</h3><p>{delivery.timeLabel || (delivery.deliveredAt || delivery.assignedAt ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date(delivery.deliveredAt || delivery.assignedAt)) : "Assignment time not recorded")}</p></div>
      <span className={styles.badge}><Clock3 size={18} />{deliveryStatusLabel(delivery.deliveryStatus)}</span>
    </div>
    {delivery.restaurantStatus === "ready" && <span className={styles.foodBadge}><UtensilsCrossed size={16} />Food ready</span>}
    <div className={styles.recipient}><span className={styles.icon}><UserRound /></span><div><strong>{delivery.customerName}</strong>{delivery.address && <p><MapPin size={16} />{delivery.address}</p>}</div></div>
    <div className={styles.collection}>
      <div className={styles.money}><span className={styles.icon}><Wallet /></span><RiderCash delivery={delivery} /></div>
      {!preview ? <a className={styles.action} href={`/rider/deliveries/${delivery.id}${deliveryModeQuery({ rehearsal })}`}>View Delivery <ArrowRight size={20} /></a> : <details className={styles.details}><summary>View Delivery <ArrowRight size={20} /></summary>
        <div><strong>Read-only synthetic preview</strong><p>No real order, recipient, route or payment. No production actions.</p><a className="text-amber-300 underline" href={`/rider/deliveries/${delivery.id}${deliveryModeQuery({ preview: true })}`}>Open preview details</a></div>
      </details>
      }
    </div>
    {delivery.issue && <p className={styles.error}>Issue: {delivery.issue.reason} · Previous stage: {deliveryStatusLabel(delivery.issue.previousStatus)}. Awaiting manager review — contact the restaurant; do not resume until resolved.</p>}
  </article>;
}
