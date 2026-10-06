import assert from "node:assert/strict";
import test from "node:test";
import { resolveAnalyticsRange } from "../services/adminAnalyticsService.js";
import { parseRiyadhDate, startOfRiyadhMonth, toRiyadhDateKey } from "../utils/adminDate.js";

test("today analytics follows the Riyadh calendar day", () => {
  const range = resolveAnalyticsRange({ period: "today" }, new Date("2026-09-12T22:30:00.000Z"));
  assert.equal(range.start.toISOString(), "2026-09-12T21:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-09-13T21:00:00.000Z");
  assert.equal(range.days, 1);
});

test("custom analytics includes the complete final Riyadh date", () => {
  const range = resolveAnalyticsRange({ period: "custom", from: "2026-09-01", to: "2026-09-12" });
  assert.equal(range.start.toISOString(), "2026-08-31T21:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-09-12T21:00:00.000Z");
  assert.equal(range.days, 12);
});

test("admin date parsing rejects impossible dates", () => {
  assert.throws(() => parseRiyadhDate("2026-02-31"), /Invalid date/);
  assert.throws(() => resolveAnalyticsRange({ period: "custom", from: "2026-01-01", to: "2027-02-01" }), /cannot exceed 366 days/);
  assert.throws(() => parseRiyadhDate(["2026-10-05"]), /must use YYYY-MM-DD/);
});

test("monthly Riyadh chart boundaries do not drift with UTC month lengths", () => {
  assert.equal(toRiyadhDateKey(startOfRiyadhMonth(parseRiyadhDate("2026-03-01"), -5)), "2025-10-01");
  assert.equal(toRiyadhDateKey(startOfRiyadhMonth(new Date("2026-12-31T22:00:00Z"))), "2027-01-01");
});
