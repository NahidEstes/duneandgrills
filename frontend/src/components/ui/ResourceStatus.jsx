"use client";

const stamp = value => new Intl.DateTimeFormat("en-SA", { timeZone: "Asia/Riyadh", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));

export default function ResourceStatus({ lastSuccessAt, refreshing, loading, error, hasData, onRetry, showDetails = true }) {
  const message = error?.response?.data?.message || error?.message || "Unable to load data.";
  return <div className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${error ? "border-amber-500/25 bg-amber-500/5 text-amber-200" : "border-white/10 bg-white/[0.02] text-neutral-400"}`} role={error && showDetails ? "alert" : "status"}>
    <div className="space-y-1"><p>{error ? hasData ? "Showing previously loaded data. It may be outdated." : "Data could not be loaded." : refreshing || loading ? "Updating data…" : "Data loaded"}{lastSuccessAt && <> · Last updated: <time dateTime={new Date(lastSuccessAt).toISOString()}>{stamp(lastSuccessAt)} (Riyadh)</time></>}</p>{error && showDetails && <p>{message}</p>}</div>
    {onRetry && <button type="button" disabled={Boolean(refreshing || loading)} onClick={() => Promise.resolve(onRetry()).catch(() => undefined)} className="min-h-9 rounded-lg border border-white/15 px-3 font-semibold text-neutral-200 hover:bg-white/5 disabled:opacity-50">{error ? "Retry data" : "Refresh data"}</button>}
  </div>;
}
