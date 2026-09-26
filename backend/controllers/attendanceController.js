import Attendance from "../models/Attendance.js";
import AuditLog from "../models/AuditLog.js";
import LeaveRequest from "../models/LeaveRequest.js";
import Shift from "../models/Shift.js";
import User from "../models/User.js";
import { STAFF_ROLES } from "../config/permissions.js";
import { pickAuditFields, recordAuditLog } from "../services/auditLogService.js";
import {
  buildActivity,
  buildMonthlyReport,
  calculateLateMinutes,
  calculateOvertimeMinutes,
  calculateWorkedMinutes,
  clockInStaff,
  clockOutStaff,
  getAttendanceRows,
  getMonthRange,
  identifyStaffByPin,
  listDateKeys,
  parseDateKey,
  serializeAttendance,
  summarizeAttendance,
  toRiyadhDateKey,
  verifyClockToken,
} from "../services/attendanceService.js";
import { assertObjectId, escapeRegex, ValidationError } from "../utils/inventoryValidation.js";

const ATTENDANCE_FIELDS = ["staff", "date", "shift", "shiftName", "scheduledStart", "scheduledEnd", "clockIn", "clockOut", "totalWorkedMinutes", "lateMinutes", "overtimeMinutes", "status", "notes"];
const SHIFT_FIELDS = ["name", "startTime", "endTime", "gracePeriodMinutes", "daysOfWeek", "isActive"];
const LEAVE_FIELDS = ["staff", "type", "startDate", "endDate", "reason", "status", "reviewedBy", "reviewedAt"];
const LEAVE_TYPES = ["annual", "sick", "emergency", "day_off", "other"];
const LEAVE_STATUSES = ["pending", "approved", "rejected"];
const CORRECTION_STATUSES = ["checked_in", "on_time", "late", "absent", "on_leave", "completed"];
const clean = (value, max = 1000) => typeof value === "string" ? value.trim().slice(0, max) : "";

const parseDateTime = (value, label) => {
  if (!value) return null;
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new ValidationError(`${label} must be a valid date and time`);
  return result;
};

const serializeClockResult = ({ staff, attendance }) => ({
  staff: { name: staff.name },
  attendance: {
    date: attendance.date,
    clockIn: attendance.clockIn,
    clockOut: attendance.clockOut,
    totalWorkedMinutes: attendance.totalWorkedMinutes,
    lateMinutes: attendance.lateMinutes,
    overtimeMinutes: attendance.overtimeMinutes,
    displayStatus: serializeAttendance(attendance).displayStatus,
  },
});

export const identifyClockStaff = async (req, res, next) => {
  try {
    const result = await identifyStaffByPin(req.body.pin);
    res.json({
      success: true,
      data: {
        name: result.staff.name,
        nextAction: result.nextAction,
        clockToken: result.token,
        activeSince: result.openRecord?.clockIn || null,
      },
    });
  } catch (error) { next(error); }
};

export const clockIn = async (req, res, next) => {
  try {
    const result = await clockInStaff(verifyClockToken(req.body.clockToken));
    await recordAuditLog({ actorId: result.staff._id, action: "ATTENDANCE_CLOCKED_IN", entityType: "Attendance", entityId: result.attendance._id, entityLabel: result.staff.name, after: pickAuditFields(result.attendance, ATTENDANCE_FIELDS), metadata: { source: "staff_clock", correlationId: req.correlationId } });
    res.status(201).json({ success: true, data: serializeClockResult(result) });
  } catch (error) { next(error); }
};

export const clockOut = async (req, res, next) => {
  try {
    const result = await clockOutStaff(verifyClockToken(req.body.clockToken));
    await recordAuditLog({ actorId: result.staff._id, action: "ATTENDANCE_CLOCKED_OUT", entityType: "Attendance", entityId: result.attendance._id, entityLabel: result.staff.name, after: pickAuditFields(result.attendance, ATTENDANCE_FIELDS), metadata: { source: "staff_clock", correlationId: req.correlationId } });
    res.json({ success: true, data: serializeClockResult(result) });
  } catch (error) { next(error); }
};

