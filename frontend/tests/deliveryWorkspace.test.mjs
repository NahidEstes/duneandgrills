import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDeliveryWorkspace, emptyDeliveryQuery } from "../src/components/admin/delivery/deliveryWorkspace.js";

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { resolve, reject, promise }; };
const row = (id = "A", revision = 0) => ({ id, revision, orderRevision: 0, deliveryStatus: "unassigned", restaurantStatus: "ready", cashReport: { status: "none" } });
const result = (deliveries = [row()]) => ({ deliveries, mode: "operational" });
const tick = () => new Promise(resolve => setImmediate(resolve));

test("only explicit commands load; concurrent identical refresh/search is deduplicated", async () => {
  const task = deferred(); let requests = 0;
  const workspace = createDeliveryWorkspace({ list: () => { requests++; return task.promise; }, detail: async () => ({ data: row() }) });
  const draft = emptyDeliveryQuery(); for (const character of "TEST-ORDER") draft.search += character;
  draft.status = "delivered"; assert.equal(requests, 0);
  const first = workspace.load({ ...draft, page: 1 }); const second = workspace.load({ ...draft, page: 1 });
  assert.equal(requests, 1); assert.equal(first, second); task.resolve(result()); await first;
  assert.equal(workspace.snapshot().query.search, "TEST-ORDER"); assert.ok(workspace.snapshot().stamp);
  workspace.dispose();
});

test("refresh keeps rows/selection; failure is stale, successful empty query retains exact selected detail", async () => {
  let fail = false, task;
  const workspace = createDeliveryWorkspace({ list: async () => { if (task) return task.promise; if (fail) throw Error("Server down"); return result(); }, detail: async id => ({ data: row(id), mode: "operational" }) });
  await workspace.load(); workspace.select(row()); await tick(); const successful = workspace.snapshot();
  fail = true; task = deferred(); const refresh = workspace.load();
  assert.equal(workspace.snapshot().data, successful.data); assert.equal(workspace.snapshot().selected.id, "A");
  task.reject(Error("Server down")); await refresh;
  assert.equal(workspace.snapshot().error, "Server down"); assert.equal(workspace.snapshot().stamp, successful.stamp);
  task = null; fail = false; await workspace.load(); assert.equal(workspace.snapshot().error, "");
  task = deferred(); const empty = workspace.load({ ...emptyDeliveryQuery(), search: "other" }); task.resolve(result([])); await empty;
  assert.equal(workspace.snapshot().data.deliveries.length, 0); assert.equal(workspace.snapshot().selected.id, "A"); workspace.dispose();
});

test("new server revision/payment data requires review; pending mutation cannot select another record", async () => {
  let revision = 0;
  const workspace = createDeliveryWorkspace({ list: async () => result(), detail: async id => ({ data: row(id, revision), mode: "operational" }) });
  await workspace.load(); workspace.select(row()); await tick(); revision++;
  await workspace.load(); assert.equal(workspace.snapshot().changed, true); assert.equal(workspace.snapshot().selected.revision, 1);
  workspace.review(); assert.equal(workspace.snapshot().changed, false);
  workspace.lock(true); assert.equal(workspace.select(row("B")), false); await workspace.load(); assert.equal(workspace.snapshot().selected.id, "A");
  workspace.lock(false); workspace.select(row("B")); await tick(); assert.equal(workspace.snapshot().selected.id, "B"); workspace.dispose();
});

test("out-of-order list and detail responses, unmount, logout and revoked access are safe", async () => {
  const old = deferred(), latest = deferred(), details = new Map(); let requests = 0, unauthorized = 0;
  const workspace = createDeliveryWorkspace({ list: () => (++requests === 1 ? old : latest).promise,
    detail: id => { const task = deferred(); details.set(id, task); return task.promise; }, onUnauthorized: () => unauthorized++ });
  const first = workspace.load(); const second = workspace.load({ ...emptyDeliveryQuery(), search: "new" }); latest.resolve(result([row("B")])); await second;
  old.resolve(result()); await first; assert.equal(workspace.snapshot().data.deliveries[0].id, "B");
  workspace.select(row("A")); workspace.select(row("B")); details.get("B").resolve({ data: row("B", 2) }); await tick(); details.get("A").resolve({ data: row("A", 3) }); await tick();
  assert.equal(workspace.snapshot().selected.id, "B");
  workspace.select(row("C")); details.get("C").reject(Object.assign(Error("Expired"), { response: { status: 401 } })); await tick();
  assert.equal(unauthorized, 1); assert.equal(workspace.snapshot().data, null); assert.equal(workspace.snapshot().selected, null);
  workspace.dispose(); assert.equal(workspace.select(row("D")), false);
});

test("admin source has no polling/focus reload, draft handlers do not fetch, details key is stable", () => {
  const ui = readFileSync(new URL("../src/components/admin/delivery/DeliveryManagement.jsx", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../src/hooks/useDeliveryManagement.js", import.meta.url), "utf8");
  const filters = readFileSync(new URL("../src/components/admin/delivery/DeliveryFilters.jsx", import.meta.url), "utf8");
  for (const code of [ui, hook]) assert.doesNotMatch(code, /setInterval|setTimeout|addEventListener|WebSocket|EventSource/);
  assert.match(filters, /onChange=\{event => editDraft\("search", event.target.value\)\}/);
  assert.match(filters, /<form onSubmit=/); assert.match(ui, /<ManagementDeliveryDetails key=\{selected.id\}/);
  assert.doesNotMatch(ui, /selected.id\}-\$\{/);
});

test("selection verifies list revision against exact detail, and a mismatched ID cannot inherit drafts", async () => {
  let wrongId = false;
  const workspace = createDeliveryWorkspace({ list: async () => result(), detail: async id => ({ data: row(wrongId ? "UNRELATED" : id, 1) }) });
  await workspace.load(); workspace.select(row("A", 0)); await tick();
  assert.equal(workspace.snapshot().changed, true, "A list row that became stale before selection requires review");
  workspace.review(); wrongId = true; await workspace.load();
  assert.match(workspace.snapshot().detailError, /Unexpected selected/); assert.equal(workspace.snapshot().selected.id, "A");
  workspace.dispose();
});
