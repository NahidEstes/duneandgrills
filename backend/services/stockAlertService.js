import { randomUUID } from "node:crypto";
import InventoryItem from "../models/InventoryItem.js";
import User from "../models/User.js";
import "../models/InventoryCategory.js";
import "../models/Supplier.js";
import { StockAlertRule as Rule, StockAlertReceipt as Receipt, StockAlertNotification as Note, StockAlertPush as Push, StockAlertDelivery as Delivery, StockAlertJob as Job } from "../models/StockAlert.js";
import { CAPABILITIES, hasCapability } from "../config/permissions.js";
import { assertObjectId, ValidationError, parsePagination } from "../utils/inventoryValidation.js";
import { getSaleableInventory } from "./inventoryEligibilityService.js";
import { getInventoryHealth } from "./inventoryHealthService.js";
import { runInventoryTransaction } from "./inventoryStockService.js";
import { recordAuditLog } from "./auditLogService.js";
import { alertSeverity, normalizeAlertRule, recipientDue, riyadhClock, EVALUATION_MS } from "./stockAlertRules.js";

export const alertPermission = (actor, write = false) => {
  if (!actor || actor.isActive === false || !hasCapability(actor.role, write ? CAPABILITIES.INVENTORY_WRITE : CAPABILITIES.INVENTORY_READ)) throw Object.assign(new ValidationError("Inventory permission required"), { status: 403 });
};
export const authorizedRecipient = user => user && user.isActive !== false && hasCapability(user.role, CAPABILITIES.INVENTORY_READ);
const tx = work => runInventoryTransaction(work, { requireTransaction: true });
export async function usableItem(id, now, session = null) {
  const item = await InventoryItem.findById(id).session(session).lean();
  if (!item) return null;
  return { ...item, ...await getSaleableInventory(item, { now, session }) };
}
const cancelNotes = async (rule, status, session) => {
  const notes = await Note.find({ rule, status: "active" }).select("_id").session(session).lean();
  await Note.updateMany({ rule, status: "active" }, { $set: { status } }, { session });
  await Delivery.updateMany({ notification: { $in: notes.map(row => row._id) }, status: "pending" }, { $set: { status: "cancelled" } }, { session });
};
export async function saveAlertRule(actor, body, ruleId = null, now = new Date()) {
  alertPermission(actor, true);
  assertObjectId(body?.item, "stock item");
  if (ruleId) assertObjectId(ruleId, "alert rule");
  try { return await tx(async session => {
    const old = ruleId ? await Rule.findById(ruleId).session(session) : null;
    if (ruleId && !old) throw Object.assign(new ValidationError("Alert rule not found"), { status: 404 });
    if (old && (String(old.item) !== body.item || !Number.isInteger(body.expectedVersion) || body.expectedVersion !== old.version)) throw Object.assign(new ValidationError("Rule changed. Reload before saving; its item cannot be changed."), { status: 409 });
    const item = await InventoryItem.findById(body.item).session(session).lean();
    if (!item || (body.enabled && item.isActive === false)) throw new ValidationError("Choose an active stock item");
    const values = normalizeAlertRule(body, item);
    if (old && old.baseUnit === item.unit && old.enteredUnit === values.enteredUnit && old.enteredThreshold === values.enteredThreshold) values.threshold = old.threshold;
    for (const id of values.recipients) assertObjectId(id, "recipient");
    const users = await User.find({ _id: { $in: values.recipients } }).session(session).lean();
    if (users.length !== values.recipients.length || users.some(user => !authorizedRecipient(user))) throw new ValidationError("Every recipient must be active and have inventory read permission");
    const comparable = value => Object.fromEntries(Object.keys(values).map(key => [key, key === "recipients" ? value[key].map(String).sort() : value[key]]));
    if (old && JSON.stringify(comparable(old)) === JSON.stringify(comparable(values))) return old.toObject();
    const before = old?.toObject();
    const changed = { ...values, version: (old?.version || 0) + 1, updatedBy: actor._id, incident: null, severity: null, incidentStartedAt: null, lastDailyDay: null, nextEvaluationAt: now, lease: null, leaseUntil: null };
    let saved;
    if (old) {
      await cancelNotes(old._id, "cancelled", session);
      Object.assign(old, changed); saved = await old.save({ session });
    } else [saved] = await Rule.create([{ item: body.item, ...changed }], { session });
    const snapshot = value => value ? { enabled: value.enabled, item: String(value.item), threshold: value.threshold, unit: value.baseUnit, mode: value.mode, repeatMinutes: value.repeatMinutes, dailyTime: value.dailyTime, recipients: value.recipients.map(String), version: value.version } : null;
    await recordAuditLog({ actorId: actor._id, action: "STOCK_ALERT_RULE_SAVED", entityType: "StockAlertRule", entityId: saved._id, entityLabel: item.name, before: snapshot(before), after: snapshot(saved) }, { session });
    return saved.toObject();
  }); } catch (error) {
    if (error.code === 11000) throw Object.assign(new ValidationError("This stock item already has an alert rule. Edit the existing rule."), { status: 409 });
    throw error;
  }
}

