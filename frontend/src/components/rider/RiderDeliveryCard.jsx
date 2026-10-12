"use client";
import { ArrowRight, CircleCheck, Clock3, MapPin, UserRound, UtensilsCrossed, Wallet } from "lucide-react";
import { formatPrice } from "@/src/utils/currency.js";
import { paymentLabel } from "./riderPresentation.js";
import styles from "./rider.module.css";

export default function RiderDeliveryCard({ delivery }) {
  const paid = delivery.paymentStatus === "paid";
  return <article className={styles.card} aria-label={`Preview ${delivery.orderNumber}`}>
    <div className={styles.cardHeading}>
      <div><h3>{delivery.orderNumber}</h3><p>{delivery.timeLabel}</p></div>
      <span className={styles.badge}><Clock3 size={18} />Assigned</span>
    </div>
    {delivery.restaurantStatus === "ready" && <span className={styles.foodBadge}><UtensilsCrossed size={16} />Food ready</span>}
    <div className={styles.recipient}><span className={styles.icon}><UserRound /></span><div><strong>{delivery.customerName}</strong><p><MapPin size={16} />{delivery.address}</p></div></div>
    <div className={styles.collection}>
      <div className={styles.money}><span className={styles.icon}><Wallet /></span><div>
        {paid && <span className={styles.paid}><CircleCheck size={16} />{paymentLabel(delivery.paymentStatus)}</span>}
        <p>{paid ? "Amount to collect" : "Cash to collect"} • sample only</p>
        <strong>{delivery.amountToCollect == null ? "Unavailable" : formatPrice(delivery.amountToCollect)}</strong>
        {!paid && <p>{paymentLabel(delivery.paymentStatus)}</p>}
      </div></div>
      <details className={styles.details}><summary>View Delivery <ArrowRight size={20} /></summary>
        <div><strong>Read-only synthetic preview</strong><p>No real order, recipient, route or payment. Pickup, delivery and collection actions are unavailable until Phase 2.</p></div>
      </details>
    </div>
  </article>;
}
