import AuditLog from "../models/AuditLog.js";
import { ADMIN_DAY_MS, parseRiyadhDate } from "../utils/adminDate.js";
import { ValidationError } from "../utils/inventoryValidation.js";

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const listAuditLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const filter = {};
    if (req.query.entityType && req.query.entityType !== "all") filter.entityType = req.query.entityType;
    if (req.query.action && req.query.action !== "all") filter.action = req.query.action;
    if (req.query.actor) filter.actor = req.query.actor;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = parseRiyadhDate(req.query.from, "From date");
      if (req.query.to) filter.createdAt.$lt = new Date(parseRiyadhDate(req.query.to, "To date").getTime() + ADMIN_DAY_MS);
      if (filter.createdAt.$gte && filter.createdAt.$lt && filter.createdAt.$gte >= filter.createdAt.$lt) {
        throw new ValidationError("From date must be before or equal to To date");
      }
    }
    if (req.query.search?.trim()) {
      const value = new RegExp(escapeRegex(req.query.search.trim()), "i");
      filter.$or = [
        { entityLabel: value },
        { action: value },
        { entityType: value },
        { actorName: value },
      ];
    }
    const [rows, total, entityTypes, actions] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(filter),
      AuditLog.distinct("entityType"),
      AuditLog.distinct("action"),
    ]);
    res.json({
      success: true,
      data: rows,
      filters: { entityTypes: entityTypes.sort(), actions: actions.sort() },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
};
