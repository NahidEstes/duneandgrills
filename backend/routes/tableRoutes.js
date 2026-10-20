import express from "express";
import mongoose from "mongoose";
import DiningTable from "../models/DiningTable.js";
import { protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";
import { rateLimit } from "../middleware/security.js";
import { resolveDiningTable } from "../services/tableOrderingService.js";
import { orderText, OrderEngineError } from "../config/orderContract.js";
import { recordAuditLog } from "../services/auditLogService.js";

const router = express.Router();
const action = handler => async (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  try { await handler(req, res); } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "This table code already exists" });
    if (["ValidationError", "CastError"].includes(error.name)) error.status = 400;
    next(error);
  }
};
router.post("/resolve", rateLimit({ windowMs: 60_000, max: 60, keyPrefix: "table-resolve" }), action(async (req, res) => {
  res.json({ success: true, data: await resolveDiningTable(req.body?.token) });
}));
router.use(protect, requireCapability(CAPABILITIES.SETTINGS_MANAGE));
router.get("/", action(async (_req, res) => res.json({ success: true, data: await DiningTable.find().sort({ code: 1 }).limit(300) })));
const values = body => {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new OrderEngineError("Table details must be an object");
  const name = orderText(body.name, "Table name", 80), code = orderText(body.code, "Table code", 20).toUpperCase();
  if (!name || !/^[A-Z0-9-]+$/.test(code)) throw new OrderEngineError("Enter a table name and a code using letters, numbers or hyphens");
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") throw new OrderEngineError("Invalid table availability");
  return { name, code, isActive: body.isActive ?? true };
};
router.post("/", action(async (req, res) => {
  const table = await DiningTable.create(values(req.body));
  await recordAuditLog({ actor: req.user, action: "DINING_TABLE_CREATED", entityType: "DiningTable", entityId: table._id, entityLabel: table.code });
  res.status(201).json({ success: true, data: { _id: table._id, name: table.name, code: table.code, isActive: table.isActive } });
}));
router.patch("/:id", action(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Table not found" });
  const table = await DiningTable.findByIdAndUpdate(req.params.id, { $set: values(req.body) }, { new: true, runValidators: true });
  if (!table) return res.status(404).json({ message: "Table not found" });
  await recordAuditLog({ actor: req.user, action: "DINING_TABLE_UPDATED", entityType: "DiningTable", entityId: table._id, entityLabel: table.code, after: { name: table.name, isActive: table.isActive } });
  res.json({ success: true, data: table });
}));
router.get("/:id/qr", action(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Table not found" });
  const table = await DiningTable.findById(req.params.id).select("+qrToken");
  if (!table) return res.status(404).json({ message: "Table not found" });
  res.json({ success: true, data: { path: `/menu?table=${table.qrToken}`, code: table.code, name: table.name, isActive: table.isActive } });
}));
export default router;
