import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { DEFAULT_NOTIFICATION_SETTINGS, normalizeNotificationSettings, RESTAURANT_SETTINGS_UPDATED_EVENT } from "../src/utils/notificationSettings.js";

// Exercise the hook's notification callback without a server, timers, browser permissions or real API.
// Its scheduler/race/authorization behavior is covered separately by refreshController.test.mjs.
const require = createRequire(import.meta.url), { transformSync } = require("next/dist/build/swc");
const path = new URL("../src/hooks/useAdminOrderAlerts.js", import.meta.url);
const transformed = transformSync(readFileSync(path, "utf8"), { filename: path.pathname, jsc: { parser: { syntax: "ecmascript" } }, module: { type: "commonjs" } });
function hookHarness() {
  const values = [], resources = [], toasts = [], notifications = [], changes = []; let index = 0;
  const react = {
    useState(initial) { const slot = index++; if (!(slot in values)) values[slot] = initial; return [values[slot], value => { values[slot] = typeof value === "function" ? value(values[slot]) : value; }]; },
    useRef(initial) { const slot = index++; values[slot] ??= { current: initial }; return values[slot]; },
    useCallback: callback => callback, useEffect() {},
  };
  const localRequire = id => id === "react" ? react : id === "sonner" ? { toast: { warning: (...args) => toasts.push(["warning", ...args]), info: (...args) => toasts.push(["info", ...args]) } } : id.includes("useFreshResource") ? { useFreshResource: options => { resources.push(options); return { refresh() {}, stop() {} }; } } : id.includes("AuthContext") ? { useAuth: () => ({ user: { _id: "admin-fixture", role: "admin" } }) } : id.includes("notificationSettings") ? { DEFAULT_NOTIFICATION_SETTINGS, normalizeNotificationSettings, RESTAURANT_SETTINGS_UPDATED_EVENT } : id.includes("currency") ? { formatPrice: value => `${value} SAR` } : id.includes("api.js") ? { fetchOrders() {}, fetchRestaurantSettings() {} } : require(id);
  const compiledModule = { exports: {} }; new Function("require", "module", "exports", transformed.code)(localRequire, compiledModule, compiledModule.exports);
  const previousWindow = globalThis.window;
  globalThis.window = { Notification: class { static permission = "granted"; constructor(title) { notifications.push(title); } }, focus() {} };
  const render = () => { index = 0; resources.length = 0; return compiledModule.exports.useAdminOrderAlerts({ onPendingOrdersChange: (...args) => changes.push(args) }); };
  render();
  return { values, toasts, notifications, changes, render, resources, poll: orders => resources[1].onData(orders), dispose: () => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; } };
}
const order = id => ({ _id: id, orderNumber: id, totalAmount: 20, items: [{ quantity: 1 }], customer: { name: "Dummy" } });

test("first pending success, retries and returning known orders never duplicate new-order notifications", () => {
  const h = hookHarness();
  try {
    assert.equal(h.render().pendingCount, null);
    h.poll([order("1")]); assert.equal(h.toasts[0][0], "info"); assert.equal(h.render().pendingCount, 1);
    assert.equal(h.changes[0][1].initial, true); assert.equal(h.notifications.length, 0);
    h.poll([order("1")]); assert.equal(h.toasts.length, 1); assert.equal(h.changes.length, 1);
    h.poll([order("1"), order("2")]); assert.equal(h.notifications.length, 1); assert.equal(h.toasts.length, 2);
    assert.equal(h.changes[1][1].initial, false); assert.equal(h.render().pendingCount, 2);
    h.poll([]); h.poll([order("2")]); h.poll([order("2")]);
    assert.equal(h.toasts.length, 2); assert.equal(h.notifications.length, 1);
  } finally { h.dispose(); }
});

test("successful empty polling is known zero; processing device notifications cannot fail API health", () => {
  const h = hookHarness();
  try {
    h.poll([]); assert.equal(h.render().pendingCount, 0); assert.equal(h.toasts.length, 0);
    globalThis.window.Notification = class { static permission = "granted"; constructor() { throw new Error("Device does not support notifications"); } };
    assert.doesNotThrow(() => h.poll([order("1")])); assert.equal(h.render().pendingCount, 1); assert.equal(h.toasts.length, 1);
    assert.equal(h.resources[1].pauseWhenHidden, false); assert.equal(h.resources[1].intervalMs, DEFAULT_NOTIFICATION_SETTINGS.pollingIntervalSeconds * 1000);
    assert.equal(h.resources[1].retryMaxMs, 60_000);
  } finally { h.dispose(); }
});

test("a long session cannot evict still-pending IDs and flood duplicate notifications", () => {
  const h = hookHarness();
  try {
    const orders = Array.from({ length: 5001 }, (_, index) => order(String(index)));
    h.poll(orders); h.poll(orders); h.poll([]); h.poll([orders[0]]);
    assert.equal(h.toasts.length, 1); assert.equal(h.notifications.length, 0);
    h.render().stopMonitoring(); assert.equal(h.render().pendingCount, null);
  } finally { h.dispose(); }
});
