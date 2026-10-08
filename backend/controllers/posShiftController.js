import PosShift from "../models/PosShift.js";
import { getEffectiveRestaurantSettings } from "../services/restaurantSettingsService.js";
import { addCashMovement, closePosShift, findOpenShift, openPosShift, reopenPosShift, summarizePosShift } from "../services/posShiftService.js";
import { escapeRegex, parsePagination } from "../utils/inventoryValidation.js";

const populateShift = (query) => query.populate("cashier openedBy closedBy managerApprovedBy", "name role");

export const getShiftConfig = async (_req, res, next) => {
  try {
    const settings = await getEffectiveRestaurantSettings();
    res.json({ success: true, data: settings.posShifts });
  } catch (error) { next(error); }
};

export const currentShift = async (req, res, next) => {
  try {
    const settings = await getEffectiveRestaurantSettings();
    const shift = await findOpenShift({ cashier: req.user._id, terminal: req.query.terminal });
    if (!shift) return res.json({ success: true, data: null, config: settings.posShifts });
    await shift.populate("cashier openedBy", "name role");
    const includeExpected = !settings.posShifts.blindClose || ["admin", "manager"].includes(req.user.role);
    res.json({ success: true, data: await summarizePosShift(shift, { includeExpected }), config: settings.posShifts });
  } catch (error) { next(error); }
};

export const openShift = async (req, res, next) => {
  try {
    const settings = await getEffectiveRestaurantSettings();
    if (!settings.posShifts.enabled) return res.status(409).json({ success: false, message: "POS shifts are not enabled in Restaurant Settings" });
    const shift = await openPosShift({ actor: req.user, openingCash: req.body.openingCash, openingNote: req.body.openingNote, terminal: req.body.terminal, correlationId: req.correlationId });
    await shift.populate("cashier openedBy", "name role");
    res.status(201).json({ success: true, data: await summarizePosShift(shift, { includeExpected: !settings.posShifts.blindClose || ["admin", "manager"].includes(req.user.role) }) });
  } catch (error) { next(error); }
};

export const postCashMovement = async (req, res, next) => {
  try {
    if (!req.body.idempotencyKey) return res.status(400).json({ success: false, message: "Cash movement request identifier is required" });
    const movement = await addCashMovement({ shiftId: req.params.shiftId, type: req.body.type, amount: req.body.amount, reason: req.body.reason, direction: req.body.direction, idempotencyKey: req.body.idempotencyKey, actor: req.user, correlationId: req.correlationId });
    res.status(201).json({ success: true, data: movement });
  } catch (error) { next(error); }
};

export const closeShift = async (req, res, next) => {
  try {
    const settings = await getEffectiveRestaurantSettings();
    const result = await closePosShift({ shiftId: req.params.shiftId, countedCash: req.body.countedCash, note: req.body.note, managerId: req.body.managerId, managerPin: req.body.managerPin, acknowledgeOpenSales: req.body.acknowledgeOpenSales === true, idempotencyKey: req.body.idempotencyKey, actor: req.user, settings: settings.posShifts, correlationId: req.correlationId });
    await result.shift.populate("cashier openedBy closedBy managerApprovedBy", "name role");
    res.json({ success: true, duplicate: result.duplicate, data: result.shift });
  } catch (error) { next(error); }
};

export const listShifts = async (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const { page, limit, skip } = parsePagination(req.query, 25);
    const filter = {};
    if (req.query.search?.trim()) filter.shiftNumber = new RegExp(escapeRegex(req.query.search.trim().slice(0, 120)), "i");
    if (req.query.status) filter.status = req.query.status;
    if (req.query.state === "open") { filter.isOpen = true; filter.status = { $in: ["open", "closing", "reopened"] }; }
    if (req.query.state === "closed") { filter.isOpen = false; filter.status = "closed"; }
    if (req.query.cashier) filter.cashier = req.query.cashier;
    if (req.query.terminal) filter.terminal = String(req.query.terminal).trim().toUpperCase();
    const [rows, total] = await Promise.all([
      populateShift(PosShift.find(filter).sort(req.query.state === "closed" ? { closedAt: -1, _id: -1 } : { openedAt: -1, _id: -1 }).skip(skip).limit(limit)).lean(),
      PosShift.countDocuments(filter),
    ]);
    res.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) }, currency: "SAR" });
  } catch (error) { next(error); }
};

export const getShift = async (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const shift = await populateShift(PosShift.findById(req.params.shiftId));
    if (!shift) return res.status(404).json({ success: false, message: "Shift not found" });
    if (String(shift.cashier?._id || shift.cashier) !== String(req.user._id) && !["admin", "manager"].includes(req.user.role)) return res.status(403).json({ success: false, message: "Not authorized to view this shift" });
    const settings = await getEffectiveRestaurantSettings();
    const includeExpected = !shift.isOpen || !settings.posShifts.blindClose || ["admin", "manager"].includes(req.user.role);
    res.json({ success: true, data: await summarizePosShift(shift, { includeExpected }) });
  } catch (error) { next(error); }
};

export const reopenShift = async (req, res, next) => {
  try {
    const shift = await reopenPosShift({ shiftId: req.params.shiftId, reason: req.body.reason, actor: req.user, correlationId: req.correlationId });
    await shift.populate("cashier openedBy closedBy managerApprovedBy", "name role");
    res.json({ success: true, data: shift });
  } catch (error) { next(error); }
};
