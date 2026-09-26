import assert from "node:assert/strict";
import test from "node:test";
import { fromRiyadhDateTimeInput, previousDateKey, statusLabel, toRiyadhDateTimeInput } from "../src/components/admin/staff/attendanceUtils.js";

test("attendance UI formats server timestamps explicitly in Riyadh time", () => {
  assert.equal(toRiyadhDateTimeInput("2026-09-26T06:00:00.000Z"), "2026-09-26T09:00");
  assert.equal(fromRiyadhDateTimeInput("2026-09-26T09:05"), "2026-09-26T09:05:00+03:00");
});

test("attendance status and date helpers cover admin filters", () => {
  assert.equal(statusLabel("on_leave"), "On Leave");
  assert.equal(previousDateKey("2026-03-01"), "2026-02-28");
});
