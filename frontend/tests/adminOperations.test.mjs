import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as operations from "../src/utils/adminOperations.js";
import * as orders from "../src/utils/adminOrders.js";
import * as freshness from "../src/components/admin/dashboardFreshness.js";
import { createRefreshController } from "../src/utils/refreshController.js";

const require = createRequire(import.meta.url), { transformSync } = require("next/dist/build/swc");
const compile = (relative, imports) => {
  const path = new URL(relative, import.meta.url);
  const code = transformSync(readFileSync(path, "utf8"), { filename: path.pathname, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } }).code;
  const mod = { exports: {} }; new Function("require", "module", "exports", code)(id => imports[id] || require(id), mod, mod.exports); return mod.exports;
};
const Panel = compile("../src/components/admin/OperationsOverview.jsx", { "../../utils/adminOperations.js": operations, "../../utils/adminOrders.js": orders, "./dashboardFreshness.js": freshness }).default;
const stamp = "2028-03-01T09:00:00.000Z";
const snapshot = () => ({ generatedAt: stamp, pendingAttentionMinutes: 5, categories: Object.fromEntries(Object.keys(operations.ATTENTION_LABELS).map(key => [key, { status: "success", total: 0, items: [], limit: 3 }])), shifts: { status: "success", enabled: false } });
const render = resource => renderToStaticMarkup(React.createElement(Panel, { resource, orderHref: (id, attention) => orders.adminOrdersHref("period=month&recentStatus=pending", { tab: "orders", order: id, attention, status: null }) }));

test("initial loading/error, partial category failure and genuine empty results are distinct", () => {
  assert.match(render({ status: "loading" }), /Loading operational overview/);
  const failed = render({ status: "error", error: "Server failed" });
  assert.match(failed, /role="alert"/); assert.match(failed, /Unavailable · not verified clear/); assert.doesNotMatch(failed, /No matching records|Last snapshot/);
  const data = snapshot(); data.categories.invoice_review = { status: "unavailable" };
  const partial = render({ status: "success", data });
  assert.match(partial, /Invoice review.*?—/); assert.equal((partial.match(/No matching records/g) || []).length, 4);
  assert.match(partial, /POS shifts are disabled/); assert.match(partial, /Threshold: 5 min/);
  const empty = render({ status: "success", data: snapshot() });
  assert.equal((empty.match(/No matching records/g) || []).length, 5);
  assert.match(empty, /dateTime="2028-03-01T09:00:00.000Z"/i); assert.match(empty, /Asia\/Riyadh/);
});

test("stale retained results and recovery are honest; session/permission revocation hide old financial data", () => {
  const data = snapshot(); data.categories.invoice_overdue = { status: "success", total: 1, limit: 3, items: [{ _id: "invoice", internalReference: "PRIVATE-ID", dueDate: stamp, outstandingAmount: 60 }] };
  assert.match(render({ status: "stale", data, error: "Browser offline" }), /Operations may be outdated/);
  assert.match(render({ status: "stale", data, error: "Browser offline" }), /PRIVATE-ID/);
  assert.doesNotMatch(render({ status: "success", data }), /Operations may be outdated/);
  for (const errorKind of ["session", "permission"]) assert.doesNotMatch(render({ status: "stale", data, errorKind, error: "Access denied" }), /PRIVATE-ID|SAR 60/);
  data.categories.invoice_overdue = { status: "restricted" }; data.shifts = { status: "restricted" };
  const restricted = render({ status: "success", data }); assert.doesNotMatch(restricted, /Overdue payable|PRIVATE-ID/); assert.match(restricted, /restricted to shift-management permissions/);
});

test("category links preserve reporting period and open exact orders or matching purchasing filters", () => {
  const href = (id, attention) => orders.adminOrdersHref("period=week&recentStatus=preparing", { tab: "orders", order: id, attention });
  const orderLink = new URL(operations.attentionHref("pending_age", { _id: "exact" }, href), "https://test.local");
  assert.equal(orderLink.searchParams.get("order"), "exact"); assert.equal(orderLink.searchParams.get("period"), "week");
  const list = new URL(operations.attentionHref("preparation_overdue", null, href), "https://test.local"); assert.equal(list.searchParams.get("attention"), "preparation_overdue"); assert.equal(list.searchParams.get("period"), "week");
  for (const [category, status] of [["purchase_approval", "submitted"], ["invoice_review", "review_required"], ["invoice_overdue", "overdue"]]) {
    const link = new URL(operations.attentionHref(category, { orderNumber: "CODE 1", internalReference: "REF 1" }), "https://test.local");
    assert.equal(link.searchParams.get("status"), status); assert.equal(link.searchParams.get("search"), "CODE 1");
  }
  assert.equal(new URL(operations.shiftHistoryHref("closed", "abc"), "https://test.local").searchParams.get("shift"), "abc");
});

