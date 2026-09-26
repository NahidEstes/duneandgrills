import User from "../models/User.js";
import { STAFF_ROLES } from "../config/permissions.js";
import { validateNewPassword } from "./authController.js";
import { recordAuditLog } from "../services/auditLogService.js";
import Shift from "../models/Shift.js";
import { createPinLookup, hashStaffPin, normalizePin, parseDateKey } from "../services/attendanceService.js";
import { assertObjectId, ValidationError } from "../utils/inventoryValidation.js";

const fields = "name email phone role isActive deactivatedAt employeeId joiningDate attendanceEnabled attendanceEnabledAt defaultShift createdAt updatedAt";
const clean = (value) => typeof value === "string" ? value.trim() : "";

const parseEmployeeId = (value) => {
  const employeeId = clean(value).toUpperCase();
  if (employeeId && !/^[A-Z0-9-]{2,30}$/.test(employeeId)) throw new ValidationError("Employee ID may contain only letters, numbers and hyphens");
  return employeeId || undefined;
};

const validateShift = async (value) => {
  if (!value) return null;
  assertObjectId(value, "default shift");
  if (!(await Shift.exists({ _id: value, isActive: true }))) throw new ValidationError("Default shift was not found or is inactive");
  return value;
};

const parseJoiningDate = (value) => {
  if (!value) return null;
  return parseDateKey(value, "Joining date");
};

const staffById = (id) => User.findById(id).select(fields).populate("defaultShift", "name startTime endTime gracePeriodMinutes daysOfWeek isActive");

export const listStaff = async (req, res, next) => {
  try {
    const filter = { role: { $in: STAFF_ROLES } };
    if (req.query.active === "true") filter.isActive = { $ne: false };
    if (req.query.active === "false") filter.isActive = false;
    const rows = await User.find(filter).select(fields).populate("defaultShift", "name startTime endTime gracePeriodMinutes daysOfWeek isActive").sort({ name: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};

export const createStaff = async (req, res, next) => {
  try {
    const role = clean(req.body.role);
    const passwordError = validateNewPassword(req.body.password);
    if (!clean(req.body.name) || !clean(req.body.email) || !STAFF_ROLES.includes(role) || passwordError) {
      return res.status(400).json({ success: false, message: passwordError || "Valid name, email and staff role are required" });
    }
    const defaultShift = await validateShift(req.body.defaultShift);
    const attendanceEnabled = req.body.attendanceEnabled === true;
    if (attendanceEnabled && (!req.body.pin || !defaultShift)) throw new ValidationError("An active shift and secure PIN are required to enable attendance");
    const pin = req.body.pin ? normalizePin(req.body.pin) : null;
    const user = await User.create({
      name: clean(req.body.name),
      email: clean(req.body.email).toLowerCase(),
      phone: clean(req.body.phone),
      password: req.body.password,
      role,
      employeeId: parseEmployeeId(req.body.employeeId),
      joiningDate: parseJoiningDate(req.body.joiningDate),
      defaultShift,
      attendanceEnabled,
      attendanceEnabledAt: attendanceEnabled ? new Date() : null,
      ...(pin ? { pinHash: await hashStaffPin(pin), pinLookup: createPinLookup(pin) } : {}),
    });
    await recordAuditLog({ actor: req.user, action: "STAFF_CREATED", entityType: "User", entityId: user._id, entityLabel: user.email, after: { name: user.name, email: user.email, role: user.role, isActive: user.isActive } });
    res.status(201).json({ success: true, data: await staffById(user._id) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "Email, employee ID or attendance PIN is already in use" });
    next(error);
  }
};

export const updateStaff = async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "staff id");
    const user = await User.findOne({ _id: req.params.id, role: { $in: STAFF_ROLES } }).select("+sessionVersion +pinHash");
    if (!user) return res.status(404).json({ success: false, message: "Staff account was not found" });
    const before = { name: user.name, email: user.email, phone: user.phone, role: user.role, employeeId: user.employeeId, joiningDate: user.joiningDate, defaultShift: user.defaultShift, attendanceEnabled: user.attendanceEnabled, isActive: user.isActive };
    if (req.body.role !== undefined && !STAFF_ROLES.includes(req.body.role)) return res.status(400).json({ success: false, message: "Invalid staff role" });
    for (const key of ["name", "email", "phone", "role"]) if (req.body[key] !== undefined) user[key] = clean(req.body[key]);
    if ("employeeId" in req.body) user.employeeId = parseEmployeeId(req.body.employeeId);
    if ("joiningDate" in req.body) user.joiningDate = parseJoiningDate(req.body.joiningDate);
    if ("defaultShift" in req.body) user.defaultShift = await validateShift(req.body.defaultShift);
    if ("attendanceEnabled" in req.body) {
      const nextAttendanceEnabled = req.body.attendanceEnabled === true;
      if (nextAttendanceEnabled && !user.attendanceEnabled) user.attendanceEnabledAt = new Date();
      user.attendanceEnabled = nextAttendanceEnabled;
    }
    if (user.attendanceEnabled && (!user.pinHash || !user.defaultShift)) throw new ValidationError("Assign an active shift and PIN before enabling attendance");
    if (before.role !== user.role) user.sessionVersion += 1;
    await user.save();
    await recordAuditLog({ actor: req.user, action: "STAFF_UPDATED", entityType: "User", entityId: user._id, entityLabel: user.email, before, after: { name: user.name, email: user.email, phone: user.phone, role: user.role, employeeId: user.employeeId, joiningDate: user.joiningDate, defaultShift: user.defaultShift, attendanceEnabled: user.attendanceEnabled, isActive: user.isActive } });
    res.json({ success: true, data: await staffById(user._id) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "Email or employee ID is already in use" });
    next(error);
  }
};

