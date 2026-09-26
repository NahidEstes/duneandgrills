import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Attendance from "../models/Attendance.js";
import LeaveRequest from "../models/LeaveRequest.js";
import Shift from "../models/Shift.js";
import User from "../models/User.js";
import { STAFF_ROLES } from "../config/permissions.js";
import { ValidationError } from "../utils/inventoryValidation.js";

export const ATTENDANCE_TIMEZONE = "Asia/Riyadh";
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const attendanceError = (message, status = 400) => {
  const error = new ValidationError(message);
  error.status = status;
  return error;
};

export const toRiyadhDateKey = (date = new Date()) => new Date(date.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);

export const parseDateKey = (value, label = "Date") => {
  if (!DATE_PATTERN.test(value || "")) throw new ValidationError(`${label} must use YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00+03:00`);
  if (Number.isNaN(date.getTime()) || toRiyadhDateKey(date) !== value) throw new ValidationError(`${label} is invalid`);
  return date;
};

export const addDateKeyDays = (value, amount) => toRiyadhDateKey(new Date(parseDateKey(value).getTime() + Number(amount) * DAY_MS));

export const listDateKeys = (from, to, maximum = 31) => {
  const start = parseDateKey(from, "From date");
  const end = parseDateKey(to, "To date");
  if (start > end) throw new ValidationError("From date must be before or equal to To date");
  const count = Math.round((end - start) / DAY_MS) + 1;
  if (count > maximum) throw new ValidationError(`Date range cannot exceed ${maximum} days`);
  return Array.from({ length: count }, (_, index) => addDateKeyDays(from, index));
};

export const riyadhDateTime = (dateKey, time) => {
  parseDateKey(dateKey);
  if (!TIME_PATTERN.test(time || "")) throw new ValidationError("Shift time must use HH:mm");
  return new Date(`${dateKey}T${time}:00+03:00`);
};

export const shiftWindow = (dateKey, shift) => {
  const scheduledStart = riyadhDateTime(dateKey, shift.startTime);
  let scheduledEnd = riyadhDateTime(dateKey, shift.endTime);
  if (scheduledEnd <= scheduledStart) scheduledEnd = new Date(scheduledEnd.getTime() + DAY_MS);
  return { scheduledStart, scheduledEnd };
};

export const calculateLateMinutes = (clockIn, scheduledStart, gracePeriodMinutes = 0) => Math.max(
  0,
  Math.floor((new Date(clockIn).getTime() - new Date(scheduledStart).getTime()) / 60_000) - Number(gracePeriodMinutes || 0)
);

export const calculateWorkedMinutes = (clockIn, clockOut) => Math.max(0, Math.floor((new Date(clockOut) - new Date(clockIn)) / 60_000));
export const calculateOvertimeMinutes = (clockOut, scheduledEnd) => Math.max(0, Math.floor((new Date(clockOut) - new Date(scheduledEnd)) / 60_000));
export const resolveUnrecordedStatus = ({ hasApprovedLeave = false, now = new Date(), scheduledStart, gracePeriodMinutes = 0 }) => {
  if (hasApprovedLeave) return "on_leave";
  return new Date(now) < new Date(new Date(scheduledStart).getTime() + Number(gracePeriodMinutes || 0) * 60_000) ? "scheduled" : "absent";
};

export const isShiftScheduled = (shift, dateKey) => {
  parseDateKey(dateKey);
  const dayOfWeek = new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
  return shift?.isActive !== false && (shift?.daysOfWeek || []).includes(dayOfWeek);
};

export const normalizePin = (pin) => {
  const value = String(pin || "").trim();
  if (!/^\d{4,6}$/.test(value)) throw new ValidationError("PIN must contain 4 to 6 digits");
  return value;
};

const pinSecret = () => {
  const secret = process.env.ATTENDANCE_PIN_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("ATTENDANCE_PIN_SECRET or JWT_SECRET must be configured");
  return secret;
};
export const createPinLookup = (pin) => crypto.createHmac("sha256", pinSecret()).update(normalizePin(pin)).digest("hex");
export const hashStaffPin = (pin) => bcrypt.hash(normalizePin(pin), 12);

export const createClockToken = (staffId) => jwt.sign(
  { sub: String(staffId), purpose: "staff-clock" },
  process.env.JWT_SECRET,
  { expiresIn: "2m" }
);

export const verifyClockToken = (token) => {
  try {
    const payload = jwt.verify(String(token || ""), process.env.JWT_SECRET);
    if (payload.purpose !== "staff-clock" || !payload.sub) throw new Error("Invalid purpose");
    return payload.sub;
  } catch {
    throw attendanceError("Clock session expired. Enter your PIN again.", 401);
  }
};

const effectiveStatus = (row) => {
  if (row.synthetic) return row.status;
  if (Number(row.lateMinutes || 0) > 0) return "late";
  if (row.clockIn && !row.clockOut) return "checked_in";
  if (row.clockOut) return "on_time";
  return row.status;
};

