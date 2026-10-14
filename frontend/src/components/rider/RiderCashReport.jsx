import { useId } from "react";
import { AlertTriangle, Banknote, CircleCheck, Clock3, Info } from "lucide-react";
import { paymentLabel } from "./riderPresentation.js";
import { riderAmount } from "./riderPickup.js";
import { riderCashReceipt, riyadhRecordedTime } from "./riderCompletion.js";
import styles from "./rider.module.css";

export default function RiderCashReport({ data, amount, reason, onAmount, onReason, onConfirm, action, preview, admin, pending }) {
  const rulesId = useId();
  const receipt = riderCashReceipt(data);
  const Icon = receipt.icon === "issue" ? AlertTriangle : ["confirmed", "none"].includes(receipt.icon) ? CircleCheck : Clock3;
  const form = !admin && data.cashReport?.status === "none" && data.cashState === "collection_pending" && Number.isSafeInteger(data.customerCollectionHalala) && data.customerCollectionHalala > 0;
  const shortage = /^\d+(\.\d{1,2})?$/.test(amount) && Math.round(Number(amount) * 100) < data.customerCollectionHalala;
  return <section className={`${styles.detailCard} ${styles.cashReportCard}`} aria-label="Cash reporting">
    <div className={`${styles.cashStatusHeading} ${styles[receipt.tone]}`}><Icon aria-hidden="true" /><h3>{receipt.label}</h3></div>
    <p>Payment: {paymentLabel(data.paymentStatus)}</p>
    {receipt.recorded ? <>
      <dl className={styles.cashReceipt}><div><dt>Submitted amount</dt><dd>{riderAmount(data.cashReport.amount)}</dd></div><div><dt>Reported at</dt><dd>{riyadhRecordedTime(data.cashReport.reportedAt)}</dd></div><div><dt>Cashier confirmation</dt><dd>{data.cashReport.status === "confirmed" ? "Confirmed" : "Pending"}</dd></div>{data.cashReport.status === "confirmed" && <div><dt>Confirmed at</dt><dd>{riyadhRecordedTime(data.cashReport.confirmedAt)}</dd></div>}{data.cashReport.acknowledgedAt && <div><dt>Manager review recorded</dt><dd>{riyadhRecordedTime(data.cashReport.acknowledgedAt)} · discrepancy remains unresolved</dd></div>}</dl>
      <p>Do not collect or report this cash again.</p>
      {data.cashReport.status === "discrepancy" && <p className={styles.discrepancyMessage}>A manager must review the shortage. This report is not a payment or settlement.</p>}
      {data.cashState === "unavailable" && <p role="alert" className={styles.error}>This receipt is recorded, but the current balance or order eligibility requires authorized review.</p>}
    </> : form ? <div className={styles.cashReportForm}>
      <p>Enter the cash you actually received from the customer. Current outstanding balance: <strong>{riderAmount(data.customerCollectionHalala / 100)}</strong>.</p>
      <label>Cash actually collected (SAR)<input type="text" inputMode="decimal" autoComplete="off" maxLength={16} value={amount} disabled={pending} onChange={event => onAmount(event.target.value)} aria-describedby={rulesId} /></label>
      <p id={rulesId}>Use up to two decimal places. A lower or zero collection requires an explanation.</p>
      <label>Shortage / discrepancy explanation (no customer contact details){shortage && <span> · Required</span>}<textarea maxLength={500} required={shortage} value={reason} disabled={pending} onChange={event => onReason(event.target.value)} /></label>
      <button type="button" className={styles.pickupPrimary} disabled={!action.allowed} onClick={onConfirm}><Banknote size={22} aria-hidden="true" />{pending ? "Waiting for server…" : "Report cash collected"}</button>
      {!action.allowed && <p className={styles.actionExplanation}>{action.reason}</p>}
    </div> : <p>{data.cashState === "no_collection" ? "The server shows no outstanding cash collection. No cash report is needed." : admin && data.cashState === "collection_pending" ? "The assigned rider must report the collection before authorized cashier confirmation." : "A verified outstanding balance and collection status are required. Refresh details or contact the restaurant."}</p>}
    {preview && <p>Cash reporting is disabled in the read-only preview.</p>}
    <p className={styles.paymentReminder}><Info size={17} aria-hidden="true" />Reporting cash does not confirm payment. Cashier confirmation is separate.</p>
  </section>;
}