export const setStaffActive = async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "staff id");
    const active = req.body.active === true;
    if (!active && String(req.params.id) === String(req.user._id)) return res.status(400).json({ success: false, message: "You cannot deactivate your own account" });
    const user = await User.findOne({ _id: req.params.id, role: { $in: STAFF_ROLES } }).select("+sessionVersion");
    if (!user) return res.status(404).json({ success: false, message: "Staff account was not found" });
    if (!active && user.role === "admin" && await User.countDocuments({ role: "admin", isActive: { $ne: false } }) <= 1) return res.status(409).json({ success: false, message: "The last active admin cannot be deactivated" });
    const before = { isActive: user.isActive };
    user.isActive = active;
    user.deactivatedAt = active ? null : new Date();
    user.sessionVersion += 1;
    await user.save();
    await recordAuditLog({ actor: req.user, action: active ? "STAFF_REACTIVATED" : "STAFF_DEACTIVATED", entityType: "User", entityId: user._id, entityLabel: user.email, before, after: { isActive: user.isActive } });
    res.json({ success: true, data: await staffById(user._id) });
  } catch (error) { next(error); }
};

export const resetStaffPassword = async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "staff id");
    const passwordError = validateNewPassword(req.body.password);
    if (passwordError) return res.status(400).json({ success: false, message: passwordError });
    const user = await User.findOne({ _id: req.params.id, role: { $in: STAFF_ROLES } }).select("+password +sessionVersion");
    if (!user) return res.status(404).json({ success: false, message: "Staff account was not found" });
    user.password = req.body.password;
    user.sessionVersion += 1;
    await user.save();
    await recordAuditLog({ actor: req.user, action: "STAFF_PASSWORD_RESET", entityType: "User", entityId: user._id, entityLabel: user.email, metadata: { sessionsRevoked: true } });
    res.json({ success: true, message: "Password updated and previous sessions revoked" });
  } catch (error) { next(error); }
};

export const resetStaffPin = async (req, res, next) => {
  try {
    assertObjectId(req.params.id, "staff id");
    const pin = normalizePin(req.body.pin);
    const user = await User.findOne({ _id: req.params.id, role: { $in: STAFF_ROLES } }).select("+pinHash +pinLookup");
    if (!user) return res.status(404).json({ success: false, message: "Staff account was not found" });
    user.pinHash = await hashStaffPin(pin);
    user.pinLookup = createPinLookup(pin);
    await user.save();
    await recordAuditLog({ actor: req.user, action: "STAFF_PIN_RESET", entityType: "User", entityId: user._id, entityLabel: user.email, metadata: { attendanceOnly: true } });
    res.json({ success: true, message: "Staff attendance PIN updated" });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "This PIN is already assigned to another staff member" });
    next(error);
  }
};