export const serializeAttendance = (row) => {
  const source = typeof row?.toObject === "function" ? row.toObject() : row;
  return { ...source, displayStatus: effectiveStatus(source) };
};

export const identifyStaffByPin = async (pin, now = new Date()) => {
  const normalized = normalizePin(pin);
  const staff = await User.findOne({
    pinLookup: createPinLookup(normalized),
    role: { $in: STAFF_ROLES },
    isActive: { $ne: false },
    attendanceEnabled: true,
  }).select("name role attendanceEnabled defaultShift +pinHash").populate("defaultShift");
  if (!staff || !staff.pinHash || !(await bcrypt.compare(normalized, staff.pinHash))) throw attendanceError("Invalid PIN", 401);
  const date = toRiyadhDateKey(now);
  const openRecord = await Attendance.findOne({ staff: staff._id, clockIn: { $ne: null }, clockOut: null }).sort({ clockIn: -1 }).lean();
  if (openRecord) {
    return { staff, date, nextAction: "clock_out", openRecord, token: createClockToken(staff._id) };
  }
  if (!staff.defaultShift || staff.defaultShift.isActive === false) throw attendanceError("No active shift is assigned to this staff member", 409);
  if (!isShiftScheduled(staff.defaultShift, date)) throw attendanceError("No shift is scheduled for today", 409);
  const approvedLeave = await LeaveRequest.exists({ staff: staff._id, status: "approved", startDate: { $lte: date }, endDate: { $gte: date } });
  if (approvedLeave) throw attendanceError("You are marked on leave today. Contact a manager if this is incorrect.", 409);
  return {
    staff,
    date,
    nextAction: "clock_in",
    openRecord: null,
    token: createClockToken(staff._id),
  };
};

export const clockInStaff = async (staffId, now = new Date()) => {
  const staff = await User.findOne({ _id: staffId, role: { $in: STAFF_ROLES }, isActive: { $ne: false }, attendanceEnabled: true }).populate("defaultShift");
  if (!staff) throw attendanceError("Staff clock access is unavailable", 401);
  const shift = staff.defaultShift;
  const date = toRiyadhDateKey(now);
  if (!shift || !isShiftScheduled(shift, date)) throw attendanceError("No active shift is scheduled for today", 409);
  if (await LeaveRequest.exists({ staff: staff._id, status: "approved", startDate: { $lte: date }, endDate: { $gte: date } })) throw attendanceError("You are marked on leave today", 409);
  if (await Attendance.exists({ staff: staff._id, clockIn: { $ne: null }, clockOut: null })) throw attendanceError("You are already clocked in", 409);
  const { scheduledStart, scheduledEnd } = shiftWindow(date, shift);
  const lateMinutes = calculateLateMinutes(now, scheduledStart, shift.gracePeriodMinutes);
  try {
    const attendance = await Attendance.create({
      staff: staff._id,
      date,
      shift: shift._id,
      shiftName: shift.name,
      scheduledStart,
      scheduledEnd,
      clockIn: now,
      lateMinutes,
      status: "checked_in",
    });
    return { staff, attendance };
  } catch (error) {
    if (error?.code === 11000) throw attendanceError("Attendance has already been recorded for this shift", 409);
    throw error;
  }
};

export const clockOutStaff = async (staffId, now = new Date()) => {
  const staff = await User.findOne({ _id: staffId, role: { $in: STAFF_ROLES }, isActive: { $ne: false }, attendanceEnabled: true });
  if (!staff) throw attendanceError("Staff clock access is unavailable", 401);
  const openAttendance = await Attendance.findOne({ staff: staff._id, clockIn: { $ne: null }, clockOut: null }).sort({ clockIn: -1 }).lean();
  if (!openAttendance) throw attendanceError("No active clock-in was found", 409);
  if (now <= openAttendance.clockIn) throw attendanceError("Clock-out time must be after clock-in time", 409);
  const attendance = await Attendance.findOneAndUpdate(
    { _id: openAttendance._id, clockOut: null },
    { $set: {
      clockOut: now,
      totalWorkedMinutes: calculateWorkedMinutes(openAttendance.clockIn, now),
      overtimeMinutes: calculateOvertimeMinutes(now, openAttendance.scheduledEnd),
      status: "completed",
    } },
    { new: true, runValidators: true }
  );
  if (!attendance) throw attendanceError("This attendance session was already clocked out", 409);
  return { staff, attendance };
};

const syntheticRow = ({ staff, shift, date, leave, now }) => {
  const { scheduledStart, scheduledEnd } = shiftWindow(date, shift);
  const status = resolveUnrecordedStatus({ hasApprovedLeave: Boolean(leave), now, scheduledStart, gracePeriodMinutes: shift.gracePeriodMinutes });
  return {
    _id: null,
    synthetic: true,
    staff: { _id: staff._id, name: staff.name, employeeId: staff.employeeId, role: staff.role },
    date,
    shift: { _id: shift._id, name: shift.name, startTime: shift.startTime, endTime: shift.endTime },
    shiftName: shift.name,
    scheduledStart,
    scheduledEnd,
    clockIn: null,
    clockOut: null,
    totalWorkedMinutes: 0,
    lateMinutes: 0,
    overtimeMinutes: 0,
    notes: leave?.reason || "",
    status,
    displayStatus: status,
  };
};

