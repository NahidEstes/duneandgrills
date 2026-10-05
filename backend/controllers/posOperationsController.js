import Order from "../models/Order.js";
import User from "../models/User.js";
import MenuItem from "../models/MenuItem.js";
import Combo from "../models/Combo.js";
import PosTerminal from "../models/PosTerminal.js";
import PosQuickItem from "../models/PosQuickItem.js";
import PosSession from "../models/PosSession.js";
import Counter from "../models/Counter.js";
import { ensureLegacyTerminal, savePosTerminal } from "../services/posTerminalService.js";
import { createPosSession, publicPosActor, setPosPin, unlockPosSession } from "../services/posSessionService.js";
import { getEffectiveRestaurantSettings } from "../services/restaurantSettingsService.js";
import { hasCapability, CAPABILITIES } from "../config/permissions.js";
import { recordAuditLog } from "../services/auditLogService.js";
import { ValidationError, assertObjectId } from "../utils/inventoryValidation.js";
import { runInventoryTransaction } from "../services/inventoryStockService.js";

export const listTerminals = async (req, res, next) => { try {
  await ensureLegacyTerminal();
  const all = req.query.all === "true" && hasCapability(req.user.role, CAPABILITIES.POS_TERMINAL_MANAGE);
  res.json({ success: true, data: await PosTerminal.find(all ? {} : { isActive: true }).sort({ code: 1 }).lean() });
} catch (e) { next(e); } };
export const writeTerminal = async (req, res, next) => { try { res.json({ success: true, data: await savePosTerminal({ id: req.params.id, payload: req.body, actor: req.user }) }); } catch (e) { next(e); } };
export const posSession = async (req, res, next) => { try {
  const settings = await getEffectiveRestaurantSettings();
  const data = req.posSession ? { actor: publicPosActor(req.user), locked: req.posSession.locked } : await createPosSession(req.posOwner || req.user);
  res.json({ success: true, data: { ...data, autoLockMinutes: settings.posCheckout.autoLockMinutes } });
} catch (e) { next(e); } };
export const lockSession = async (req, res, next) => { try {
  if (!req.posSession) throw new ValidationError("Start a POS session first");
  await PosSession.updateOne({ _id: req.posSession._id }, { $set: { locked: true } });
  await recordAuditLog({ actor: req.user, action: "POS_LOCKED", entityType: "PosSession", entityId: req.posSession._id });
  res.json({ success: true });
} catch (e) { next(e); } };
export const unlockSession = (switching = false) => async (req, res, next) => { try {
  const actor = await unlockPosSession({ session: req.posSession, actorId: switching ? assertObjectId(req.body.cashierId) : req.user._id, pin: req.body.pin, password: req.body.password, switching, owner: req.posOwner });
  res.json({ success: true, data: { actor, locked: false } });
} catch (e) { next(e); } };
export const listCashiers = async (_req, res, next) => { try { res.json({ success: true, data: await User.find({ role: { $in: ["admin", "manager", "cashier"] }, isActive: true }).select("name role").sort({ name: 1 }).lean() }); } catch (e) { next(e); } };
export const writePin = async (req, res, next) => { try { await setPosPin(assertObjectId(req.params.id), req.body.pin, req.user); res.json({ success: true }); } catch (e) { next(e); } };

let popularCache = { until: 0, rows: [] };
export const listQuickMenu = async (_req, res, next) => { try {
  if (popularCache.until < Date.now()) {
    const rows = await Order.aggregate([{ $match: { source: "pos", createdAt: { $gte: new Date(Date.now() - 90 * 86400000) }, status: { $nin: ["cancelled", "refunded", "failed"] } } }, { $unwind: "$items" }, { $group: { _id: { productId: { $ifNull: ["$items.combo", "$items.menuItem"] }, productType: "$items.productType" }, quantity: { $sum: "$items.quantity" } } }, { $sort: { quantity: -1 } }, { $limit: 20 }]);
    popularCache = { until: Date.now() + 5 * 60_000, rows: rows.map(row => ({ ...row._id, quantity: row.quantity })) };
  }
  res.json({ success: true, data: { favourites: await PosQuickItem.find().sort({ position: 1, createdAt: 1 }).lean(), popular: popularCache.rows } });
} catch (e) { next(e); } };
export const writeQuickItem = async (req, res, next) => { try {
  const productId = assertObjectId(req.body.productId); const productType = req.body.productType;
  if (!["menuItem", "combo"].includes(productType)) throw new ValidationError("Invalid product type");
  if (!await (productType === "combo" ? Combo : MenuItem).exists({ _id: productId })) throw new ValidationError("Product not found");
  const position = Number(req.body.position || 0);
  if (!Number.isInteger(position) || position < 0 || position > 10000) throw new ValidationError("Position must be a whole number between 0 and 10000");
  await runInventoryTransaction(async session => {
    // Serialize shared ordering so moving an item never leaves tied positions.
    await Counter.findOneAndUpdate({ _id: "POS_QUICK_MENU_REVISION" }, { $inc: { seq: 1 } }, { upsert: true, session });
    const rows = await PosQuickItem.find().sort({ position: 1, createdAt: 1 }).session(session).lean();
    const ordered = rows.filter(row => String(row.productId) !== String(productId) || row.productType !== productType);
    if (req.body.remove === true) await PosQuickItem.deleteOne({ productId, productType }, { session });
    else ordered.splice(Math.min(position, ordered.length), 0, { productId, productType });
    if (ordered.length) await PosQuickItem.bulkWrite(ordered.map((row, index) => ({ updateOne: { filter: { productId: row.productId, productType: row.productType }, update: { $set: { position: index, updatedBy: req.user._id } }, upsert: true } })), { session });
    await recordAuditLog({ actor: req.user, action: "POS_QUICK_MENU_UPDATED", entityType: "PosQuickItem", entityId: productId, after: { productType, position, removed: req.body.remove === true } }, { session });
  });
  res.json({ success: true });
} catch (e) { next(e); } };
