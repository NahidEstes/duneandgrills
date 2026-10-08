"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { successfulUpdateLabel } from "./dashboardFreshness.js";

export default function DashboardDataStatus({ summary, monitoring, settingsHealth, onRefresh, onRetryMonitoring }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const updated = successfulUpdateLabel(summary.lastSuccessAt, now);
  const monitored = successfulUpdateLabel(monitoring.lastSuccessAt, now);
  const disabled = summary.refreshing || summary.offline || ["session", "permission"].includes(summary.errorKind);
  return <section aria-label="Dashboard connection and freshness" className="mb-4 space-y-2 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-1" role="status">
        <p className="text-neutral-300">{summary.status === "loading" || summary.refreshing ? updated ? "Refreshing summary…" : "Loading summary…" : summary.status === "stale" ? "Summary may be outdated" : summary.status === "error" ? "Summary unavailable" : "Summary updated"}</p>
        {updated ? <p className="text-neutral-400">Last Successful Update: <time dateTime={updated.iso} title={updated.exact} aria-label={`Last successful update: ${updated.exact}`}>{updated.relative}</time></p> : <p className="text-neutral-500">No successful summary update yet.</p>}
        <p className="text-neutral-500">Summary auto-refresh: every 60 seconds while visible.</p>
      </div>
      <button type="button" disabled={disabled} onClick={onRefresh} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-dune-amber hover:border-dune-amber/40 disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${summary.refreshing ? "animate-spin" : ""}`} />{summary.error ? "Retry summary" : "Refresh summary"}</button>
    </div>
    {summary.error && <p role="alert" className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-amber-200">{summary.offline ? "Browser offline." : summary.errorKind === "server" ? "Summary API/server error." : "Summary access error."} {summary.error}{updated && " Last successful data is retained; it may be outdated."}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2">
      <p className="text-neutral-400">Order monitoring: {monitoring.error ? "unavailable — pending-order state may be outdated" + (monitored ? " · last successful check " : "") : monitored ? "last checked " : "awaiting first successful check"}{monitored && <time dateTime={monitored.iso} title={monitored.exact} aria-label={`Order monitoring last successful check: ${monitored.exact}`}>{monitored.relative}</time>}</p>
      {monitoring.error && <button type="button" onClick={onRetryMonitoring} disabled={monitoring.refreshing || monitoring.offline || ["session", "permission"].includes(monitoring.errorKind)} className="rounded-lg border border-white/10 px-3 py-2 text-dune-amber disabled:opacity-40">Retry order monitoring</button>}
    </div>
    {monitoring.error && <p role="alert" className="text-amber-200">Order monitoring failed: {monitoring.error} This does not mean there are no pending orders.</p>}
    {settingsHealth.error && <p role="alert" className="text-amber-200">Notification settings could not refresh. Using the last saved/default polling settings.</p>}
  </section>;
}
