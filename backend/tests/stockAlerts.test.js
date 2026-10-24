import assert from "node:assert/strict";
import test from "node:test";
import { alertSeverity, normalizeAlertRule, recipientDue, riyadhClock } from "../services/stockAlertRules.js";
import { schedulerAuthorized, validatePushSubscription } from "../services/stockAlertPushService.js";

const base = { enabled: true, lowEnabled: true, outEnabled: true, threshold: 1, baseUnit: "kg" };
test("usable stock conditions distinguish threshold, zero and disabled conditions", () => {
  for (const [quantity, severity] of [[2,null],[1,"low"],[.8,"low"],[0,"out"]]) assert.equal(alertSeverity(base, { unit: "kg", saleableStock: quantity }), severity);
  assert.equal(alertSeverity({ ...base, outEnabled: false }, { unit: "kg", saleableStock: 0 }), null);
  assert.equal(alertSeverity({ ...base, enabled: false }, { unit: "kg", saleableStock: 0 }), null);
  assert.equal(alertSeverity({ ...base, threshold: 0 }, { unit: "kg", saleableStock: .1 }), null);
  assert.equal(alertSeverity(base, { unit: "g", saleableStock: 0 }), null);
  assert.equal(alertSeverity(base, { unit: "kg", saleableStock: 0, isActive: false }), null);
});
test("rule units, numeric validation and timing cannot be bypassed", () => {
  const body = { enabled: true, lowEnabled: true, outEnabled: true, enteredThreshold: 1000, enteredUnit: "g", mode: "repeat", repeatMinutes: 30, dailyTime: "10:00", recipients: ["actor"] };
  assert.equal(normalizeAlertRule(body, { unit: "kg" }).threshold, 1);
  for (const value of [null, true, "", -1, Infinity, "bad"]) assert.throws(() => normalizeAlertRule({ ...body, enteredThreshold: value }, { unit: "kg" }));
  assert.throws(() => normalizeAlertRule({ ...body, enteredUnit: "ml" }, { unit: "kg" }), /Unsupported conversion/);
  assert.throws(() => normalizeAlertRule({ ...body, lowEnabled: false, outEnabled: false }, { unit: "kg" }));
  assert.throws(() => normalizeAlertRule({ ...body, repeatMinutes: 1 }, { unit: "kg" }));
  assert.throws(() => normalizeAlertRule({ ...body, dailyTime: "25:00" }, { unit: "kg" }));
});
test("Riyadh clock, interval boundaries, escalation and snooze", () => {
  const now = new Date("2026-10-24T07:30:00Z");
  assert.deepEqual(riyadhClock(now), { day: "2026-10-24", time: "10:30" });
  const receipt = { lastSentAt: new Date("2026-10-24T07:00:00Z"), lastSeverity: "low", nextReminderAt: now };
  assert.equal(recipientDue({ mode: "repeat" }, receipt, "low", now), true);
  assert.equal(recipientDue({ mode: "repeat" }, { ...receipt, nextReminderAt: new Date(now.getTime()+1) }, "low", now), false);
  assert.equal(recipientDue({ mode: "repeat" }, { ...receipt, nextReminderAt: new Date(now.getTime()+1) }, "out", now), true);
  assert.equal(recipientDue({ mode: "repeat" }, { ...receipt, snoozedUntil: new Date(now.getTime()+1) }, "out", now), false);
  assert.equal(recipientDue({ mode: "daily" }, receipt, "low", now, false), false);
});
test("push endpoint validation blocks SSRF and scheduler fails closed", () => {
  const keys = { p256dh: "A".repeat(87), auth: "B".repeat(22) };
  for (const endpoint of ["http://fcm.googleapis.com/x", "https://127.0.0.1/x", "https://fcm.googleapis.com.evil.test/x", "https://fcm.googleapis.com:8443/x", "https://user@fcm.googleapis.com/x"]) assert.throws(() => validatePushSubscription({ endpoint, keys }));
  assert.equal(validatePushSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/test", keys }).endpoint, "https://fcm.googleapis.com/fcm/send/test");
  assert.equal(schedulerAuthorized("Bearer short", {}), false);
  assert.equal(schedulerAuthorized(`Bearer ${"x".repeat(32)}`, { STOCK_ALERT_WORKER_SECRET: "x".repeat(32) }), true);
});
