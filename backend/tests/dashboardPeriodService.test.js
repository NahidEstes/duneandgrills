import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveDashboardPeriod, dashboardComparison } from "../services/dashboardPeriodService.js";

test("Today uses Riyadh midnight, including year rollover, and compares equal elapsed yesterday", () => {
  const before = resolveDashboardPeriod("today", new Date("2026-12-31T20:59:59.999Z"));
  const after = resolveDashboardPeriod("today", new Date("2026-12-31T21:00:00Z"));
  assert.equal(before.metadata.range.from, "2026-12-31");
  assert.equal(after.metadata.range.from, "2027-01-01");
  assert.equal(after.range.start.toISOString(), "2026-12-31T21:00:00.000Z");
  assert.equal(after.metadata.range.calendarEndExclusive, "2027-01-01T21:00:00.000Z");
  assert.equal(after.range.end - after.range.start, after.previous.end - after.previous.start);
});
test("Last 7 Days includes today plus six days; comparison is the preceding equal elapsed period", () => {
  const p = resolveDashboardPeriod("week", new Date("2028-03-01T09:00:00Z"));
  assert.equal(p.metadata.range.from, "2028-02-24"); assert.equal(p.range.days, 7);
  assert.equal(p.metadata.comparison.from, "2028-02-17");
  assert.equal(p.range.end - p.range.start, p.previous.end - p.previous.start);
});
test("month starts in Riyadh, supports leap years and explicitly labels shorter previous months", () => {
  const leap = resolveDashboardPeriod("month", new Date("2028-02-29T09:00:00Z"));
  assert.equal(leap.metadata.range.from, "2028-02-01"); assert.equal(leap.range.days, 29);
  assert.equal(leap.metadata.comparison.mode, "equal_elapsed"); assert.equal(leap.metadata.comparison.to, "2028-01-29");
  for (const [year, lastDay] of [[2028, 29], [2027, 28]]) {
    const p = resolveDashboardPeriod("month", new Date(`${year}-03-31T09:00:00Z`));
    assert.equal(p.previous.end.toISOString(), `${year}-02-${lastDay}T21:00:00.000Z`);
    assert.equal(p.metadata.comparison.mode, "partial_vs_full"); assert.match(p.metadata.comparisonNote, /full shorter/);
  }
});
test("All Time has no baseline, invalid input is rejected, missing/zero/negative values never invent trends", () => {
  assert.equal(resolveDashboardPeriod("all").previous, null); assert.equal(resolveDashboardPeriod().metadata.period, "today");
  for (const value of ["bad", "", ["today"], { $ne: "today" }]) assert.throws(() => resolveDashboardPeriod(value), /Invalid dashboard period/);
  assert.deepEqual(dashboardComparison(120, 100, true), { percent: 20, note: "vs comparison period" });
  assert.equal(dashboardComparison(50, 100, true).percent, -50);
  for (const [current, previous, baseline] of [[20, 0, true], [0, 0, true], [20, undefined, true], [-20, 10, true], [10, -20, true], [100, 50, false]]) {
    const result = dashboardComparison(current, previous, baseline); assert.equal(result.percent, null); assert.ok(result.note);
  }
});
