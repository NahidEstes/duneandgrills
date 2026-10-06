import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import PosSession from "../models/PosSession.js";
import PosShift from "../models/PosShift.js";
import PosHeldSale from "../models/PosHeldSale.js";
import Counter from "../models/Counter.js";
import { runInventoryTransaction } from "./inventoryStockService.js";
import { hasCapability, CAPABILITIES } from "../config/permissions.js";
import { normalizePin } from "./attendanceService.js";
import { recordAuditLog } from "./auditLogService.js";
import { ValidationError } from "../utils/inventoryValidation.js";

const error = (message, status = 400) => Object.assign(new ValidationError(message), { status });
export const publicPosActor = (user) => ({ _id: user._id, name: user.name, role: user.role });
export const verifyPosPin = async (userId, pin) => {
  const normalized = normalizePin(pin);
  const user = await User.findById(userId).select("+posPinHash +sessionVersion");
  if (!user || user.isActive === false || !hasCapability(user.role, CAPABILITIES.POS_OPERATE) || !user.posPinHash || !await bcrypt.compare(normalized, user.posPinHash)) throw error("Cashier PIN is invalid or unavailable", 401);
  return user;
};
export const setPosPin = async (userId, pin, actor) => {
  const user = await User.findById(userId);
  if (!user || !hasCapability(user.role, CAPABILITIES.POS_OPERATE)) throw error("Choose a POS staff member");
  const posPinHash = await bcrypt.hash(normalizePin(pin), 12);
  await User.updateOne({ _id: userId }, { $set: { posPinHash }, $inc: { sessionVersion: 1 } });
  await PosSession.updateMany({ actor: userId }, { $set: { locked: true } });
  await recordAuditLog({ actor, action: "POS_PIN_CHANGED", entityType: "User", entityId: userId, entityLabel: user.name });
};

export const resolvePosSession = async (req, res, next) => {
  req.posOwner = req.user;
  const token = req.headers["x-pos-session"];
  try {
    if (!token) {
      // Legacy clients without session history remain compatible. Once a workspace
      // exists, omitting its header must not bypass its actor, expiry or lock.
      const bootstrap = req.method === "GET" && req.path === "/session";
      if (!bootstrap && (await PosSession.exists({ owner: req.user._id }) || await Counter.exists({ _id: `pos-session-owner:${req.user._id}` }))) throw error("Restore the POS session before continuing", 401);
      return next();
    }
    if (typeof token !== "string") throw error("Invalid POS session", 401);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.purpose !== "pos-session" || decoded.owner !== String(req.user._id) || Number(decoded.sv) !== Number(req.user.sessionVersion || 0)) throw error("Invalid POS session", 401);
    const session = await PosSession.findOne({ _id: decoded.sid, owner: req.user._id, expiresAt: { $gt: new Date() } });
    if (!session) throw error("POS session expired", 401);
    const actor = await User.findById(session.actor).select("+sessionVersion");
    if (!actor || actor.isActive === false || Number(actor.sessionVersion || 0) !== session.actorSessionVersion || !hasCapability(actor.role, CAPABILITIES.POS_OPERATE)) throw error("Cashier session is no longer valid", 401);
    req.posSession = session;
    req.user = actor;
    if (session.locked && !req.path.startsWith("/session") && !(req.method === "GET" && req.path === "/terminals")) throw error("POS is locked. Unlock to continue.", 423);
    next();
  } catch (failure) { res.status(failure.status || 401).json({ success: false, message: failure.status ? failure.message : "POS session expired" }); }
};

export const createPosSession = async (owner) => runInventoryTransaction(async session => {
  if (!session) throw error("POS session recovery requires MongoDB transaction support", 503);
  // Serialize concurrent bootstrap/reopen requests for the same authenticated owner.
  const recovery = await Counter.findOneAndUpdate({ _id: `pos-session-owner:${owner._id}` }, { $inc: { seq: 1 } }, { upsert: true, new: true, session });
  let row = await PosSession.findOne({ owner: owner._id, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1, _id: -1 }).session(session);
  let actor = row ? await User.findById(row.actor).select("+sessionVersion").session(session) : owner;
  if (row && (!actor || actor.isActive === false || !hasCapability(actor.role, CAPABILITIES.POS_OPERATE) || Number(actor.sessionVersion || 0) !== row.actorSessionVersion)) {
    actor = owner; row.actor = owner._id; row.actorSessionVersion = Number(owner.sessionVersion || 0); row.locked = true;
    await row.save({ session });
  }
  if (!row) {
    const previous = await PosSession.exists({ owner: owner._id }).session(session);
    [row] = await PosSession.create([{ owner: owner._id, actor: owner._id, actorSessionVersion: Number(owner.sessionVersion || 0), locked: Boolean(previous) || recovery.seq > 1, expiresAt: new Date(Date.now() + 12 * 60 * 60_000) }], { session });
  }
  const token = jwt.sign({ purpose: "pos-session", sid: String(row._id), owner: String(owner._id), sv: Number(owner.sessionVersion || 0) }, process.env.JWT_SECRET, { expiresIn: "12h" });
  return { token, actor: publicPosActor(actor), locked: row.locked };
});

export const unlockPosSession = async ({ session, actorId, pin, password, switching, owner }) => {
  if (!session) throw error("Start a POS session first", 401);
  if (session.blockedUntil && session.blockedUntil > new Date()) throw error("Too many PIN attempts. Try again in 5 minutes.", 429);
  if (switching) {
    if (await PosShift.exists({ cashier: session.actor, isOpen: true })) throw error("Close the cashier shift before switching");
    if (await PosHeldSale.exists({ cashier: session.actor, status: "working", expiresAt: { $gt: new Date() } })) throw error("Hold or clear the current sale before switching");
  } else if (String(actorId) !== String(session.actor)) throw error("Use Switch Cashier to change identity", 403);
  try {
    let actor;
    if (!switching && typeof password === "string") {
      actor = await User.findById(actorId).select("+password +sessionVersion");
      if (!actor || actor.isActive === false || !hasCapability(actor.role, CAPABILITIES.POS_OPERATE) || !await actor.comparePassword(password)) throw error("Password is invalid", 401);
    } else actor = await verifyPosPin(actorId, pin);
    const before = session.actor;
    const unlocked = await PosSession.updateOne({ _id: session._id, $or: [{ blockedUntil: null }, { blockedUntil: { $lte: new Date() } }] }, { $set: { actor: actor._id, actorSessionVersion: Number(actor.sessionVersion || 0), locked: false, failedAttempts: 0, blockedUntil: null } });
    if (!unlocked.matchedCount) throw error("Too many PIN attempts. Try again in 5 minutes.", 429);
    await recordAuditLog({ actor, action: switching ? "POS_CASHIER_SWITCHED" : "POS_UNLOCKED", entityType: "PosSession", entityId: session._id, related: { previousCashier: before, sessionOwner: owner._id } });
    return publicPosActor(actor);
  } catch (failure) {
    const updated = await PosSession.findOneAndUpdate({ _id: session._id }, { $inc: { failedAttempts: 1 } }, { new: true });
    if (updated.failedAttempts >= 5) await PosSession.updateOne({ _id: session._id }, { $set: { blockedUntil: new Date(Date.now() + 5 * 60_000) } });
    await recordAuditLog({ actor: owner, action: "POS_UNLOCK_FAILED", entityType: "PosSession", entityId: session._id });
    throw failure;
  }
};
