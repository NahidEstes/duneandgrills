import { formatPrice } from "../../utils/currency.js";
import { CASH_STATES } from "./riderPresentation.js";
import { deliveryModeQuery, customerPhoneHref } from "./deliveryPresentation.js";
import styles from "./rider.module.css";

export function RestaurantContact({ contact, preview }) {
  const href = !preview && customerPhoneHref(contact?.phone);
  return href ? <a className={styles.contact} href={href}>Contact Restaurant / Manager</a> : <p className={styles.privacy}>Restaurant contact unavailable. Ask an administrator to configure the restaurant phone in Settings.</p>;
}
export default function RiderPendingCash({ pending, rehearsal }) {
  if (!pending) return null;
  return <section className={`${styles.card} ${styles.pendingCash}`} aria-label="Pending Cash"><h2>Pending Cash</h2><p>Your delivered orders · separate from active deliveries, revenue and earnings</p>
    <div className={styles.cashGroups}>{Object.entries(pending.groups).map(([key, group]) => <a key={key} aria-label={`${CASH_STATES[key]}: ${group.count} orders`} href={`/rider/history${deliveryModeQuery({ rehearsal })}${rehearsal ? "&" : "?"}cashStatus=${key}`}><strong>{group.count}</strong><span>{({ collection_pending: "Needs report", awaiting_confirmation: "Awaiting cashier", discrepancy: "Discrepancy" })[key]}</span><small>{formatPrice(group.amountHalala / 100)}<br />{key === "collection_pending" ? "Outstanding" : "Reported"}</small></a>)}</div>
    <ul>{pending.deliveries.map(row => <li key={row.id}><a href={`/rider/deliveries/${row.id}${deliveryModeQuery({ rehearsal })}`}>{row.orderNumber} → <span>{CASH_STATES[row.cashState]}</span></a></li>)}</ul>
    <p>{pending.deliveries.length ? `Latest ${pending.deliveries.length} of all pending tasks. Open a category for all matching orders.` : "No pending cash tasks."}</p>
  </section>;
}
