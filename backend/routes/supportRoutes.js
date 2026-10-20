import express from "express";
import mongoose from "mongoose";
import OrderSupport from "../models/OrderSupport.js";
import { optionalAuth, protect, requireCapability } from "../middleware/auth.js";
import { CAPABILITIES } from "../config/permissions.js";
import { rateLimit } from "../middleware/security.js";
import { appendSupportMessage, serializeSupport, supportInput, supportOrder } from "../services/orderSupportService.js";
import { recordAuditLog } from "../services/auditLogService.js";
import { serializeAdminOrder } from "../services/orderSerializer.js";

const router = express.Router();
const action = handler => async (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  try { await handler(req, res); } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "A support conversation already exists for this order. Refresh to view it." });
    if (error.name === "VersionError") return res.status(409).json({ message: "This conversation changed. Refresh before replying." });
    if (["CastError", "ValidationError"].includes(error.name)) error.status = 400;
    next(error);
  }
};
router.use(rateLimit({ windowMs: 60_000, max: 60, keyPrefix: "order-support" }));
router.get("/orders/:orderNumber", optionalAuth, action(async (req, res) => {
  const order = await supportOrder(req);
  res.json({ success: true, data: serializeSupport(await OrderSupport.findOne({ order: order._id })) });
}));
router.post("/orders/:orderNumber", optionalAuth, rateLimit({ windowMs: 60_000, max: 6, keyPrefix: "support-create", identity: req => `${req.user?._id || req.verifiedClientIp || req.ip}:${req.params.orderNumber}` }), action(async (req, res) => {
  const order = await supportOrder(req);
  const ticket = await OrderSupport.create({ ...supportInput(req.body, order), order: order._id, orderNumber: order.orderNumber });
  res.status(201).json({ success: true, data: serializeSupport(ticket) });
}));
router.post("/orders/:orderNumber/messages", optionalAuth, rateLimit({ windowMs: 60_000, max: 15, keyPrefix: "support-reply" }), action(async (req, res) => {
  const order = await supportOrder(req);
  const ticket = await OrderSupport.findOne({ order: order._id });
  if (!ticket) return res.status(404).json({ message: "Support conversation not found" });
  appendSupportMessage(ticket, req.body, req.user);
  await ticket.save();
  res.json({ success: true, data: serializeSupport(ticket) });
}));
router.use(protect, requireCapability(CAPABILITIES.ORDERS_MANAGE));
router.get("/", action(async (req, res) => {
  const filter = {};
  if (req.query.status && req.query.status !== "all") {
    if (!["Open", "In Progress", "Resolved", "Closed"].includes(req.query.status)) return res.status(400).json({ message: "Invalid support status" });
    filter.status = req.query.status;
  }
  if (req.query.search) {
    const search = String(req.query.search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.orderNumber = new RegExp(search, "i");
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1), limit = 20;
  const [rows, total] = await Promise.all([OrderSupport.find(filter).sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit), OrderSupport.countDocuments(filter)]);
  res.json({ success: true, data: rows.map(row => serializeSupport(row, true)), pagination: { page, total, pages: Math.ceil(total / limit) } });
}));
router.get("/:id", action(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Support conversation not found" });
  const ticket = await OrderSupport.findById(req.params.id).populate("order");
  if (!ticket) return res.status(404).json({ message: "Support conversation not found" });
  res.json({ success: true, data: { ...serializeSupport(ticket, true), order: ticket.order ? serializeAdminOrder(ticket.order) : null } });
}));
router.post("/:id/messages", action(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Support conversation not found" });
  const ticket = await OrderSupport.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: "Support conversation not found" });
  const previous = ticket.status;
  appendSupportMessage(ticket, req.body, req.user, true);
  await ticket.save();
  await recordAuditLog({ actor: req.user, action: "ORDER_SUPPORT_UPDATED", entityType: "OrderSupport", entityId: ticket._id, entityLabel: ticket.orderNumber, before: { status: previous }, after: { status: ticket.status, internal: req.body.internal === true } });
  res.json({ success: true, data: serializeSupport(ticket, true) });
}));
export default router;
