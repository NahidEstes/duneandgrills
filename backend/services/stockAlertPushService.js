import { createHash, createECDH, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import User from "../models/User.js";
import { StockAlertPush as Push, StockAlertDelivery as Delivery, StockAlertNotification as Note } from "../models/StockAlert.js";
import { parseCookies } from "../utils/httpCookies.js";
import { ValidationError } from "../utils/inventoryValidation.js";
import { alertPermission, actionableNotification } from "./stockAlertService.js";

const digest = value => createHash("sha256").update(value).digest("hex");
export const PUSH_COOKIE = "dg_stock_push_device";
export function pushConfiguration(env = process.env) {
  const publicKey = env.STOCK_ALERT_VAPID_PUBLIC_KEY || "", privateKey = env.STOCK_ALERT_VAPID_PRIVATE_KEY || "", subject = env.STOCK_ALERT_VAPID_SUBJECT || "";
  let configured = /^[A-Za-z0-9_-]{87}$/.test(publicKey) && /^[A-Za-z0-9_-]{43}$/.test(privateKey) && /^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject);
  if (configured) {
    try { const key = createECDH("prime256v1"); key.setPrivateKey(Buffer.from(privateKey, "base64url")); configured = key.getPublicKey().toString("base64url") === publicKey; }
    catch { configured = false; }
  }
  return { configured, publicKey: configured ? publicKey : null };
}
export function schedulerAuthorized(header, env = process.env) {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const expected = env.STOCK_ALERT_WORKER_SECRET || "", supplied = String(header || "").replace(/^Bearer /, "");
  return expected.length >= 32 && Buffer.byteLength(expected) === Buffer.byteLength(supplied) && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}
export function validatePushSubscription(input) {
  let url;
  try { url = new URL(input?.endpoint); } catch { throw new ValidationError("Invalid push endpoint"); }
  // Endpoint input causes an outbound server request. Restrict destinations to
  // known browser push services; never allow arbitrary URLs or redirects.
  const host = url.hostname;
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash || url.href.length > 4096 || !["fcm.googleapis.com", "web.push.apple.com"].includes(host) && !/^(?:[a-z0-9-]+\.)?push\.services\.mozilla\.com$/.test(host) && !/^[a-z0-9-]+\.notify\.windows\.com$/.test(host)) throw new ValidationError("This browser push service is not supported");
  const keys = input?.keys;
  if (!keys || !/^[A-Za-z0-9_-]{87}$/.test(keys.p256dh || "") || !/^[A-Za-z0-9_-]{22}$/.test(keys.auth || "")) throw new ValidationError("Invalid push encryption keys");
  return { endpoint: url.href, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}
export async function subscribeStockPush(actor, input, req, res) {
  alertPermission(actor);
  if (!pushConfiguration().configured) throw Object.assign(new ValidationError("Background push is not configured"), { status: 503 });
  const subscription = validatePushSubscription(input);
  const previous = parseCookies(req.headers.cookie)[PUSH_COOKIE];
  const device = /^[A-Za-z0-9_-]{43}$/.test(previous || "") ? previous : randomBytes(32).toString("base64url");
  // Explicit Enable on this browser binds its endpoint to the current account.
  await Push.findOneAndUpdate({ endpointHash: digest(subscription.endpoint) }, { $set: { ...subscription, user: actor._id, sessionVersion: actor.sessionVersion || 0, enabled: true, deviceHash: digest(device) } }, { upsert: true, new: true });
  res.cookie(PUSH_COOKIE, device, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.COOKIE_SAME_SITE || "lax", path: "/api", maxAge: 365 * 86400000 });
  return { subscribed: true };
}
export async function revokeStockPushDevice(req, res) {
  const device = parseCookies(req.headers.cookie)[PUSH_COOKIE];
  if (/^[A-Za-z0-9_-]{43}$/.test(device || "")) await Push.updateMany({ deviceHash: digest(device) }, { $set: { enabled: false } });
  res.clearCookie(PUSH_COOKIE, { path: "/api", secure: process.env.NODE_ENV === "production", sameSite: process.env.COOKIE_SAME_SITE || "lax", httpOnly: true });
}
export async function stockPushStatus(actor, req) {
  alertPermission(actor);
  const device = parseCookies(req.headers.cookie)[PUSH_COOKIE];
  const subscribed = device ? Boolean(await Push.exists({ user: actor._id, deviceHash: digest(device), enabled: true, sessionVersion: actor.sessionVersion || 0 })) : false;
  return { ...pushConfiguration(), subscribed };
}
export async function dispatchStockPush({ now = new Date(), limit = 20, deadline = Date.now() + 20000, send } = {}) {
  if (!send && !pushConfiguration().configured) return { accepted: 0, configured: false };
  const sender = send || ((subscription, payload, topic) => webpush.sendNotification(subscription, JSON.stringify(payload), {
    vapidDetails: { publicKey: process.env.STOCK_ALERT_VAPID_PUBLIC_KEY, privateKey: process.env.STOCK_ALERT_VAPID_PRIVATE_KEY, subject: process.env.STOCK_ALERT_VAPID_SUBJECT },
    TTL: 120, timeout: 5000, urgency: "normal", topic,
  }));
  let checked = 0, accepted = 0;
  while (checked++ < Math.min(limit, 50) && Date.now() < deadline) {
    const lease = randomUUID();
    const delivery = await Delivery.findOneAndUpdate({ status: "pending", dueAt: { $lte: now }, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }] }, { $set: { lease, leaseUntil: new Date(now.getTime() + 30000) }, $inc: { attempts: 1 } }, { sort: { dueAt: 1, _id: 1 }, new: true }).lean();
    if (!delivery) break;
    const finish = values => Delivery.updateOne({ _id: delivery._id, lease }, { $set: { ...values, lease: null, leaseUntil: null } });
    try {
      const subscription = await Push.findById(delivery.subscription).select("+endpoint +keys.p256dh +keys.auth").lean();
      const note = await Note.findById(delivery.notification).lean();
      const actor = subscription && await User.findById(subscription.user).select("+sessionVersion").lean();
      const current = note && actor && await actionableNotification(note, actor, now);
      if (!subscription?.enabled || !current?.active || current.snoozed || Number(subscription.sessionVersion || 0) !== Number(actor?.sessionVersion || 0) || delivery.attempts > 5) { await finish({ status: "cancelled" }); continue; }
      validatePushSubscription(subscription);
      // No item, stock, user or confidential title is put on the push wire.
      // The service worker fetches the fresh, authorized note before displaying.
      await sender({ endpoint: subscription.endpoint, keys: subscription.keys }, { type: "stock-alert", notification: String(note._id) }, digest(`${note.rule}:${note.incident}`).slice(0, 32));
      await finish({ status: "sent", acceptedAt: now }); accepted++;
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) await Push.updateOne({ _id: delivery.subscription }, { $set: { enabled: false } });
      const permanent = [400, 401, 403, 404, 410].includes(error.statusCode) || error instanceof ValidationError || delivery.attempts >= 5;
      await finish({ status: permanent ? "failed" : "pending", dueAt: new Date(now.getTime() + Math.min(3600000, 60000 * 2 ** delivery.attempts)) });
    }
  }
  return { accepted, configured: true };
}