export const listAttendance = async (req, res, next) => {
  try {
    const today = toRiyadhDateKey();
    const from = req.query.from || req.query.date || today;
    const to = req.query.to || from;
    listDateKeys(from, to);
    const allRows = await getAttendanceRows({ from, to });
    const query = clean(req.query.search, 100);
    const search = query ? new RegExp(escapeRegex(query), "i") : null;
    const data = allRows.filter((row) => {
      if (search && !search.test(`${row.staff?.name || ""} ${row.staff?.employeeId || ""}`)) return false;
      if (req.query.shift && req.query.shift !== "all" && String(row.shift?._id || row.shift) !== req.query.shift) return false;
      if (req.query.status && req.query.status !== "all" && row.displayStatus !== req.query.status) return false;
      return true;
    });
    const actualRecords = await Attendance.find({ date: { $gte: from, $lte: to } }).populate("staff", "name").sort({ clockIn: -1 }).lean();
    res.json({
      success: true,
      data,
      summary: summarizeAttendance(allRows),
      activity: buildActivity(actualRecords).slice(0, 30),
      range: { from, to, timezone: "Asia/Riyadh" },
    });
  } catch (error) { next(error); }
};

export const getAttendance = async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "attendance id");
    const row = await Attendance.findById(req.params.id).populate("staff", "name employeeId role").populate("shift", "name startTime endTime gracePeriodMinutes").lean();
    if (!row) return res.status(404).json({ success: false, message: "Attendance record not found" });
    const audit = await AuditLog.find({ entityType: "Attendance", entityId: row._id }).select("actorName actorRole action reason changedFields before after createdAt").sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: { ...serializeAttendance(row), audit } });
  } catch (error) { next(error); }
};

export const correctAttendance = async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "attendance id");
    const reason = clean(req.body.reason, 500);
    if (!reason) throw new ValidationError("A correction reason is required");
    const row = await Attendance.findById(req.params.id).populate("shift");
    if (!row) return res.status(404).json({ success: false, message: "Attendance record not found" });
    const before = pickAuditFields(row, ATTENDANCE_FIELDS);
    if ("clockIn" in req.body) row.clockIn = parseDateTime(req.body.clockIn, "Clock in");
    if ("clockOut" in req.body) row.clockOut = parseDateTime(req.body.clockOut, "Clock out");
    if (row.clockIn && row.clockOut && row.clockOut <= row.clockIn) throw new ValidationError("Clock out must be after clock in");
    if ("status" in req.body) {
      if (!CORRECTION_STATUSES.includes(req.body.status)) throw new ValidationError("Invalid attendance status");
      row.status = req.body.status;
    }
    if ("notes" in req.body) row.notes = clean(req.body.notes);
    if (["absent", "on_leave"].includes(row.status)) { row.clockIn = null; row.clockOut = null; }
    if (row.clockOut && !row.clockIn) throw new ValidationError("Clock in is required when clock out is provided");
    if (row.status === "completed" && (!row.clockIn || !row.clockOut)) throw new ValidationError("Completed attendance requires both clock in and clock out");
    if (row.status === "checked_in" && (!row.clockIn || row.clockOut)) throw new ValidationError("Checked-in attendance requires clock in without clock out");
    row.lateMinutes = row.clockIn ? calculateLateMinutes(row.clockIn, row.scheduledStart, row.shift?.gracePeriodMinutes || 0) : 0;
    if (row.clockIn && row.clockOut) {
      row.totalWorkedMinutes = calculateWorkedMinutes(row.clockIn, row.clockOut);
      row.overtimeMinutes = calculateOvertimeMinutes(row.clockOut, row.scheduledEnd);
    } else {
      row.totalWorkedMinutes = 0;
      row.overtimeMinutes = 0;
    }
    row.updatedBy = req.user._id;
    await row.save();
    const after = pickAuditFields(row, ATTENDANCE_FIELDS);
    await recordAuditLog({ actor: req.user, action: "ATTENDANCE_CORRECTED", entityType: "Attendance", entityId: row._id, entityLabel: `${row.shiftName} · ${row.date}`, before, after, reason, correlationId: req.correlationId });
    await row.populate("staff", "name employeeId role");
    res.json({ success: true, data: serializeAttendance(row) });
  } catch (error) { next(error); }
};

