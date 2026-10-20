import assert from "node:assert/strict";
import { test } from "node:test";
import { nextPlannerDay, plannerDay, plannerDueAt, plannerDate, assertPlannerFields, normalizePlannerRepeat } from "../services/plannerRules.js";

test("Planner dates use Riyadh midnight independently of the host timezone", () => {
  assert.equal(plannerDay("2026-10-19T20:59:59Z"), "2026-10-19");
  assert.equal(plannerDay("2026-10-19T21:00:00Z"), "2026-10-20");
  assert.equal(plannerDueAt("2026-10-20", "00:00").toISOString(), "2026-10-19T21:00:00.000Z");
  for (const day of ["2026-02-29", "2026-04-31", "2026-13-01", "not-a-date"]) assert.throws(() => plannerDate(day));
  assert.throws(() => plannerDueAt("2026-10-20", "24:00"));
});
test("daily/weekly recurrences cross years and monthly recurrences retain the original day", () => {
  assert.equal(nextPlannerDay("2026-12-31", "daily"), "2027-01-01");
  assert.equal(nextPlannerDay("2026-12-28", "weekly"), "2027-01-04");
  assert.equal(nextPlannerDay("2026-01-31", "monthly", 31), "2026-02-28");
  assert.equal(nextPlannerDay("2026-02-28", "monthly", 31), "2026-03-31");
  assert.equal(nextPlannerDay("2028-01-31", "monthly", 31), "2028-02-29");
  assert.equal(nextPlannerDay("2026-02-28", "none"), null);
});
test("Planner rejects business mutation fields instead of interpreting reminder text as an instruction", () => {
  for (const key of ["amount", "paymentStatus", "stock", "expense", "paid", "$set"]) assert.throws(() => assertPlannerFields({ title: "Pay supplier", [key]: 500 }, ["title"]), /cannot change business records/);
  assert.throws(() => assertPlannerFields(null, ["title"]));
});

test("custom weekdays are anchored to Sunday-based interval weeks, with valid intervals and due dates", () => {
  const options = normalizePlannerRepeat("custom", { unit: "weeks", interval: 2, weekdays: [3, 0] }, "2026-10-18");
  assert.deepEqual(options.weekdays, [0, 3]);
  assert.equal(nextPlannerDay("2026-10-18", "custom", 18, options, "2026-10-18"), "2026-10-21");
  assert.equal(nextPlannerDay("2026-10-21", "custom", 18, options, "2026-10-18"), "2026-11-01");
  for (const options of [{ unit: "weeks", interval: 0, weekdays: [0] }, { unit: "weeks", interval: 1, weekdays: [] }, { unit: "weeks", interval: 1, weekdays: [0, 0] }, { unit: "weeks", interval: 53, weekdays: [0] }, { unit: "months", interval: 25, weekdays: [] }, { unit: "months", interval: 1, weekdays: [1] }, { unit: "weeks", interval: 1, weekdays: [1], amount: 500 }]) assert.throws(() => normalizePlannerRepeat("custom", options, "2026-10-18"));
  assert.throws(() => normalizePlannerRepeat("custom", { unit: "weeks", interval: 1, weekdays: [1] }, "2026-10-18"), /due date/);
});

test("quarterly, yearly and custom months retain month-end and leap-day anchors", () => {
  assert.equal(nextPlannerDay("2026-01-31", "quarterly", 31), "2026-04-30");
  assert.equal(nextPlannerDay("2026-04-30", "quarterly", 31), "2026-07-31");
  let day = "2028-02-29";
  for (let year = 2029; year <= 2032; year++) { day = nextPlannerDay(day, "yearly", 29); assert.equal(day, `${year}-02-${year === 2032 ? "29" : "28"}`); }
  assert.equal(nextPlannerDay("2026-12-31", "custom", 31, { unit: "months", interval: 3 }), "2027-03-31");
});