test("compact responsive and keyboard links show identifiers, priorities, limits and unknown legacy cash honestly", () => {
  const data = snapshot(); data.categories.pending_age = { status: "success", total: 7, limit: 3, items: [{ _id: "a", orderNumber: "ORDER-1", createdAt: stamp }] };
  data.shifts = { status: "success", enabled: true, openCount: 1, closedCount: 1, limit: 3, varianceThreshold: 50, open: [{ _id: "open", shiftNumber: "SHIFT-OPEN", cashier: "Dummy", terminal: "Main", openedAt: stamp, expectedCash: 123 }], closed: [{ _id: "closed", shiftNumber: "SHIFT-CLOSED", cashier: "Dummy", terminal: "Main", closedAt: stamp, expectedCash: null, countedCash: null, difference: null, varianceStatus: "unavailable" }] };
  const html = render({ status: "success", data });
  for (const text of ["Medium priority", "ORDER-1", "Showing 1 of 7", "max 3", "SHIFT-OPEN", "Expected drawer", "SAR 123", "missing recorded difference", "independent of sales period"]) assert.ok(html.includes(text), text);
  assert.match(html, /sm:grid-cols-2/); assert.match(html, /focus-visible:outline/); assert.match(html, /href="\/pos\?shiftHistory=closed/);
  assert.match(html, /<dd[^>]*>—<\/dd>/); assert.doesNotMatch(html, /onClick="|Net profit|SAR 0\.00/);
});

test("operations refresh coalesces manual/focus requests, retains failures and cleans up without notifications", async () => {
  const requests = [], states = [], target = new EventTarget(), documentTarget = new EventTarget(); documentTarget.hidden = false;
  const controller = createRefreshController({ target, documentTarget, online: () => true, fetcher: () => new Promise((resolve, reject) => requests.push({ resolve, reject })), onState: state => states.push(state) });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  try {
    controller.start(); controller.refresh("manual"); target.dispatchEvent(new Event("focus")); await flush(); assert.equal(requests.length, 1);
    requests[0].resolve(snapshot()); await flush(); assert.equal(states.at(-1).status, "success");
    controller.refresh("manual"); await flush(); requests[1].reject({ response: { status: 503 } }); await flush();
    assert.equal(states.at(-1).status, "stale"); assert.equal(states.at(-1).data.generatedAt, stamp);
    controller.refresh("manual"); await flush(); const data = snapshot(); data.categories.invoice_review = { status: "unavailable" }; requests[2].resolve(data); await flush();
    assert.equal(states.at(-1).data.categories.invoice_review.total, undefined);
    controller.refresh("manual"); await flush(); controller.dispose(); const count = states.length; requests[3].resolve(snapshot()); await flush(); assert.equal(states.length, count);
  } finally { controller.dispose(); }
});

test("existing shift dialog accepts dashboard deep links only after unlock and manager authorization", async () => {
  const slots = [], requests = []; let cursor = 0, dirty = false, effects = [], output, props;
  const react = {
    useState(initial) { const index = cursor++; slots[index] ||= { value: initial }; return [slots[index].value, next => { slots[index].value = typeof next === "function" ? next(slots[index].value) : next; dirty = true; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useCallback(fn, deps) { const index = cursor++, previous = slots[index]; if (!previous || deps.some((value, n) => !Object.is(value, previous.deps[n]))) slots[index] = { deps, fn }; return slots[index].fn; },
    useEffect(fn, deps) { const index = cursor++, previous = slots[index]; if (!previous || deps.some((value, n) => !Object.is(value, previous.deps[n]))) effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; }); },
  };
  const api = { fetchCurrentPosShift: async () => ({ config: { enabled: true }, data: null }), fetchPosCashiers: async () => [], fetchPosShifts: async params => { requests.push(params); return { data: [], pagination: { page: 1, pages: 0, total: 0 } }; }, fetchPosShift: async id => { requests.push(id); return { shift: { _id: id }, totals: {} }; } };
  const Control = compile("../src/components/pos/PosShiftControl.jsx", { react, "react-dom": { createPortal: node => node }, "@/src/api/api.js": api, "@/src/hooks/usePosDialog.js": () => null, "@/src/components/ui/RecordId.jsx": () => null, "@/src/components/ui/DarkSelect.jsx": () => null, "./PosShiftPrintSummary.jsx": () => null, sonner: { toast: { error() {}, success() {} } } }).default;
  function draw(next = props) { props = next; let count = 0; do { cursor = 0; dirty = false; effects = []; output = Control(props); effects.forEach(run => run()); assert.ok(++count < 10); } while (dirty); return output; }
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); return draw(); };
  const previousDocument = globalThis.document; globalThis.document = { body: {} };
  try {
    draw({ user: { _id: "manager", name: "Manager", role: "manager" }, terminal: "MAIN", locked: true, shiftLink: { history: "closed", id: "exact" } }); await flush(); assert.equal(requests.length, 0);
    draw({ ...props, locked: false }); await flush(); assert.deepEqual(requests, [{ limit: 10, page: 1, state: "closed" }, "exact"]);
    const html = renderToStaticMarkup(output); assert.match(html, /role="dialog"/); assert.match(html, /Previous/); assert.match(html, /Next/); assert.match(html, /No matching shifts/);
    draw({ ...props, user: { _id: "cashier", role: "cashier" } }); await flush(); assert.equal(requests.length, 2);
  } finally { slots.forEach(slot => slot?.cleanup?.()); globalThis.document = previousDocument; }
});