export const getMonthlyAttendance = async (req, res, next) => {
  try {
    const currentMonth = toRiyadhDateKey().slice(0, 7);
    const range = getMonthRange(req.query.month || currentMonth);
    if (range.to > toRiyadhDateKey()) range.to = toRiyadhDateKey();
    let data = buildMonthlyReport(await getAttendanceRows(range));
    if (req.query.staff && req.query.staff !== "all") data = data.filter((row) => String(row.staff?._id) === req.query.staff);
    res.json({ success: true, data, range, timezone: "Asia/Riyadh" });
  } catch (error) { next(error); }
};

const validateShiftPayload = (body, existing = null) => {
  const payload = {};
  if (!existing || "name" in body) {
    payload.name = clean(body.name, 80);
    if (!payload.name) throw new ValidationError("Shift name is required");
  }
  for (const key of ["startTime", "endTime"]) if (!existing || key in body) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body[key] || "")) throw new ValidationError(`${key} must use HH:mm`);
    payload[key] = body[key];
  }
  if (!existing || "gracePeriodMinutes" in body) {
    const grace = Number(body.gracePeriodMinutes ?? 5);
    if (!Number.isInteger(grace) || grace < 0 || grace > 120) throw new ValidationError("Grace period must be between 0 and 120 minutes");
    payload.gracePeriodMinutes = grace;
  }
  if (!existing || "daysOfWeek" in body) {
    const days = Array.isArray(body.daysOfWeek) ? [...new Set(body.daysOfWeek.map(Number))] : [];
    if (!days.length || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new ValidationError("Choose at least one valid working day");
    payload.daysOfWeek = days;
  }
  if ("isActive" in body) payload.isActive = Boolean(body.isActive);
  return payload;
};

export const listShifts = async (req, res, next) => {
  try {
    const filter = req.query.includeInactive === "true" ? {} : { isActive: true };
    res.json({ success: true, data: await Shift.find(filter).sort({ name: 1 }).lean() });
  } catch (error) { next(error); }
};

export const createShift = async (req, res, next) => {
  try {
    const shift = await Shift.create({ ...validateShiftPayload(req.body), createdBy: req.user._id, updatedBy: req.user._id });
    await recordAuditLog({ actor: req.user, action: "SHIFT_CREATED", entityType: "Shift", entityId: shift._id, entityLabel: shift.name, after: pickAuditFields(shift, SHIFT_FIELDS) });
    res.status(201).json({ success: true, data: shift });
  } catch (error) { if (error?.code === 11000) return res.status(409).json({ success: false, message: "A shift with this name already exists" }); next(error); }
};

export const updateShift = async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "shift id");
    const shift = await Shift.findById(req.params.id);
    if (!shift) return res.status(404).json({ success: false, message: "Shift not found" });
    const before = pickAuditFields(shift, SHIFT_FIELDS);
    shift.set({ ...validateShiftPayload(req.body, shift), updatedBy: req.user._id });
    await shift.save();
    await recordAuditLog({ actor: req.user, action: "SHIFT_UPDATED", entityType: "Shift", entityId: shift._id, entityLabel: shift.name, before, after: pickAuditFields(shift, SHIFT_FIELDS) });
    res.json({ success: true, data: shift });
  } catch (error) { if (error?.code === 11000) return res.status(409).json({ success: false, message: "A shift with this name already exists" }); next(error); }
};

export const archiveShift = async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "shift id");
    const shift = await Shift.findById(req.params.id);
    if (!shift) return res.status(404).json({ success: false, message: "Shift not found" });
    const assignedStaff = await User.countDocuments({ defaultShift: shift._id, isActive: { $ne: false }, attendanceEnabled: true });
    if (assignedStaff > 0) return res.status(409).json({ success: false, message: `Reassign or disable attendance for ${assignedStaff} active staff member${assignedStaff === 1 ? "" : "s"} before archiving this shift` });
    const before = pickAuditFields(shift, SHIFT_FIELDS);
    shift.isActive = false;
    shift.updatedBy = req.user._id;
    await shift.save();
    await recordAuditLog({ actor: req.user, action: "SHIFT_ARCHIVED", entityType: "Shift", entityId: shift._id, entityLabel: shift.name, before, after: pickAuditFields(shift, SHIFT_FIELDS) });
    res.json({ success: true, message: "Shift archived. Historical attendance was preserved." });
  } catch (error) { next(error); }
};

