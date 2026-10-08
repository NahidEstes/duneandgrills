import { ADMIN_DAY_MS, ADMIN_TIMEZONE, startOfRiyadhDay, startOfRiyadhMonth, toRiyadhDateKey } from "../utils/adminDate.js";
import { ValidationError } from "../utils/inventoryValidation.js";

const LABELS = Object.freeze({ today: "Today", week: "Last 7 Days", month: "This Month", all: "All Time" });
const describe = range => ({ start: range.start.toISOString(), endExclusive: range.end.toISOString(), from: toRiyadhDateKey(range.start), to: toRiyadhDateKey(new Date(range.end.getTime() - 1)) });

// Effective ranges stop at the snapshot instant: incomplete periods compare the
// same elapsed duration, not future sales. Calendar boundaries remain in Riyadh.
export function resolveDashboardPeriod(period = "today", now = new Date()) {
  if (typeof period !== "string" || !Object.hasOwn(LABELS, period)) throw new ValidationError("Invalid dashboard period");
  const base = { period, label: LABELS[period], timezone: ADMIN_TIMEZONE, asOf: now.toISOString() };
  if (period === "all") return { range: null, previous: null, metadata: { ...base, comparison: null, range: null, comparisonNote: "All Time has no comparable baseline." } };
  const today = startOfRiyadhDay(now), calendarEnd = new Date(today.getTime() + ADMIN_DAY_MS);
  const start = period === "month" ? startOfRiyadhMonth(now) : new Date(today.getTime() - (period === "week" ? 6 : 0) * ADMIN_DAY_MS);
  const end = new Date(now.getTime() + 1);
  const previousStart = period === "month" ? startOfRiyadhMonth(now, -1) : new Date(start.getTime() - (period === "week" ? 7 : 1) * ADMIN_DAY_MS);
  const proposedEnd = previousStart.getTime() + end.getTime() - start.getTime();
  const previous = { start: previousStart, end: new Date(Math.min(proposedEnd, start.getTime())) };
  const partialVersusFull = proposedEnd > start.getTime();
  const range = { start, end, days: Math.round((calendarEnd - start) / ADMIN_DAY_MS) };
  return { range, previous, metadata: { ...base, range: { ...describe(range), calendarEndExclusive: calendarEnd.toISOString() }, comparison: { ...describe(previous), mode: partialVersusFull ? "partial_vs_full" : "equal_elapsed", label: period === "month" ? "Previous month" : period === "week" ? "Preceding 7 days" : "Yesterday" }, comparisonNote: partialVersusFull ? "Current partial month versus the full shorter previous month." : "Same elapsed time in the previous period; both end times are exclusive." } };
}

export function dashboardComparison(current, previous, hasBaseline) {
  if (!hasBaseline) return { percent: null, note: "No All Time baseline" };
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return { percent: null, note: "Comparison unavailable" };
  if (current < 0 || previous < 0) return { percent: null, note: "Negative value; percentage comparison suppressed" };
  if (previous === 0) return { percent: null, note: "Previous period was zero" };
  return { percent: Number(((current - previous) / previous * 100).toFixed(1)), note: "vs comparison period" };
}
