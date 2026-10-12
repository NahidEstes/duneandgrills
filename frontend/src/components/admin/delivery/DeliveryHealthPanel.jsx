"use client";
import { formatPrice } from "@/src/utils/currency.js";
import { panelClass } from "@/src/components/admin/staff/staffUi.jsx";

export const cashLabels = { collection_pending: "Customer collection pending", awaiting_confirmation: "Rider reported — cashier pending", discrepancy: "Shortage/discrepancy", confirmed: "Cash confirmed", no_collection: "No collection needed", unavailable: "Unavailable / requires review" };
export const attentionLabels = { ready_unassigned: "Food ready · no rider", pickup_delayed: "Pickup delayed", delivery_delayed: "Delivery delayed", issue: "Unresolved issue", no_cash_report: "Delivered · cash not reported", awaiting_cash: "Reported · cashier pending", discrepancy: "Discrepancy review", timing_unavailable: "Timing unavailable" };
export function CashVisibility({ delivery }) {
  const reported = delivery.cashReport?.amount;
  return <div className="min-w-44 max-w-60 space-y-1 text-xs"><p className="text-amber-300">{cashLabels[delivery.cashState] || "Preview cash state"}</p><strong className="text-sm text-white">{reported != null ? formatPrice(reported) : delivery.amountToCollect == null ? "Unavailable" : formatPrice(delivery.amountToCollect)}</strong><p className="text-neutral-400">Payment: {delivery.paymentStatus}</p>{reported != null && <p className="text-neutral-400">{delivery.cashState === "confirmed" ? "Confirmed receipt" : "Rider reported; do not recollect"}. Ledger outstanding: {delivery.amountToCollect == null ? "Unavailable" : formatPrice(delivery.amountToCollect)}</p>}{delivery.attention?.includes("timing_unavailable") && <p className="text-amber-300">Delay timing unavailable</p>}</div>;
}
export default function DeliveryHealthPanel({ health, onFilter, disabled, preview }) {
  if (!health) return <p className="text-sm text-neutral-400">{preview ? "Attention and cash totals are unavailable in synthetic design preview." : "Operational summaries unavailable."}</p>;
  const contexts = { ready_unassigned: "Ready, eligible and unassigned", pickup_delayed: `≥ ${health.thresholds.pickupMinutes} min after both assignment and food ready`, delivery_delayed: `≥ ${health.thresholds.deliveryMinutes} min since pickup`, issue: "Open issue; no automatic status change", no_cash_report: "Positive known balance; no rider report", awaiting_cash: "Not confirmed or counted as a payment", discrepancy: "Includes acknowledged but unsettled shortages", timing_unavailable: "Required stage timestamps not recorded" };
  const cash = [
    ["collection_pending", "Customer collection pending", health.cash.collection_pending, "Known customer balance · all time"],
    ["awaiting_confirmation", "Rider reported · cashier pending", health.cash.awaiting_confirmation, "Reported amount, NOT confirmed money · all time"],
    ["discrepancy", "Discrepancies", health.cash.discrepancy, "Reported amount in discrepancy cases · all time"],
    ["confirmed_today", "Cash confirmed · Today", health.confirmedToday, "Cashier confirmation date · current Riyadh day"],
  ];
  return <section aria-label="Delivery health" className="space-y-4">
    <div><h2 className="font-body text-xl font-semibold">Needs Attention</h2><p className="mt-1 text-xs text-neutral-400">{health.scope}. Distinct deliveries per condition; conditions may overlap. Updated {new Date(health.updatedAt).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })} Riyadh.</p></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Object.entries(attentionLabels).map(([key, label]) => <button type="button" key={key} disabled={disabled} onClick={() => onFilter({ attention: key })} className={`${panelClass} min-w-0 min-h-28 p-3 text-left hover:border-dune-amber/50 disabled:opacity-50`}><span className="text-2xl font-semibold text-dune-amber">{health.attention[key]}</span><span className="mt-1 block text-sm text-white">{label}</span><span className="mt-1 block text-xs text-neutral-400">{contexts[key]}</span></button>)}</div>
    <h2 className="font-body text-lg font-semibold">Collection &amp; reconciliation</h2>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cash.map(([key, label, value, context]) => <button type="button" key={key} disabled={disabled} onClick={() => onFilter({ cashStatus: key })} className={`${panelClass} min-w-0 min-h-28 p-3 text-left hover:border-dune-amber/50 disabled:opacity-50`}><span className="block text-sm text-neutral-300">{label}</span><strong className="mt-2 block break-words text-lg text-white">{formatPrice(value.amountHalala / 100)}</strong><span className="mt-1 block text-xs text-neutral-400">{value.count} deliveries · {context}</span></button>)}</div>
    {health.cash.unavailable.count > 0 && <button type="button" disabled={disabled} onClick={() => onFilter({ cashStatus: "unavailable" })} className="min-h-11 text-left text-sm text-amber-300 underline">{health.cash.unavailable.count} deliveries require balance/eligibility review; excluded from known cash totals.</button>}
    <p className="text-xs text-neutral-400">Workflow buckets, not additional revenue; do not sum them as sales. Reported cash does not settle the payment ledger. Shortage acknowledgement does not confirm payment. Confirmed Today: {new Date(health.confirmedToday.start).toLocaleDateString("en-GB", { timeZone: "Asia/Riyadh" })}, midnight to next midnight in Asia/Riyadh.</p>
  </section>;
}