const validateLeavePayload = (body, existing = null) => {
  const payload = {};
  if (!existing || "staff" in body) { assertObjectId(body.staff, "staff id"); payload.staff = body.staff; }
  if (!existing || "type" in body) { if (!LEAVE_TYPES.includes(body.type)) throw new ValidationError("Invalid leave type"); payload.type = body.type; }
  if (!existing || "startDate" in body) { parseDateKey(body.startDate, "Start date"); payload.startDate = body.startDate; }
  if (!existing || "endDate" in body) { parseDateKey(body.endDate, "End date"); payload.endDate = body.endDate; }
  const start = payload.startDate || existing?.startDate;
  const end = payload.endDate || existing?.endDate;
  if (start > end) throw new ValidationError("Leave end date must be on or after the start date");
  if ("reason" in body || !existing) payload.reason = clean(body.reason);
  if ("status" in body) { if (!LEAVE_STATUSES.includes(body.status)) throw new ValidationError("Invalid leave status"); payload.status = body.status; }
  return payload;
};

export const listLeaves = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status && req.query.status !== "all") filter.status = req.query.status;
    if (req.query.staff && req.query.staff !== "all") { assertObjectId(req.query.staff, "staff id"); filter.staff = req.query.staff; }
    if (req.query.from || req.query.to) {
      const from = req.query.from || req.query.to;
      const to = req.query.to || req.query.from;
      parseDateKey(from); parseDateKey(to);
      filter.startDate = { $lte: to }; filter.endDate = { $gte: from };
    }
    const data = await LeaveRequest.find(filter).populate("staff", "name employeeId role").populate("reviewedBy", "name role").sort({ startDate: -1, createdAt: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

export const createLeave = async (req, res, next) => {
  try {
    const payload = validateLeavePayload(req.body);
    const staff = await User.findOne({ _id: payload.staff, role: { $in: STAFF_ROLES } }).select("name");
    if (!staff) throw new ValidationError("Staff member not found");
    if (payload.status === "approved" && await LeaveRequest.exists({ staff: payload.staff, status: "approved", startDate: { $lte: payload.endDate }, endDate: { $gte: payload.startDate } })) throw new ValidationError("An approved leave already overlaps these dates");
    const leave = await LeaveRequest.create({ ...payload, createdBy: req.user._id, updatedBy: req.user._id, ...(payload.status && payload.status !== "pending" ? { reviewedBy: req.user._id, reviewedAt: new Date() } : {}) });
    await recordAuditLog({ actor: req.user, action: "LEAVE_CREATED", entityType: "LeaveRequest", entityId: leave._id, entityLabel: staff.name, after: pickAuditFields(leave, LEAVE_FIELDS) });
    await leave.populate("staff", "name employeeId role");
    res.status(201).json({ success: true, data: leave });
  } catch (error) { next(error); }
};

export const updateLeave = async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "leave id");
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) return res.status(404).json({ success: false, message: "Leave request not found" });
    const before = pickAuditFields(leave, LEAVE_FIELDS);
    const payload = validateLeavePayload(req.body, leave);
    const nextStatus = payload.status || leave.status;
    if (nextStatus === "approved" && await LeaveRequest.exists({ _id: { $ne: leave._id }, staff: payload.staff || leave.staff, status: "approved", startDate: { $lte: payload.endDate || leave.endDate }, endDate: { $gte: payload.startDate || leave.startDate } })) throw new ValidationError("An approved leave already overlaps these dates");
    leave.set({ ...payload, updatedBy: req.user._id });
    if (payload.status && payload.status !== before.status) { leave.reviewedBy = req.user._id; leave.reviewedAt = new Date(); }
    await leave.save();
    await recordAuditLog({ actor: req.user, action: "LEAVE_UPDATED", entityType: "LeaveRequest", entityId: leave._id, entityLabel: String(leave.staff), before, after: pickAuditFields(leave, LEAVE_FIELDS) });
    await leave.populate("staff", "name employeeId role");
    res.json({ success: true, data: leave });
  } catch (error) { next(error); }
};