export const getAttendanceRows = async ({ from, to = from, now = new Date() }) => {
  const dates = listDateKeys(from, to);
  const [staffRows, records, leaves] = await Promise.all([
    User.find({ role: { $in: STAFF_ROLES }, isActive: { $ne: false }, attendanceEnabled: true, defaultShift: { $ne: null } })
      .select("name employeeId role joiningDate attendanceEnabledAt defaultShift createdAt").populate("defaultShift").sort({ name: 1 }).lean(),
    Attendance.find({ date: { $in: dates } }).populate("staff", "name employeeId role").populate("shift", "name startTime endTime gracePeriodMinutes daysOfWeek isActive").lean(),
    LeaveRequest.find({ status: "approved", startDate: { $lte: to }, endDate: { $gte: from } }).lean(),
  ]);
  const recordMap = new Map(records.map((row) => [`${row.staff?._id}:${row.date}`, row]));
  const consumedRecordIds = new Set();
  const rows = [];
  for (const date of dates) {
    for (const staff of staffRows) {
      const shift = staff.defaultShift;
      if (!shift || !isShiftScheduled(shift, date)) continue;
      const employmentStart = [staff.joiningDate, staff.attendanceEnabledAt, staff.createdAt].filter(Boolean).sort((left, right) => new Date(right) - new Date(left))[0];
      if (employmentStart && date < toRiyadhDateKey(new Date(employmentStart))) continue;
      const existing = recordMap.get(`${staff._id}:${date}`);
      if (existing) { rows.push(serializeAttendance(existing)); consumedRecordIds.add(String(existing._id)); }
      else {
        const leave = leaves.find((entry) => String(entry.staff) === String(staff._id) && entry.startDate <= date && entry.endDate >= date);
        rows.push(syntheticRow({ staff, shift, date, leave, now }));
      }
    }
  }
  for (const record of records) {
    if (!consumedRecordIds.has(String(record._id))) rows.push(serializeAttendance(record));
  }
  rows.sort((left, right) => left.date === right.date
    ? String(left.staff?.name || "").localeCompare(String(right.staff?.name || ""))
    : right.date.localeCompare(left.date));
  return rows;
};

export const summarizeAttendance = (rows) => rows.reduce((summary, row) => {
  const status = row.displayStatus || effectiveStatus(row);
  if (status === "late") summary.late += 1;
  else if (status === "absent") summary.absent += 1;
  else if (status === "on_leave") summary.onLeave += 1;
  else if (["on_time", "checked_in", "completed"].includes(status)) summary.present += 1;
  return summary;
}, { present: 0, late: 0, absent: 0, onLeave: 0 });

export const buildActivity = (records) => records.flatMap((row) => {
  const staffName = row.staff?.name || "Staff member";
  const events = [];
  if (row.clockIn) events.push({ id: `${row._id}-in`, type: Number(row.lateMinutes) > 0 ? "late" : "clock_in", staffName, at: row.clockIn, lateMinutes: row.lateMinutes });
  if (row.clockOut) events.push({ id: `${row._id}-out`, type: "clock_out", staffName, at: row.clockOut });
  return events;
}).sort((left, right) => new Date(right.at) - new Date(left.at));

export const buildMonthlyReport = (rows) => {
  const byStaff = new Map();
  for (const row of rows) {
    const staff = row.staff || {};
    const key = String(staff._id || "");
    if (!byStaff.has(key)) byStaff.set(key, { staff, daysPresent: 0, daysLate: 0, daysAbsent: 0, leaveDays: 0, totalWorkedMinutes: 0, totalLateMinutes: 0, overtimeMinutes: 0 });
    const report = byStaff.get(key);
    const status = row.displayStatus || effectiveStatus(row);
    if (status === "late") { report.daysPresent += 1; report.daysLate += 1; }
    else if (["on_time", "checked_in", "completed"].includes(status)) report.daysPresent += 1;
    else if (status === "absent") report.daysAbsent += 1;
    else if (status === "on_leave") report.leaveDays += 1;
    report.totalWorkedMinutes += Number(row.totalWorkedMinutes || 0);
    report.totalLateMinutes += Number(row.lateMinutes || 0);
    report.overtimeMinutes += Number(row.overtimeMinutes || 0);
  }
  return [...byStaff.values()].sort((a, b) => String(a.staff?.name || "").localeCompare(String(b.staff?.name || "")));
};

export const getMonthRange = (month) => {
  if (!/^\d{4}-\d{2}$/.test(month || "")) throw new ValidationError("Month must use YYYY-MM");
  const first = `${month}-01`;
  parseDateKey(first, "Month");
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: first, to: `${month}-${String(lastDay).padStart(2, "0")}` };
};

export const models = { Attendance, LeaveRequest, Shift, User };
