import mongoose from "mongoose";
import PosTerminal from "../models/PosTerminal.js";
import PosShift from "../models/PosShift.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { recordAuditLog } from "./auditLogService.js";
import { runInventoryTransaction } from "./inventoryStockService.js";

// Only the legacy MAIN code is provisioned automatically; other codes require administration.
export const ensureLegacyTerminal = async () => {
  try { return await PosTerminal.findOneAndUpdate({ code: "MAIN" }, { $setOnInsert: { name: "Main Counter", isActive: true } }, { upsert: true, new: true }); }
  catch (error) { if (error.code === 11000) return PosTerminal.findOne({ code: "MAIN" }); throw error; }
};
export const terminalSnapshot = (terminal) => ({ code: terminal.code, name: terminal.name, locationLabel: terminal.locationLabel || "" });
export const resolvePosTerminal = async (value, session = null) => {
  if (!value || value === "MAIN") await ensureLegacyTerminal();
  const filter = mongoose.isValidObjectId(value) ? { _id: value } : { code: String(value || "MAIN").trim().toUpperCase() };
  const terminal = await PosTerminal.findOne({ ...filter, isActive: true }).session(session);
  if (!terminal) throw new ValidationError("Select an active POS terminal");
  return terminal;
};
export const savePosTerminal = async ({ id, payload, actor }) => {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const locationLabel = typeof payload.locationLabel === "string" ? payload.locationLabel.trim() : "";
  if (!name || name.length > 100 || locationLabel.length > 120) throw new ValidationError("Terminal name/location is invalid");
  if (payload.isActive !== undefined && typeof payload.isActive !== "boolean") throw new ValidationError("Active status must be true or false");
  return runInventoryTransaction(async (session) => {
    const before = id ? await PosTerminal.findById(id).session(session) : null;
    if (id && !before) throw new ValidationError("Terminal was not found");
    if (before && payload.code !== undefined && String(payload.code).trim().toUpperCase() !== before.code) throw new ValidationError("Terminal code cannot be changed");
    if (before && payload.isActive === false && await PosShift.exists({ terminal: before.code, isOpen: true }).session(session)) throw new ValidationError("Close all shifts before deactivating this terminal");
    const code = before?.code || String(payload.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{0,39}$/.test(code)) throw new ValidationError("Use letters, numbers and hyphens for the terminal code");
    let row;
    try {
      row = id ? await PosTerminal.findOneAndUpdate({ _id: id }, { $set: { name, locationLabel, isActive: payload.isActive ?? before.isActive, updatedBy: actor._id }, $inc: { operationRevision: 1 } }, { new: true, runValidators: true, session })
        : (await PosTerminal.create([{ code, name, locationLabel, isActive: payload.isActive ?? true, createdBy: actor._id, updatedBy: actor._id }], session ? { session } : {}))[0];
    } catch (error) { if (error.code === 11000) throw new ValidationError("Terminal code already exists"); throw error; }
    await recordAuditLog({ actor, action: id ? before.isActive && !row.isActive ? "POS_TERMINAL_DEACTIVATED" : "POS_TERMINAL_UPDATED" : "POS_TERMINAL_CREATED", entityType: "PosTerminal", entityId: row._id, entityLabel: row.code, before: before ? { ...terminalSnapshot(before), isActive: before.isActive } : null, after: { ...terminalSnapshot(row), isActive: row.isActive } }, { session });
    return row;
  });
};
