"use client";

import { AlertTriangle, Banknote, RefreshCw } from "lucide-react";
import { ATTENTION_LABELS, attentionHref, shiftHistoryHref } from "../../utils/adminOperations.js";
import { orderAgeLabel, orderDateLabel } from "../../utils/adminOrders.js";
import { dashboardMoney } from "./dashboardFreshness.js";

const panel = "rounded-xl border border-white/10 bg-white/[0.025] p-4 sm:p-5";
const link = "rounded text-dune-amber hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-dune-amber";
const unavailable = <p role="status" className="mt-3 text-xs text-amber-300">Unavailable · not verified clear. Retry operations.</p>;

function AttentionCategory({ category, data, pendingMinutes, orderHref }) {
  const definition = ATTENTION_LABELS[category];
  if (data?.status === "restricted") return null;
  const verified = data?.status === "success" && Number.isInteger(data.total) && Array.isArray(data.items);
  return <section className="min-w-0 rounded-lg border border-white/[0.07] p-3" aria-label={definition.title}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium text-white">{definition.title} <span className="text-neutral-400">({verified ? data.total : "—"})</span></h3><span className="text-[0.65rem] text-amber-300">{definition.priority} priority</span></div>
    <p className="mt-1 text-xs text-neutral-400">{definition.explanation}{category === "pending_age" && ` Threshold: ${pendingMinutes ?? "Unavailable"} min.`}</p>
    {!verified ? unavailable : <>
      {data.total === 0 ? <p className="mt-3 text-xs text-emerald-300">No matching records at this update.</p> : <ul className="mt-3 divide-y divide-white/5">{data.items.map(item => <li key={`${category}:${item._id}`} className="py-2 text-xs">
        <a className={`${link} break-all font-medium`} href={attentionHref(category, item, orderHref)}>{item.orderNumber || item.internalReference || "Identifier unavailable"}</a>
        <p className="mt-1 break-words text-neutral-400">{category === "invoice_overdue" ? `Outstanding ${dashboardMoney(item.outstandingAmount)} · Due ${orderDateLabel(item.dueDate)}` : category === "preparation_overdue" ? `Prep due ${orderDateLabel(item.preparationDueAt)}` : orderAgeLabel(item.submittedAt || item.updatedAt || item.createdAt)}</p>
      </li>)}</ul>}
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs"><span className="text-neutral-500">Showing {data.items.length} of {data.total} · max {data.limit}</span><a href={attentionHref(category, null, orderHref)} className={link} aria-label={`View all ${definition.title}`}>View All</a></div>
    </>}
  </section>;
}

