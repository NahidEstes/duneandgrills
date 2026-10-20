import assert from "node:assert/strict";
import { test } from "node:test";
import { plannerCalendar, plannerDay, plannerMonth, plannerOverdue, plannerTimeLabel } from "../src/utils/planner.js";

test("calendar lays out October 2026 with October 1 on Thursday and October 20 on Tuesday", () => {
  const days = plannerCalendar("2026-10-01");
  assert.equal(days[0], "2026-09-27");
  assert.equal(days.indexOf("2026-10-01") % 7, 4);
  assert.equal(days.indexOf("2026-10-20") % 7, 2);
  assert.equal(days.at(-1), "2026-10-31");
  assert.equal(days.length % 7, 0);
  assert.equal(plannerMonth("2026-12-15", 1), "2027-01-01");
  const leap = plannerCalendar("2028-02-01");
  assert.ok(leap.includes("2028-02-29"));
});
test("dates and overdue indicators use Riyadh time while terminal statuses stay out of overdue", () => {
  assert.equal(plannerDay("2026-10-19T21:00:00Z"), "2026-10-20");
  assert.match(plannerTimeLabel("2026-10-19T21:00:00Z"), /12:00 am/i);
  for (const status of ["Pending", "In Progress"]) assert.equal(plannerOverdue({ status, dueAt: "2026-10-19T20:59:59Z" }, "2026-10-19T21:00:00Z"), true);
  for (const status of ["Done", "Cancelled"]) assert.equal(plannerOverdue({ status, dueAt: "2026-10-19T20:59:59Z" }, "2026-10-19T21:00:00Z"), false);
});
