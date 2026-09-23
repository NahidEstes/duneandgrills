import User from "../models/User.js";
import { STAFF_ROLES } from "../config/permissions.js";
import { validateNewPassword } from "./authController.js";
import { recordAuditLog } from "../services/auditLogService.js";

const fields = "name email phone role isActive deactivatedAt createdAt updatedAt";
const clean = (value) => typeof value === "string" ? value.trim() : "";

export const listStaff = async (req, res, next) => {
  try {
    const filter = { role: { $in: STAFF_ROLES } };
    if (req.query.active === "true") filter.isActive = { $ne: false };
    if (req.query.active === "false") filter.isActive = false;
    const rows = await User.find(filter).select(fields).sort({ name: 1 }).lean();
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
    const user = await User.create({ name: clean(req.body.name), email: clean(req.body.email).toLowerCase(), phone: clean(req.body.phone), password: req.body.password, role });
    await recordAuditLog({ actor: req.user, action: "STAFF_CREATED", entityType: "User", entityId: user._id, entityLabel: user.email, after: { name: user.name, email: user.email, role: user.role, isActive: user.isActive } });
    res.status(201).json({ success: true, data: await User.findById(user._id).select(fields) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "That email is already in use" });
    next(error);
  }
};

export const updateStaff = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.params.id, role: { $in: STAFF_ROLES } }).select("+sessionVersion");
    if (!user) return res.status(404).json({ success: false, message: "Staff account was not found" });
    const before = { name: user.name, email: user.email, phone: user.phone, role: user.role, isActive: user.isActive };
    if (req.body.role !== undefined && !STAFF_ROLES.includes(req.body.role)) return res.status(400).json({ success: false, message: "Invalid staff role" });
    for (const key of ["name", "email", "phone", "role"]) if (req.body[key] !== undefined) user[key] = clean(req.body[key]);
    if (before.role !== user.role) user.sessionVersion += 1;
    await user.save();
    await recordAuditLog({ actor: req.user, action: "STAFF_UPDATED", entityType: "User", entityId: user._id, entityLabel: user.email, before, after: { name: user.name, email: user.email, phone: user.phone, role: user.role, isActive: user.isActive } });
    res.json({ success: true, data: await User.findById(user._id).select(fields) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "That email is already in use" });
    next(error);
  }
};

export const setStaffActive = async (req, res, next) => {
  try {
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
    res.json({ success: true, data: await User.findById(user._id).select(fields) });
  } catch (error) { next(error); }
};

export const resetStaffPassword = async (req, res, next) => {
  try {
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

