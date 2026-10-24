import { StockAlertNotification as Note } from "../../models/StockAlert.js";
import { assertObjectId, ValidationError } from "../../utils/inventoryValidation.js";
import { alertOptions, saveAlertRule, listAlertRules, currentAlerts, notificationInbox, actOnNotification, actionableNotification, evaluateDueAlerts } from "../../services/stockAlertService.js";
import { stockPushStatus, subscribeStockPush, revokeStockPushDevice, schedulerAuthorized, dispatchStockPush } from "../../services/stockAlertPushService.js";

const handle = work => async (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  try { res.json({ success: true, ...await work(req, res) }); } catch (error) { next(error); }
};
export const options = handle(async req => ({ data: { ...await alertOptions(req.user), ...await stockPushStatus(req.user, req), schedulerSecretConfigured: Boolean(process.env.STOCK_ALERT_WORKER_SECRET?.length >= 32) } }));
export const current = handle(req => currentAlerts(req.user, req.query));
export const rules = handle(req => listAlertRules(req.user, req.query));
export const save = handle(async req => ({ data: await saveAlertRule(req.user, req.body, req.params.id) }));
export const inbox = handle(req => notificationInbox(req.user, req.query));
export const notification = handle(async req => {
  assertObjectId(req.params.id, "notification");
  const note = await Note.findOne({ _id: req.params.id, user: req.user._id }).lean();
  const data = note && await actionableNotification(note, req.user);
  if (!data) throw Object.assign(new ValidationError("Notification not found"), { status: 404 });
  return { data };
});
export const action = handle(async req => ({ data: await actOnNotification(req.user, req.params.id, req.body) }));
export const subscribe = handle(async (req, res) => ({ data: await subscribeStockPush(req.user, req.body, req, res) }));
export const unsubscribe = handle(async (req, res) => { await revokeStockPushDevice(req, res); return { data: { subscribed: false } }; });
export const check = handle(async () => ({ data: await evaluateDueAlerts({ limit: 20, deadline: Date.now() + 10000 }) }));
const scheduledWorker = (method, secretName) => async (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  // Express also invokes GET handlers for HEAD. Never run a job for a probe.
  if (req.method !== method) return res.set("Allow", method).status(405).json({ success: false, message: "Method not allowed" });
  const authorization = { STOCK_ALERT_WORKER_SECRET: process.env[secretName] };
  if (!schedulerAuthorized(req.headers.authorization, authorization) || req.headers.cookie) return res.status(403).json({ success: false, message: "Not authorized" });
  try {
    const deadline = Date.now() + 40000;
    const evaluated = await evaluateDueAlerts({ deadline: deadline - 15000, recordHeartbeat: true });
    const pushed = await dispatchStockPush({ deadline });
    res.json({ success: true, data: { ...evaluated, ...pushed } });
  } catch (error) { next(error); }
};
export const worker = scheduledWorker("POST", "STOCK_ALERT_WORKER_SECRET");
// Vercel Cron sends GET and supplies CRON_SECRET automatically. Keep its secret
// separate from the POST endpoint used by other schedulers.
export const vercelCronWorker = scheduledWorker("GET", "CRON_SECRET");