// One rule document is the transaction's write fence. Config edits and snoozes
// use that same fence, so concurrent evaluators cannot double-post an event.
export async function evaluateAlertRule(id, now = new Date(), lease = null) {
  return tx(async session => {
    const rule = await Rule.findOneAndUpdate({ _id: id, ...(lease ? { lease } : {}) }, { $inc: { lockVersion: 1 } }, { session, new: true });
    if (!rule) return { skipped: true };
    const item = await usableItem(rule.item, now, session);
    const severity = alertSeverity(rule, item);
    rule.lastCheckedAt = now; rule.nextEvaluationAt = new Date(now.getTime() + EVALUATION_MS);
    rule.lease = null; rule.leaseUntil = null;
    if (!severity) {
      if (rule.incident) await cancelNotes(rule._id, rule.enabled && item?.isActive !== false && item?.unit === rule.baseUnit ? "resolved" : "cancelled", session);
      rule.incident = null; rule.severity = null; rule.incidentStartedAt = null;
      await rule.save({ session }); return { sent: 0, resolved: true };
    }
    if (!rule.incident) { rule.incident = randomUUID(); rule.incidentStartedAt = now; }
    rule.severity = severity;
    const local = riyadhClock(now);
    const dailyDue = local.time >= rule.dailyTime && rule.lastDailyDay !== local.day;
    const users = await User.find({ _id: { $in: rule.recipients } }).session(session).lean();
    const eligible = users.filter(authorizedRecipient);
    const due = [];
    for (const user of eligible) {
      const receipt = await Receipt.findOne({ rule: rule._id, incident: rule.incident, user: user._id }).session(session);
      // A daily recipient who snoozed today's check receives at most one
      // catch-up when snooze expires, never yesterday's backlog.
      const dailyRecipientDue = dailyDue || (rule.mode === "daily" && receipt?.snoozedUntil && new Date(receipt.snoozedUntil) <= now && local.time >= rule.dailyTime && (!receipt.lastSentAt || riyadhClock(new Date(receipt.lastSentAt)).day !== local.day));
      if (recipientDue(rule, receipt, severity, now, dailyRecipientDue)) due.push({ user, receipt });
    }
    if (rule.mode === "daily" && dailyDue) rule.lastDailyDay = local.day;
    if (due.length) {
      rule.sequence += 1; rule.lastEventAt = now;
      for (const { user, receipt } of due) {
        const values = { lastSentAt: now, lastSeverity: severity, lastSequence: rule.sequence, nextReminderAt: rule.mode === "repeat" ? new Date(now.getTime() + rule.repeatMinutes * 60000) : null };
        if (receipt) { Object.assign(receipt, values); await receipt.save({ session }); }
        else await Receipt.create([{ rule: rule._id, incident: rule.incident, user: user._id, ...values }], { session });
        const title = `${severity === "out" ? "Out of stock" : "Low stock"}: ${item.name}`;
        const body = `${item.saleableStock} ${item.unit} usable. Alert threshold: ${rule.threshold} ${rule.baseUnit}.`;
        const [note] = await Note.create([{ rule: rule._id, ruleVersion: rule.version, incident: rule.incident, sequence: rule.sequence, user: user._id, severity, title, body, quantity: item.saleableStock, threshold: rule.threshold, unit: item.unit, createdAt: now }], { session });
        const subscriptions = await Push.find({ user: user._id, enabled: true }).session(session).lean();
        for (const subscription of subscriptions) await Delivery.create([{ notification: note._id, subscription: subscription._id, dueAt: now }], { session });
      }
    }
    await rule.save({ session });
    return { sent: due.length, severity };
  });
}

