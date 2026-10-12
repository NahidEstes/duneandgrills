"use client";
import { ArrowRight, CircleCheck, Clock3, MapPin, UserRound, UtensilsCrossed, Wallet } from "lucide-react";
import { formatPrice } from "@/src/utils/currency.js";
import { paymentLabel } from "./riderPresentation.js";
import { deliveryModeQuery, deliveryStatusLabel } from "./deliveryPresentation.js";
import styles from "./rider.module.css";

export default function RiderDeliveryCard({ delivery, rehearsal = false, preview = false }) {
  const paid = delivery.paymentStatus === "paid";
  return <article className={styles.card} aria-label={`${preview ? "Preview" : rehearsal ? "Rehearsal" : "Delivery"} ${delivery.orderNumber}`}>
    <div className={styles.cardHeading}>
      <div><h3>{delivery.orderNumber}</h3><p>{delivery.timeLabel || (delivery.deliveredAt || delivery.assignedAt ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date(delivery.deliveredAt || delivery.assignedAt)) : "Assignment time not recorded")}</p></div>
      <span className={styles.badge}><Clock3 size={18} />{deliveryStatusLabel(delivery.deliveryStatus)}</span>
    </div>
    {delivery.restaurantStatus === "ready" && <span className={styles.foodBadge}><UtensilsCrossed size={16} />Food ready</span>}
    <div className={styles.recipient}><span className={styles.icon}><UserRound /></span><div><strong>{delivery.customerName}</strong>{delivery.address && <p><MapPin size={16} />{delivery.address}</p>}</div></div>
    <div className={styles.collection}>
      <div className={styles.money}><span className={styles.icon}><Wallet /></span><div>
        {paid && <span className={styles.paid}><CircleCheck size={16} />{paymentLabel(delivery.paymentStatus)}</span>}
        <p>{paid ? "Amount to collect" : "Cash to collect"}{preview ? " • sample only" : rehearsal ? " • isolated rehearsal" : ""}</p>
        <strong>{delivery.amountToCollect == null ? "Unavailable" : formatPrice(delivery.amountToCollect)}</strong>
        {!paid && <p>{paymentLabel(delivery.paymentStatus)}</p>}
      </div></div>
      {!preview ? <a className={styles.action} href={`/rider/deliveries/${delivery.id}${deliveryModeQuery({ rehearsal })}`}>View Delivery <ArrowRight size={20} /></a> : <details className={styles.details}><summary>View Delivery <ArrowRight size={20} /></summary>
        <div><strong>Read-only synthetic preview</strong><p>No real order, recipient, route or payment. No production actions.</p><a className="text-amber-300 underline" href={`/rider/deliveries/${delivery.id}${deliveryModeQuery({ preview: true })}`}>Open preview details</a></div>
      </details>
      }
    </div>
  </article>;
}
