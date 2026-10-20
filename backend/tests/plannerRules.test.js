import assert from "node:assert/strict";
import { test } from "node:test";
import { nextPlannerDay, plannerDay, plannerDueAt, plannerDate, assertPlannerFields } from "../services/plannerRules.js";

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