export async function evaluateDueAlerts({ now = new Date(), limit = 50, deadline = Date.now() + 30000, recordHeartbeat = false } = {}) {
  if (recordHeartbeat) await Job.updateOne({ _id: "stock-alerts" }, { $set: { lastStartedAt: now } }, { upsert: true });
  let checked = 0, sent = 0;
  while (checked < Math.min(limit, 100) && Date.now() < deadline) {
    const lease = randomUUID();
    const claimed = await Rule.findOneAndUpdate({ enabled: true, nextEvaluationAt: { $lte: now }, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }] }, { $set: { lease, leaseUntil: new Date(now.getTime() + 60000) } }, { sort: { nextEvaluationAt: 1, _id: 1 }, new: true }).lean();
    if (!claimed) break;
    try { const result = await evaluateAlertRule(claimed._id, now, lease); checked++; sent += result.sent || 0; }
    catch (error) {
      await Rule.updateOne({ _id: claimed._id, lease }, { $set: { lease: null, leaseUntil: null, nextEvaluationAt: new Date(now.getTime() + 60000) } });
      if (recordHeartbeat) await Job.updateOne({ _id: "stock-alerts" }, { $set: { lastFailedAt: now, lastFailure: "Rule evaluation failed; check server diagnostics." } });
      throw error;
    }
  }
  if (recordHeartbeat) await Job.updateOne({ _id: "stock-alerts" }, { $set: { lastCompletedAt: now } });
  return { checked, sent };
}

