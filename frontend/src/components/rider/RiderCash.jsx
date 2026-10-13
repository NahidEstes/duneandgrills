import { formatPrice } from "../../utils/currency.js";
import { paymentLabel, riderCash } from "./riderPresentation.js";
import styles from "./rider.module.css";

export default function RiderCash({ delivery, detail = false }) {
  const cash = riderCash(delivery);
  const amount = value => Number.isSafeInteger(value) && value >= 0 ? formatPrice(value / 100) : "Unavailable";
  return <div className={styles.cashFacts}>
    <p>{cash.label}</p><strong>{cash.amount == null ? "Unavailable" : formatPrice(cash.amount)}</strong>
    <p>Payment: {paymentLabel(delivery.paymentStatus)}</p>
    {["awaiting_confirmation", "discrepancy"].includes(cash.state) && <p>Do not collect reported cash again. Cashier confirmation is separate.</p>}
    {detail && <dl><div><dt>Customer outstanding payment balance</dt><dd>{amount(delivery.ledgerOutstandingHalala)}</dd></div>
      <div><dt>Rider-reported collection</dt><dd>{amount(delivery.reportedCashHalala)}</dd></div>
      <div><dt>Cashier-confirmed receipt</dt><dd>{delivery.cashReport?.status === "confirmed" ? amount(delivery.reportedCashHalala) : "Not confirmed"}</dd></div></dl>}
  </div>;
}
