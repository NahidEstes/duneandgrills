import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import webpush from "web-push";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import User from "../models/User.js";
import InventoryCategory from "../models/InventoryCategory.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryBatch from "../models/InventoryBatch.js";
import StockTransaction from "../models/StockTransaction.js";
import { StockAlertRule as Rule, StockAlertNotification as Note, StockAlertReceipt as Receipt, StockAlertPush as Push, StockAlertDelivery as Delivery } from "../models/StockAlert.js";
import { saveAlertRule, evaluateAlertRule, evaluateDueAlerts, notificationInbox, actOnNotification, currentAlerts } from "../services/stockAlertService.js";
import { dispatchStockPush, subscribeStockPush, revokeStockPushDevice, stockPushStatus } from "../services/stockAlertPushService.js";
import { worker, vercelCronWorker } from "../controllers/inventory/stockAlertController.js";
import inventoryRoutes from "../routes/inventoryRoutes.js";
import { csrfProtection } from "../middleware/security.js";

process.env.NODE_ENV = "test";
test("stock alert lifecycle against an isolated disposable replica", { timeout: 120000 }, async t => withIsolatedMongo(async ({ uri }) => {
  const user = await User.create({ name: "Alert admin", email: "alert-admin@fixture.invalid", password: "OwnedAlertPassword123!", role: "admin" });
  const other = await User.create({ name: "Alert colleague", email: "alert-other@fixture.invalid", password: "OwnedAlertPassword123!", role: "storekeeper" });
  const reader = await User.create({ name: "Alert reader", email: "alert-reader@fixture.invalid", password: "OwnedAlertPassword123!", role: "accountant" });
  const customer = await User.create({ name: "Customer", email: "alert-customer@fixture.invalid", password: "OwnedAlertPassword123!", role: "customer" });
  const category = await InventoryCategory.create({ name: "Alert sauces", skuPrefix: "ALR" });
  let count = 0;
  const stock = (extra={}) => InventoryItem.create({ name: `Sauce ${++count}`, sku: `ALR-${count}`, category: category._id, unit: "kg", currentStock: .8, reorderLevel: .5, ...extra });
  const item = await stock();
  const body = extra => ({ item: String(item._id), enabled: true, lowEnabled: true, outEnabled: true, enteredThreshold: 1000, enteredUnit: "g", mode: "repeat", repeatMinutes: 30, dailyTime: "10:00", recipients: [String(user._id), String(other._id)], ...extra });
  const at = time => new Date(`2026-10-24T${time}:00+03:00`);
  let rule = await saveAlertRule(user, body(), null, at("10:00"));
  const balance = async () => (await InventoryItem.findById(item._id)).currentStock;
  await t.test("additive migration can be rerun without changing inventory or saved rules", async () => {
    const beforeBalance = await balance(), beforeRule = await Rule.findById(rule._id).lean();
    for (let attempt = 0; attempt < 2; attempt++) {
      const migration = spawnSync(process.execPath, ["data/ensureStockAlertIndexes.js"], { cwd: path.resolve(import.meta.dirname, ".."), env: { ...process.env, MONGO_URI: uri }, windowsHide: true, encoding: "utf8", timeout: 20000 });
      assert.equal(migration.status, 0, migration.stderr);
    }
    assert.equal(await balance(), beforeBalance);
    assert.deepEqual(await Rule.findById(rule._id).lean(), beforeRule);
    assert.equal(await StockTransaction.countDocuments(), 0);
    const indexes = await Rule.collection.listIndexes().toArray();
    assert.ok(indexes.some(index => index.unique && index.key.item === 1));
  });
  await t.test("rule permission, uniqueness, zero threshold, and no inventory side effects", async () => {
    assert.equal(rule.threshold, 1); assert.equal(await balance(), .8); assert.equal(await StockTransaction.countDocuments(), 0);
    assert.equal((await saveAlertRule(user, body({ expectedVersion: rule.version }), rule._id)).version, rule.version, "An unchanged save must not reset the incident or create a new version");
    await assert.rejects(saveAlertRule(reader, body()), error => error.status === 403);
    await assert.rejects(saveAlertRule(user, body({ recipients: [String(customer._id)] })), /recipient/);
    await assert.rejects(saveAlertRule(user, body()), error => error.status === 409);
    await assert.rejects(saveAlertRule(user, body({ expectedVersion: 999 }), rule._id), error => error.status === 409);
    const zero = await stock({ currentStock: 0 });
    const disabled = await saveAlertRule(user, body({ item: String(zero._id), enabled: false, enteredThreshold: 0 }));
    await evaluateAlertRule(disabled._id, at("10:00"));
    assert.equal(await Note.countDocuments({ rule: disabled._id }), 0);
  });
  await t.test("first alert, concurrent evaluation, repeat, snooze and recovery", async () => {
    await Promise.all([evaluateAlertRule(rule._id, at("10:00")), evaluateAlertRule(rule._id, at("10:00"))]);
    assert.equal(await Note.countDocuments({ rule: rule._id }), 2);
    const first = await Note.findOne({ rule: rule._id, user: user._id }).lean();
    const unchanged = await saveAlertRule(user, body({ expectedVersion: rule.version }), rule._id);
    assert.equal(unchanged.incident, first.incident); assert.equal(await Note.countDocuments({ rule: rule._id, status: "active" }), 2);
    await actOnNotification(user, first._id, { action: "read" }, at("10:01"));
    await actOnNotification(user, first._id, { action: "snooze", minutes: 60 }, at("10:01"));
    await assert.rejects(actOnNotification(other, first._id, { action: "dismiss" }), error => error.status === 404);
    await evaluateAlertRule(rule._id, at("10:30"));
    assert.equal(await Note.countDocuments({ rule: rule._id, user: user._id }), 1);
    assert.equal(await Note.countDocuments({ rule: rule._id, user: other._id }), 2);
    assert.equal((await notificationInbox(other, {}, at("10:30"))).unread, 1);
    // A stock recovery is read fresh even before the worker reconciles it.
    await InventoryItem.updateOne({ _id: item._id }, { $set: { currentStock: 2.5 } });
    assert.equal((await notificationInbox(other, {}, at("10:45"))).unread, 0);
    await evaluateAlertRule(rule._id, at("10:45")); await evaluateAlertRule(rule._id, at("11:00"));
    assert.equal(await Note.countDocuments({ rule: rule._id }), 3);
    assert.equal((await Rule.findById(rule._id)).incident, null);
    assert.equal(await StockTransaction.countDocuments(), 0);
    await InventoryItem.updateOne({ _id: item._id }, { $set: { currentStock: .8 } });
    await evaluateAlertRule(rule._id, at("11:05"));
    const fresh = await Rule.findById(rule._id).lean(); assert.notEqual(fresh.incident, first.incident);
    await InventoryItem.updateOne({ _id: item._id }, { $set: { currentStock: 0 } });
    await evaluateAlertRule(rule._id, at("11:06"));
    assert.equal((await Note.findOne({ rule: rule._id }).sort({ createdAt: -1 }).lean()).severity, "out");
  });
  await t.test("daily schedule respects Riyadh time, catches up once, and recovers between checks", async () => {
    const dailyItem = await stock();
    const daily = await saveAlertRule(user, body({ item: String(dailyItem._id), mode: "daily" }), null, at("09:00"));
    await evaluateAlertRule(daily._id, at("09:59")); assert.equal(await Note.countDocuments({ rule: daily._id }), 0);
    await evaluateAlertRule(daily._id, at("10:00")); await evaluateAlertRule(daily._id, at("10:30"));
    assert.equal(await Note.countDocuments({ rule: daily._id }), 2);
    await evaluateAlertRule(daily._id, new Date("2026-10-27T11:00:00+03:00"));
    assert.equal(await Note.countDocuments({ rule: daily._id }), 4, "not a multi-day backlog");
    await InventoryItem.updateOne({ _id: dailyItem._id }, { $set: { currentStock: 2 } });
    await evaluateAlertRule(daily._id, new Date("2026-10-27T11:01:00+03:00"));
    assert.equal((await Rule.findById(daily._id)).incident, null);
  });
  await t.test("usable eligibility, watched filtering and counts use the same definition", async () => {
    const blocked = await stock({ currentStock: 2, tracksExpiry: true });
    await InventoryBatch.create({ item: blocked._id, receivedQuantity: 2, remainingQuantity: 2, unitCost: 1, expiryDate: new Date("2026-10-23"), receivedAt: new Date("2026-10-20"), lotNumber: "EXPIRED", source: "STOCK_IN" });
    const watched = await saveAlertRule(user, body({ item: String(blocked._id) }));
    await evaluateAlertRule(watched._id, at("10:00"));
    const last = await Note.findOne({ rule: watched._id }).lean(); assert.equal(last.quantity, 0); assert.equal(last.severity, "out");
    const current = await currentAlerts(user, { item: String(blocked._id), scope: "watched", limit: 1 }, at("10:00"));
    assert.equal(current.summary.out, 1); assert.equal(current.data[0].physicalStock, 2); assert.equal(current.data[0].saleableStock, 0);
    const all = await currentAlerts(user, { limit: 1 }, at("10:00")); assert.ok(all.pagination.total > all.data.length);
  });
  await t.test("config edits cancel stale work, preserve purchasing settings and recipient revocation", async () => {
    const current = await Rule.findById(rule._id).lean();
    rule = await saveAlertRule(user, body({ enabled: false, expectedVersion: current.version }), rule._id, at("11:10"));
    assert.equal(await Note.countDocuments({ rule: rule._id, status: "active" }), 0);
    assert.equal((await InventoryItem.findById(item._id)).reorderLevel, .5);
    await User.updateOne({ _id: other._id }, { $set: { role: "customer" } });
    await assert.rejects(notificationInbox({ ...other.toObject(), role: "customer" }, {}, at("11:10")), error => error.status === 403);
  });
  await t.test("push outbox retries, duplicates, recovery and expired leases", async () => {
    const pushItem = await stock();
    const pushed = await saveAlertRule(user, body({ item: String(pushItem._id), recipients: [String(user._id)] }));
    const sub = await Push.create({ user: user._id, sessionVersion: 0, endpoint: "https://fcm.googleapis.com/fcm/send/fixture", endpointHash: "owned-hash", deviceHash: "owned-device", keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) } });
    await evaluateAlertRule(pushed._id, at("10:00"));
    let calls = 0;
    await dispatchStockPush({ now: at("10:00"), send: async () => { calls++; throw Error("temporary"); } });
    assert.equal(calls, 1);
    await dispatchStockPush({ now: at("10:03"), send: async (_subscription, payload) => { calls++; assert.deepEqual(Object.keys(payload), ["type", "notification"]); } });
    await dispatchStockPush({ now: at("10:03"), send: async () => { calls++; } }); assert.equal(calls, 2);
    await evaluateAlertRule(pushed._id, at("10:30"));
    await InventoryItem.updateOne({ _id: pushItem._id }, { $set: { currentStock: 2.5 } });
    await dispatchStockPush({ now: at("10:31"), send: async () => { calls++; } }); assert.equal(calls, 2, "no stale reminder after recovery");
    await InventoryItem.updateOne({ _id: pushItem._id }, { $set: { currentStock: .8 } });
    await evaluateAlertRule(pushed._id, at("11:00"));
    await Delivery.updateMany({ status: "pending" }, { $set: { lease: "dead-worker", leaseUntil: at("10:59") } });
    await dispatchStockPush({ now: at("11:00"), send: async () => { calls++; } }); assert.equal(calls, 3);
    await Push.updateOne({ _id: sub._id }, { $set: { enabled: false } });
  });
  await t.test("transaction failure rolls back both incident and notifications", async () => {
    const failedItem = await stock(), failed = await saveAlertRule(user, body({ item: String(failedItem._id), recipients: [String(user._id)] }));
    const original = Note.create; Note.create = async () => { throw Error("Owned write failure"); };
    try { await assert.rejects(evaluateAlertRule(failed._id, at("10:00")), /Owned write failure/); } finally { Note.create = original; }
    assert.equal((await Rule.findById(failed._id)).incident, null);
    assert.equal(await Receipt.countDocuments({ rule: failed._id }), 0);
    await Rule.updateMany({ enabled: true }, { $set: { nextEvaluationAt: at("10:00"), lease: "stale", leaseUntil: at("09:59") } });
    const result = await evaluateDueAlerts({ now: at("10:00"), limit: 1 }); assert.equal(result.checked, 1);
  });
  await t.test("device subscriptions bind to the account, hide keys and revoke on logout", async () => {
    const keys = webpush.generateVAPIDKeys();
    const names = ["STOCK_ALERT_VAPID_PUBLIC_KEY", "STOCK_ALERT_VAPID_PRIVATE_KEY", "STOCK_ALERT_VAPID_SUBJECT"];
    const previous = names.map(name => process.env[name]);
    [process.env.STOCK_ALERT_VAPID_PUBLIC_KEY, process.env.STOCK_ALERT_VAPID_PRIVATE_KEY, process.env.STOCK_ALERT_VAPID_SUBJECT] = [keys.publicKey, keys.privateKey, "mailto:fixture@example.invalid"];
    let device;
    const response = { cookie(_name, value) { device = value; }, clearCookie() {} };
    const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/owned-device", keys: { p256dh: keys.publicKey, auth: Buffer.alloc(16).toString("base64url") } };
    try {
      const req = { headers: {} };
      assert.deepEqual(await subscribeStockPush(user, subscription, req, response), { subscribed: true });
      req.headers.cookie = `dg_stock_push_device=${device}`;
      assert.equal((await stockPushStatus(user, req)).subscribed, true);
      const stored = await Push.findOne({ endpointHash: { $ne: "owned-hash" } }).lean();
      assert.equal(stored.endpoint, undefined); assert.equal(stored.keys?.p256dh, undefined);
      await subscribeStockPush(reader, subscription, req, response);
      assert.equal((await stockPushStatus(user, req)).subscribed, false); assert.equal((await stockPushStatus(reader, req)).subscribed, true);
      await revokeStockPushDevice(req, response); assert.equal((await stockPushStatus(reader, req)).subscribed, false);
    } finally { names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; }); }
  });
  await t.test("HTTP permissions, CSRF, private reads and machine scheduler authentication", async () => {
    const previousJwt = process.env.JWT_SECRET, previousWorker = process.env.STOCK_ALERT_WORKER_SECRET, previousCron = process.env.CRON_SECRET;
    process.env.JWT_SECRET = "owned-stock-http-fixture"; process.env.STOCK_ALERT_WORKER_SECRET = "owned-stock-worker-secret-32-characters";
    process.env.CRON_SECRET = "owned-vercel-cron-secret-32-characters";
    const app = express(); app.use(express.json()); app.use(csrfProtection); app.post("/api/jobs/stock-alerts", worker); app.get("/api/jobs/stock-alerts/cron", vercelCronWorker); app.use("/api/inventory", inventoryRoutes);
    app.use((error, _req, res, _next) => res.status(error.status || 400).json({ success: false, message: error.message }));
    const server = await new Promise(resolve => { const handle = app.listen(0, "127.0.0.1", () => resolve(handle)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const token = actor => jwt.sign({ id: actor._id, sv: 0 }, process.env.JWT_SECRET);
    try {
      const readerHeaders = { Authorization: `Bearer ${token(reader)}`, "Content-Type": "application/json" };
      const current = await fetch(origin + "/api/inventory/stock-alerts/current", { headers: readerHeaders }); assert.equal(current.status, 200); assert.match(current.headers.get("cache-control"), /no-store/);
      assert.equal((await fetch(origin + "/api/inventory/stock-alerts/rules", { method: "POST", headers: readerHeaders, body: "{}" })).status, 403);
      assert.equal((await fetch(origin + "/api/inventory/stock-alerts/current", { headers: { Authorization: `Bearer ${token(customer)}` } })).status, 403);
      const count = await Rule.countDocuments();
      assert.equal((await fetch(origin + "/api/inventory/stock-alerts/rules", { method: "POST", headers: { Cookie: `dg_session=${token(user)}; dg_csrf=fixture`, "Content-Type": "application/json" }, body: JSON.stringify(body()) })).status, 403);
      assert.equal(await Rule.countDocuments(), count);
      assert.equal((await fetch(origin + "/api/jobs/stock-alerts", { method: "POST" })).status, 403);
      assert.equal((await fetch(origin + "/api/jobs/stock-alerts")).status, 404);
      const before = await Note.countDocuments();
      await fetch(origin + "/api/inventory/stock-alerts/current", { headers: readerHeaders }); await fetch(origin + "/api/inventory/stock-alerts/notifications", { headers: readerHeaders }); assert.equal(await Note.countDocuments(), before);
      const result = await fetch(origin + "/api/jobs/stock-alerts", { method: "POST", headers: { Authorization: `Bearer ${process.env.STOCK_ALERT_WORKER_SECRET}` } }); assert.equal(result.status, 200);
      const cronUrl = origin + "/api/jobs/stock-alerts/cron";
      assert.equal((await fetch(cronUrl)).status, 403);
      assert.equal((await fetch(cronUrl, { headers: { Authorization: `Bearer ${process.env.STOCK_ALERT_WORKER_SECRET}` } })).status, 403, "POST worker secret cannot authorize Vercel cron");
      const cronHeaders = { Authorization: `Bearer ${process.env.CRON_SECRET}` };
      assert.equal((await fetch(cronUrl, { headers: { ...cronHeaders, Cookie: "unrelated=browser" } })).status, 403);
      const beforeProbe = await Note.countDocuments();
      const head = await fetch(cronUrl, { method: "HEAD", headers: cronHeaders }); assert.equal(head.status, 405); assert.equal(head.headers.get("allow"), "GET");
      assert.equal(await Note.countDocuments(), beforeProbe, "HEAD probe must never execute a job");
      const cron = await fetch(cronUrl, { headers: cronHeaders }); assert.equal(cron.status, 200); assert.equal((await cron.json()).success, true); assert.match(cron.headers.get("cache-control"), /no-store/);
      assert.equal((await fetch(origin + "/api/jobs/stock-alerts", { method: "POST", headers: cronHeaders })).status, 403, "Cron secret cannot authorize POST worker");
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (previousJwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousJwt; if (previousWorker === undefined) delete process.env.STOCK_ALERT_WORKER_SECRET; else process.env.STOCK_ALERT_WORKER_SECRET = previousWorker; if (previousCron === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previousCron; }
  });
}));
