import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import {
  addDateKeyDays,
  buildMonthlyReport,
  calculateLateMinutes,
  calculateOvertimeMinutes,
  calculateWorkedMinutes,
  createPinLookup,
  hashStaffPin,
  isShiftScheduled,
  listDateKeys,
  resolveUnrecordedStatus,
  shiftWindow,
  summarizeAttendance,
  toRiyadhDateKey,
} from "../services/attendanceService.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";

test("Riyadh attendance date keys stay correct around the UTC boundary", () => {
  assert.equal(toRiyadhDateKey(new Date("2026-09-25T20:59:59.000Z")), "2026-09-25");
  assert.equal(toRiyadhDateKey(new Date("2026-09-25T21:00:00.000Z")), "2026-09-26");
  assert.equal(addDateKeyDays("2026-12-31", 1), "2027-01-01");
  assert.deepEqual(listDateKeys("2026-09-25", "2026-09-27"), ["2026-09-25", "2026-09-26", "2026-09-27"]);
});

test("shift calculations apply grace, overnight end time, work and overtime", () => {
  const shift = { startTime: "21:00", endTime: "05:00", gracePeriodMinutes: 5, daysOfWeek: [6], isActive: true };
  const { scheduledStart, scheduledEnd } = shiftWindow("2026-09-26", shift);
  assert.equal(scheduledStart.toISOString(), "2026-09-26T18:00:00.000Z");
  assert.equal(scheduledEnd.toISOString(), "2026-09-27T02:00:00.000Z");
  assert.equal(isShiftScheduled(shift, "2026-09-26"), true);
  assert.equal(calculateLateMinutes(new Date("2026-09-26T18:18:00.000Z"), scheduledStart, 5), 13);
  assert.equal(calculateWorkedMinutes(new Date("2026-09-26T18:00:00.000Z"), new Date("2026-09-27T02:30:00.000Z")), 510);
  assert.equal(calculateOvertimeMinutes(new Date("2026-09-27T02:30:00.000Z"), scheduledEnd), 30);
});

test("absence is not reported before the shift grace window and approved leave wins", () => {
  const scheduledStart = new Date("2026-09-26T06:00:00.000Z");
  assert.equal(resolveUnrecordedStatus({ now: new Date("2026-09-26T06:04:00.000Z"), scheduledStart, gracePeriodMinutes: 5 }), "scheduled");
  assert.equal(resolveUnrecordedStatus({ now: new Date("2026-09-26T06:05:00.000Z"), scheduledStart, gracePeriodMinutes: 5 }), "absent");
  assert.equal(resolveUnrecordedStatus({ hasApprovedLeave: true, now: new Date("2026-09-26T12:00:00.000Z"), scheduledStart }), "on_leave");
});

test("staff PINs are lookup-safe, unique by value and stored with bcrypt", async () => {
  const previous = process.env.ATTENDANCE_PIN_SECRET;
  process.env.ATTENDANCE_PIN_SECRET = "test-only-secret";
  try {
    assert.equal(createPinLookup("1234"), createPinLookup("1234"));
    assert.notEqual(createPinLookup("1234"), createPinLookup("4321"));
    const hash = await hashStaffPin("1234");
    assert.notEqual(hash, "1234");
    assert.equal(await bcrypt.compare("1234", hash), true);
    assert.throws(() => createPinLookup("12ab"), /4 to 6 digits/);
  } finally {
    process.env.ATTENDANCE_PIN_SECRET = previous;
  }
});

test("summary and monthly reporting keep lateness separate without losing presence", () => {
  const staff = { _id: "staff-1", name: "Ahmed" };
  const rows = [
    { staff, displayStatus: "on_time", totalWorkedMinutes: 480, lateMinutes: 0, overtimeMinutes: 10 },
    { staff, displayStatus: "late", totalWorkedMinutes: 450, lateMinutes: 13, overtimeMinutes: 0 },
    { staff, displayStatus: "absent" },
    { staff, displayStatus: "on_leave" },
  ];
  assert.deepEqual(summarizeAttendance(rows), { present: 1, late: 1, absent: 1, onLeave: 1 });
  const [report] = buildMonthlyReport(rows);
  assert.deepEqual({ present: report.daysPresent, late: report.daysLate, absent: report.daysAbsent, leave: report.leaveDays }, { present: 2, late: 1, absent: 1, leave: 1 });
  assert.equal(report.totalWorkedMinutes, 930);
  assert.equal(report.totalLateMinutes, 13);
});

test("attendance capabilities allow manager read access but reserve corrections for admin", () => {
  assert.equal(hasCapability("manager", CAPABILITIES.ATTENDANCE_READ), true);
  assert.equal(hasCapability("manager", CAPABILITIES.ATTENDANCE_MANAGE), false);
  assert.equal(hasCapability("admin", CAPABILITIES.ATTENDANCE_MANAGE), true);
  assert.equal(hasCapability("cashier", CAPABILITIES.ATTENDANCE_READ), false);
});
