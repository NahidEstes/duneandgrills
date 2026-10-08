"use client";

import { DASHBOARD_PERIODS } from "../../utils/dashboardPeriods.js";
import { formatAdminDate } from "./adminUi.js";

export default function DashboardPeriodControls({ period, onChange, resource }) {
  const metadata = resource.data?.reportingPeriod;
  const date = value => formatAdminDate(value, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return <section aria-label="Dashboard reporting period" className="mb-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-white">Reporting period · Asia/Riyadh</h2>
      <div role="group" aria-label="Select reporting period" className="flex flex-wrap gap-2">{DASHBOARD_PERIODS.map(option => <button key={option.value} type="button" aria-pressed={period === option.value} onClick={() => onChange(option.value)} className={`min-h-10 rounded-lg border px-3 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-dune-amber ${period === option.value ? "border-dune-amber/60 bg-dune-amber/10 text-dune-amber" : "border-white/10 text-neutral-300 hover:bg-white/5"}`}>{option.label}</button>)}</div>
    </div>
    <div role="status" className="mt-3 space-y-1 text-xs text-neutral-400">
      {!metadata ? <p>{resource.status === "loading" ? "Loading selected period…" : "Selected-period reporting unavailable."}</p> : <>
        <p><strong className="text-neutral-200">{metadata.label}</strong>{metadata.range ? ` · ${date(metadata.range.start)} → ${date(metadata.asOf)} (so far)` : " · lifetime recorded orders"}{resource.status === "stale" ? " · retained data may be outdated" : ""}</p>
        <p>{metadata.comparison ? `Comparison: ${metadata.comparison.label} · ${date(metadata.comparison.start)} → ${date(metadata.comparison.endExclusive)} (exclusive). ${metadata.comparisonNote}` : metadata.comparisonNote}</p>
      </>}
      <p>Sales and order counts use order dates. Dated payment/refund activity uses event dates. Live operations below are independent of this period.</p>
    </div>
  </section>;
}
