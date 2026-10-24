import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import workerSource from "../src/pwa/workerSource.js";

function fixture() {
  const handlers = new Map(), displayed = [], opened = [];
  let transport = async () => new Response("{}", { status: 401 });
  const self = { addEventListener: (name, callback) => handlers.set(name, callback), clients: { openWindow: async url => opened.push(url) }, registration: { showNotification: async (title, options) => displayed.push({ title, ...options }), getNotifications: async () => displayed.map(note => ({ ...note, close: () => { note.closed = true; } })) } };
  vm.runInNewContext(workerSource, { self, fetch: (...args) => transport(...args), Response, URL });
  const event = async (kind, fields) => { let pending; handlers.get(kind)({ ...fields, waitUntil: task => { pending = task; } }); await pending; };
  return { handlers, displayed, opened, event, transport: value => { transport = value; } };
}
test("stock push rechecks the current session and fresh incident without caching", async () => {
  const worker = fixture(), id = "a".repeat(24);
  const push = () => worker.event("push", { data: { json: () => ({ type: "stock-alert", notification: id }) } });
  await push(); assert.equal(worker.displayed.length, 0);
  worker.transport(async (url, options) => { assert.equal(url, `/api/inventory/stock-alerts/notifications/${id}`); assert.equal(options.credentials, "include"); assert.equal(options.cache, "no-store"); return Response.json({ data: { active: true, snoozed: false, title: "Low stock: Sauce", body: "0.8 kg", incident: "owned-incident", item: id } }); });
  await push(); assert.equal(worker.displayed.length, 1);
  worker.transport(async () => Response.json({ data: { active: false } })); await push(); assert.equal(worker.displayed.length, 1);
  worker.transport(async () => Response.json({ data: { active: true, snoozed: true } })); await push(); assert.equal(worker.displayed.length, 1);
  worker.transport(async () => { throw Error("offline"); }); await push(); assert.equal(worker.displayed.length, 1);
});
test("account change suppresses an in-flight old-account notification and preserves Kitchen routing", async () => {
  const worker = fixture(); let finish;
  worker.transport(() => new Promise(resolve => { finish = resolve; }));
  const pending = worker.event("push", { data: { json: () => ({ type: "stock-alert", notification: "b".repeat(24) }) } });
  await worker.event("message", { data: { type: "CLEAR_STOCK_NOTIFICATIONS" } });
  finish(Response.json({ data: { active: true, title: "Private old title" } })); await pending;
  assert.equal(worker.displayed.length, 0);
  await worker.event("notificationclick", { notification: { close() {}, data: { kind: "stock-alert", item: "c".repeat(24) } } });
  await worker.event("notificationclick", { notification: { close() {} } });
  assert.deepEqual(worker.opened, [`/inventory/low-stock-alerts?tab=current&item=${"c".repeat(24)}`, "/kitchen"]);
});
