"use client";

import { dashboardMoney } from "./dashboardFreshness.js";

export default function SalesReportSummary({ summary = {}, activity = {}, definitions = {}, activityPeriod = "selected period", collapsible = false, compact = false }) {
  const body = <>
    <h3 className="text-sm font-semibold text-white">Sales · order-date basis · Asia/Riyadh</h3>
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ["Ordered amount (all states)", summary.orderedAmount], ["Aggregator prepaid sales", summary.aggregatorPrepaidAmount], ["Captured-sale discounts", summary.discountTotal],
      ...(!compact ? [["Gross sales (after discounts)", summary.grossSales], ["Recorded collections (before reversals)", summary.collectedAmount], ["Completed refunds", summary.completedRefunds], ["Captured-payment voids", summary.voidAmount], ["Net sales", summary.netSales]] : []),
    ].map(([label, value]) => <div key={label}><dt className="text-xs text-neutral-500">{label}</dt><dd className="mt-1 text-base font-semibold text-dune-amber">{dashboardMoney(value)}</dd></div>)}</dl>
    <div className="border-t border-white/10 pt-3"><h3 className="text-sm font-semibold text-white">Dated payment / refund activity · {activityPeriod}</h3><p className="mt-1 text-xs text-neutral-500">Event-date basis, independent of the order-date sales above. Records, not bank settlement verification.</p><dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ["Dated captures", activity.collectedAmount], ["Dated completed refunds", activity.completedRefunds],
      ["Dated voids", activity.voidAmount], ["Dated net collections", activity.netCollected],
      ["Cash captures", activity.cashCollected], ["Cash refunds", activity.cashRefunds],
      ["Cash voids", activity.cashVoids], ["Net cash from sales activity", activity.netCash],
    ].map(([label, value]) => <div key={label}><dt className="text-xs text-neutral-500">{label}</dt><dd className="mt-1 text-sm text-white">{dashboardMoney(value)}</dd></div>)}</dl></div>
    <details className="text-xs text-neutral-400"><summary className="cursor-pointer text-dune-amber">Calculation definitions</summary><dl className="mt-2 space-y-2">{Object.entries(definitions).filter(([key]) => key !== "timezone").map(([key, text]) => <div key={key}><dt className="font-semibold text-neutral-300">{key.replace(/([A-Z])/g, " $1")}</dt><dd>{text}</dd></div>)}</dl></details>
  </>;
  return <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
    <div><h2 className="text-sm font-semibold text-white">Detailed sales &amp; payment reporting · {activityPeriod}</h2><p className="mt-1 text-xs text-amber-200/80">Order totals are not collections. Net sales is not profit. Aggregator prepaid amounts are not restaurant cash receipts.</p></div>
    {activity.unknownDateScope && <p className="text-xs text-neutral-400">Missing event-date warnings cover the selected order-date cohort. Choose All Time for full-history warnings; dated activity still includes events from older orders in the selected period.</p>}
    {(Number(activity.unknownPaymentDateAmount) > 0 || Number(activity.unknownRefundDateAmount) > 0) && <p role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">{activity.unknownDateScope || "Across the selected source/type history"}: {dashboardMoney(activity.unknownPaymentDateAmount)} captured payments and {dashboardMoney(activity.unknownRefundDateAmount)} completed refunds have no known event date. Excluded from dated activity; no dates were invented.</p>}
    {collapsible ? <details><summary className="cursor-pointer rounded-lg py-2 text-sm text-dune-amber focus-visible:outline focus-visible:outline-2 focus-visible:outline-dune-amber">Show detailed reporting</summary><div className="mt-3 space-y-3">{body}</div></details> : body}
  </section>;
}