function ShiftOverview({ data }) {
  if (data?.status === "restricted") return <p className="mt-3 text-xs text-neutral-400">Shift overview is restricted to shift-management permissions.</p>;
  if (data?.status !== "success") return unavailable;
  if (!data.enabled) return <p className="mt-3 text-sm text-neutral-400">POS shifts are disabled in Restaurant Settings.</p>;
  return <>
    <p className="mt-3 text-sm text-neutral-300">Open shifts: <strong>{data.openCount}</strong> · latest {data.limit} per list</p>
    <p className="mt-1 text-xs text-neutral-400">Expected drawer = signed cash ledger, including opening cash and other cash movements. Card / aggregator-prepaid totals are not drawer receipts.</p>
    <a className={`${link} mt-3 inline-block text-xs`} href={shiftHistoryHref("open")}>View All open shifts</a>
    <ul className="mt-2 space-y-2">{data.open.map(shift => <li key={shift._id} className="rounded-lg border border-white/[0.07] p-3 text-xs">
      <a className={`${link} break-all font-medium`} href={shiftHistoryHref("open", shift._id)}>{shift.shiftNumber || "Identifier unavailable"}</a>
      <p className="mt-1 break-words text-neutral-300">{shift.cashier} · {shift.terminal}</p><p className="mt-1 text-neutral-400">Opened {orderDateLabel(shift.openedAt)}</p>
      <p className="mt-1 text-neutral-300">Expected drawer: {dashboardMoney(shift.expectedCash)}</p>
    </li>)}</ul>
    {data.openCount === 0 && <p className="mt-2 text-xs text-neutral-400">No open shifts at this update.</p>}
    <div className="mt-4 flex flex-wrap justify-between gap-2"><h3 className="text-sm font-medium text-white">Recently closed</h3><a href={shiftHistoryHref("closed")} className={`${link} text-xs`}>View All closed shifts</a></div>
    <p className="mt-1 text-xs text-neutral-500">Existing variance approval threshold: {dashboardMoney(data.varianceThreshold)}. Approved exceptions are not unresolved alerts.</p>
    <ul className="mt-2 space-y-2">{data.closed.map(shift => <li key={shift._id} className="rounded-lg border border-white/[0.07] p-3 text-xs">
      <a className={`${link} break-all font-medium`} href={shiftHistoryHref("closed", shift._id)}>{shift.shiftNumber || "Identifier unavailable"}</a>
      <p className="mt-1 break-words text-neutral-300">{shift.cashier} · {shift.terminal}</p><p className="mt-1 text-neutral-400">Closed {orderDateLabel(shift.closedAt)}</p>
      <dl className="mt-2 grid grid-cols-3 gap-2">{[["Expected", shift.expectedCash], ["Counted", shift.countedCash], ["Difference", shift.difference]].map(([label, value]) => <div key={label}><dt className="text-neutral-500">{label}</dt><dd className="break-words text-neutral-200">{dashboardMoney(value)}</dd></div>)}</dl>
      <p className={`mt-2 ${shift.varianceStatus === "review_required" ? "text-red-300" : "text-neutral-400"}`}>{({ approved: "Variance exception approved", review_required: "Variance exceeds current threshold · review required", within_threshold: "Within variance threshold", unavailable: "Variance review unavailable · missing recorded difference" })[shift.varianceStatus]}</p>
    </li>)}</ul>
    {data.closedCount === 0 && <p className="mt-2 text-xs text-neutral-400">No closed shifts at this update.</p>}
  </>;
}

export default function OperationsOverview({ resource, orderHref }) {
  const { data, status, refreshing, error, errorKind } = resource;
  // Never retain financial data visually after access/session revocation.
  const visible = ["session", "permission"].includes(errorKind) ? null : data;
  return <section aria-label="Live attention and POS shifts" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3 text-xs">
      <p className="text-neutral-400">Live operational snapshot · independent of sales period<br />{visible?.generatedAt ? <time dateTime={visible.generatedAt} title={orderDateLabel(visible.generatedAt)}>Last snapshot: {orderDateLabel(visible.generatedAt)}</time> : "No successful operations update yet."}</p>
      <button type="button" disabled={refreshing || ["session", "permission"].includes(errorKind)} onClick={() => resource.refresh("manual")} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-dune-amber/30 px-3 text-dune-amber disabled:opacity-50"><RefreshCw aria-hidden="true" className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Refreshing operations…" : "Retry / refresh operations"}</button>
    </div>
    {error && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">{status === "stale" ? "Operations may be outdated. " : "Operations unavailable. "}{error}</p>}
    {!visible && status === "loading" ? <p role="status" className={panel}>Loading operational overview…</p> : <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className={panel}><h2 className="flex items-center gap-2 text-base font-semibold text-white"><AlertTriangle aria-hidden="true" className="h-5 w-5 text-dune-amber" />Needs Attention</h2><p className="mt-1 text-xs text-neutral-400">Counts are unique records per category; one order can have two different reasons. Old snapshots are not confirmation of current clearance.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{Object.keys(ATTENTION_LABELS).map(category => <AttentionCategory key={category} category={category} data={visible?.categories?.[category]} pendingMinutes={visible?.pendingAttentionMinutes} orderHref={orderHref} />)}</div></div>
      <div className={panel}><h2 className="flex items-center gap-2 text-base font-semibold text-white"><Banknote aria-hidden="true" className="h-5 w-5 text-dune-amber" />POS Shift Overview</h2><ShiftOverview data={visible?.shifts} /></div>
    </div>}
  </section>;
}