export async function alertOptions(actor) {
  alertPermission(actor);
  const recipients = await User.find({ isActive: { $ne: false } }).select("name role").sort({ name: 1 }).lean();
  const job = await Job.findById("stock-alerts").lean();
  const overdueRules = await Rule.countDocuments({ enabled: true, nextEvaluationAt: { $lt: new Date(Date.now() - 180000) } });
  return { recipients: recipients.filter(authorizedRecipient), canManage: hasCapability(actor.role, CAPABILITIES.INVENTORY_WRITE), job, overdueRules, workerHealthy: Boolean(!overdueRules && job?.lastCompletedAt && Date.now() - job.lastCompletedAt.getTime() < 180000 && (!job.lastFailedAt || job.lastFailedAt <= job.lastCompletedAt)) };
}
export async function currentAlerts(actor, query = {}, now = new Date()) {
  alertPermission(actor);
  const { page, limit, skip } = parsePagination(query, 20);
  if (query.status && !["all", "low", "out"].includes(query.status)) throw new ValidationError("Unknown stock status");
  if (query.scope && !["all", "watched"].includes(query.scope)) throw new ValidationError("Unknown alert scope");
  const items = await InventoryItem.find({ isActive: true }).populate("category supplier", "name").lean();
  const health = await getInventoryHealth({ items, now });
  const rules = await Rule.find().lean();
  const receipts = await Receipt.find({ user: actor._id, rule: { $in: rules.map(row => row._id) } }).lean();
  const map = new Map(rules.map(rule => [String(rule.item), rule]));
  const search = String(query.search || "").trim().toLowerCase().slice(0, 120);
  let rows = health.rows.map(item => {
    const rule = map.get(String(item._id)), severity = rule ? alertSeverity(rule, item) : null;
    const receipt = rule && receipts.find(row => String(row.rule) === String(rule._id) && row.incident === rule.incident);
    return { ...item, alertRule: rule ? { _id: rule._id, enabled: rule.enabled, threshold: rule.threshold, unit: rule.baseUnit, mode: rule.mode, dailyTime: rule.dailyTime, repeatMinutes: rule.repeatMinutes, lastEventAt: rule.lastEventAt, lastCheckedAt: rule.lastCheckedAt, incident: rule.incident, version: rule.version } : null, alertSeverity: severity,
      status: item.saleableStock === 0 ? "out" : "low", applicableThreshold: severity ? rule.threshold : item.reorderLevel,
      snoozedUntil: receipt?.snoozedUntil, nextReminderAt: receipt?.nextReminderAt, lastNotificationAt: receipt?.lastSentAt,
      watched: Boolean(rule?.enabled) };
  }).filter(row => (query.scope === "watched" ? row.watched && row.alertSeverity : row.stockHealth.low || row.stockHealth.out || row.alertSeverity)
    && (!search || `${row.name} ${row.sku}`.toLowerCase().includes(search))
    && (!query.item || String(row._id) === query.item) && (!query.category || String(row.category?._id) === query.category));
  if (query.status && query.status !== "all") rows = rows.filter(row => row.status === query.status);
  rows.sort((a, b) => Number(b.status === "out") - Number(a.status === "out") || a.name.localeCompare(b.name));
  const total = rows.length;
  return { data: rows.slice(skip, skip + limit), summary: { low: rows.filter(row => row.status === "low").length, out: rows.filter(row => row.status === "out").length, watched: rows.filter(row => row.watched).length }, generatedAt: now, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}
export async function listAlertRules(actor, query = {}) {
  alertPermission(actor);
  const { page, limit, skip } = parsePagination(query, 20);
  const rows = await Rule.find().populate("item", "name sku unit isActive reorderLevel purchaseUnit purchaseConversionFactor weightVolumeConversion").populate("recipients", "name role isActive").sort({ createdAt: -1 }).lean();
  const search = String(query.search || "").toLowerCase().slice(0, 120);
  const filtered = rows.filter(row => (!search || `${row.item?.name} ${row.item?.sku}`.toLowerCase().includes(search)) && (!query.item || String(row.item?._id) === query.item));
  return { data: filtered.slice(skip, skip + limit), pagination: { page, limit, total: filtered.length, pages: Math.ceil(filtered.length / limit) } };
}

export async function actionableNotification(note, actor, now = new Date()) {
  return (await decorateNotifications([note], actor, now))[0] || null;
}
async function decorateNotifications(notes, actor, now) {
  if (!authorizedRecipient(actor) || !notes.length) return [];
  const rules = await Rule.find({ _id: { $in: notes.map(row => row.rule) }, recipients: actor._id }).lean();
  const items = await InventoryItem.find({ _id: { $in: rules.map(row => row.item) } }).lean();
  const health = await getInventoryHealth({ items, now });
  const receipts = await Receipt.find({ rule: { $in: rules.map(row => row._id) }, user: actor._id }).lean();
  const ruleMap = new Map(rules.map(row => [String(row._id), row]));
  const itemMap = new Map(health.rows.map(row => [String(row._id), row]));
  const receiptMap = new Map(receipts.map(row => [`${row.rule}:${row.incident}`, row]));
  return notes.flatMap(note => {
    const rule = ruleMap.get(String(note.rule));
    if (!rule || String(note.user) !== String(actor._id)) return [];
    const item = itemMap.get(String(rule.item)), receipt = receiptMap.get(`${rule._id}:${note.incident}`);
    const active = note.status === "active" && rule.version === note.ruleVersion && rule.incident === note.incident && alertSeverity(rule, item) === note.severity && receipt?.lastSequence === note.sequence;
    return [{ ...note, active, resolved: !active, item: rule.item, currentUsableStock: item?.saleableStock, snoozedUntil: receipt?.snoozedUntil, snoozed: Boolean(receipt?.snoozedUntil && receipt.snoozedUntil > now) }];
  });
}
export async function notificationInbox(actor, query = {}, now = new Date()) {
  alertPermission(actor);
  const { page, limit, skip } = parsePagination(query, 20);
  // One latest notification per incident; old reminder events remain durable
  // evidence but do not flood the inbox or inflate its unread count.
  const rows = await Note.aggregate([{ $match: { user: actor._id } }, { $sort: { createdAt: -1, sequence: -1 } }, { $group: { _id: { rule: "$rule", incident: "$incident" }, note: { $first: "$$ROOT" } } }, { $replaceRoot: { newRoot: "$note" } }, { $match: { dismissedAt: null } }, { $sort: { createdAt: -1, _id: -1 } }]);
  const output = await decorateNotifications(rows, actor, now);
  return { data: output.slice(skip, skip + limit), unread: output.filter(row => row.active && !row.snoozed && !row.readAt).length, pagination: { page, limit, total: output.length, pages: Math.ceil(output.length / limit) } };
}
export async function actOnNotification(actor, id, body, now = new Date()) {
  alertPermission(actor); assertObjectId(id, "notification");
  if (!body || Object.keys(body).some(key => !["action", "minutes"].includes(key)) || !["read", "dismiss", "snooze"].includes(body.action)) throw new ValidationError("Unknown notification action");
  return tx(async session => {
    const note = await Note.findOne({ _id: id, user: actor._id }).session(session);
    if (!note) throw Object.assign(new ValidationError("Notification not found"), { status: 404 });
    const rule = await Rule.findOneAndUpdate({ _id: note.rule, recipients: actor._id }, { $inc: { lockVersion: 1 } }, { session, new: true });
    if (!rule) throw Object.assign(new ValidationError("Notification access changed"), { status: 403 });
    if (body.action === "snooze") {
      if (![15, 30, 60, 120, 240].includes(body.minutes)) throw new ValidationError("Choose a supported snooze duration");
      const item = await usableItem(rule.item, now, session);
      if (rule.incident !== note.incident || rule.version !== note.ruleVersion || !alertSeverity(rule, item)) throw Object.assign(new ValidationError("This alert is no longer active. Refresh notifications."), { status: 409 });
      await Receipt.updateOne({ rule: rule._id, incident: rule.incident, user: actor._id }, { $set: { snoozedUntil: new Date(now.getTime() + body.minutes * 60000) } }, { session });
    }
    if (body.action === "dismiss") note.dismissedAt = now;
    note.readAt = now; await note.save({ session });
    return { updated: true };
  });
}
