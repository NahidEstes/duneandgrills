import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  buildCalendarDays,
  formatDateValue,
  isDateAllowed,
  parseDateValue,
  sameDay,
} from "../src/components/ui/datePickerUtils.js";

test("parses and formats API-compatible local date values", () => {
  const date = parseDateValue("2026-09-11");
  const dateTime = parseDateValue("2026-09-11T14:35");

  assert.equal(formatDateValue(date), "2026-09-11");
  assert.equal(formatDateValue(dateTime, "datetime-local"), "2026-09-11T14:35");
  assert.equal(parseDateValue("2026-02-30"), null);
});

test("builds a six-week Sunday-first calendar grid", () => {
  const days = buildCalendarDays(new Date(2026, 8, 1));

  assert.equal(days.length, 42);
  assert.equal(days[0].getDay(), 0);
  assert.equal(formatDateValue(days[0]), "2026-08-30");
  assert.equal(formatDateValue(days[41]), "2026-10-10");
  assert.equal(sameDay(addDays(days[0], 12), new Date(2026, 8, 11)), true);
});

test("enforces minimum and maximum values without timezone conversion", () => {
  const date = parseDateValue("2026-09-11");

  assert.equal(isDateAllowed(date, "date", "2026-09-10", "2026-09-12"), true);
  assert.equal(isDateAllowed(date, "date", "2026-09-12", undefined), false);
});
