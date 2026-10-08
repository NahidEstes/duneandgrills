import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as periods from "../src/utils/dashboardPeriods.js";
import * as adminUi from "../src/components/admin/adminUi.js";
import * as freshness from "../src/components/admin/dashboardFreshness.js";
import { adminOrdersHref } from "../src/utils/adminOrders.js";
import { createRefreshController } from "../src/utils/refreshController.js";

const require = createRequire(import.meta.url), { transformSync } = require("next/dist/build/swc");
function compiled(relative, imports) {
  const path = new URL(relative, import.meta.url);
  const code = transformSync(readFileSync(path, "utf8"), { filename: path.pathname, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } }).code;
  const mod = { exports: {} }; new Function("require", "module", "exports", code)(id => imports[id] || require(id), mod, mod.exports);
  return mod.exports;
}
const Controls = compiled("../src/components/admin/DashboardPeriodControls.jsx", { "../../utils/dashboardPeriods.js": periods, "./adminUi.js": adminUi }).default;
const Report = compiled("../src/components/admin/SalesReportSummary.jsx", { "./dashboardFreshness.js": freshness }).default;
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test("validated URL period preserves recent status, selected-order navigation and refresh/back state", () => {
  assert.equal(periods.normalizeDashboardPeriod(null), "today"); assert.equal(periods.normalizeDashboardPeriod("invalid"), "today");
  const query = new URLSearchParams("period=month&recentStatus=pending");
  const details = new URL(adminOrdersHref(query, { tab: "orders", status: "pending", order: "111111111111111111111111" }), "https://test.local");
  assert.equal(details.searchParams.get("period"), "month"); assert.equal(details.searchParams.get("recentStatus"), "pending");
  const back = new URL(adminOrdersHref(details.searchParams, { tab: "overview", order: null }), "https://test.local");
  assert.equal(back.searchParams.get("period"), "month");
  const change = new URL(adminOrdersHref(back.searchParams, { period: "week" }), "https://test.local");
  assert.equal(change.searchParams.get("recentStatus"), "pending"); assert.equal(change.searchParams.get("tab"), "overview");
});
test("period controls are responsive keyboard buttons with explicit Riyadh comparison and loading/stale states", () => {
  const initial = render(Controls, { period: "today", resource: { status: "loading" } });
  assert.match(initial, /Loading selected period/); assert.match(initial, /type="button" aria-pressed="true"/);
  assert.equal((initial.match(/<button/g) || []).length, 4); assert.match(initial, /flex-wrap/); assert.match(initial, /focus-visible:outline/);
  const reportingPeriod = { period: "month", label: "This Month", asOf: "2028-03-31T09:00:00Z", range: { start: "2028-02-29T21:00:00Z" }, comparison: { label: "Previous month", start: "2028-01-31T21:00:00Z", endExclusive: "2028-02-29T21:00:00Z" }, comparisonNote: "Current partial month versus the full shorter previous month." };
  const stale = render(Controls, { period: "month", resource: { status: "stale", data: { reportingPeriod } } });
  assert.match(stale, /Mar 1, 2028, 00:00/); assert.match(stale, /full shorter previous month/); assert.match(stale, /retained data may be outdated/);
  assert.match(stale, /Live operations below are independent/);
});
test("collapsed details retain accounting and missing-date warnings outside the disclosure", () => {
  const html = render(Report, { collapsible: true, compact: true, summary: { orderedAmount: 120, grossSales: 100, netSales: 90 }, activity: { unknownPaymentDateAmount: 30, unknownRefundDateAmount: 10, unknownDateScope: "Selected order-date cohort" } });
  const disclosure = html.indexOf("<details>");
  assert.match(html, /Show detailed reporting/); assert.doesNotMatch(html, /<details open/);
  for (const warning of ["Net sales is not profit", "Aggregator prepaid amounts", "Selected order-date cohort", "no dates were invented"]) assert.ok(html.indexOf(warning) < disclosure, warning);
  assert.match(html, /Dated payment \/ refund activity/);
  assert.match(html, /Ordered amount/); assert.doesNotMatch(html, /Gross sales \(after discounts\)/);
});

// Exercise the actual shared resource hook/controller lifecycle without a browser.
function harness() {
  const slots = [], requests = [], instances = [];
  let cursor = 0, dirty = false, effects = [], args, output, disposed = false;
  const react = {
    useState(initial) { const i = cursor++; slots[i] ||= { value: initial }; return [slots[i].value, value => { assert.equal(disposed, false); slots[i].value = value; dirty = true; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback(callback) { cursor++; return callback; },
    useEffect(effect, deps) { const i = cursor++, previous = slots[i]; if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; }); },
  };
  const controller = options => {
    const documentTarget = new EventTarget(); documentTarget.hidden = false;
    const instance = createRefreshController({ ...options, target: new EventTarget(), documentTarget, online: () => true });
    instances.push(instance); return instance;
  };
  const { useFreshResource: runResourceHook } = compiled("../src/hooks/useFreshResource.js", { react, "../utils/refreshController.js": { createRefreshController: controller } });
  function render(period = args?.period, user = args?.user ?? "admin") {
    args = { period, user };
    do {
      cursor = 0; dirty = false; effects = [];
      output = runResourceHook({ identity: user ? `${user}:${period}` : "", fetcher: options => new Promise((resolve, reject) => requests.push({ period, ...options, resolve, reject })) });
      const pending = effects; effects = []; pending.forEach(run => run());
    } while (dirty);
    return output;
  }
  return { render, requests, async flush() { await new Promise(resolve => setImmediate(resolve)); return render(); }, dispose() { slots.forEach(slot => slot?.cleanup?.()); instances.forEach(instance => instance.dispose()); disposed = true; } };
}
test("rapid period changes abort old requests; stale responses cannot relabel data, refresh preserves selection and logout clears it", async () => {
  const h = harness();
  try {
    h.render("today"); await h.flush();
    h.requests[0].resolve({ reportingPeriod: { period: "today" }, stats: { totalOrders: 1 } }); await h.flush();
    assert.equal(h.render("month").data, null); await h.flush();
    const month = h.requests[1];
    assert.equal(h.render("week").data, null); assert.equal(month.signal.aborted, true); await h.flush();
    h.requests[2].resolve({ reportingPeriod: { period: "week" }, stats: { totalOrders: 7 } });
    assert.equal((await h.flush()).data.stats.totalOrders, 7);
    month.resolve({ reportingPeriod: { period: "month" }, stats: { totalOrders: 31 } });
    assert.equal((await h.flush()).data.reportingPeriod.period, "week");
    h.render().refresh("manual"); await h.flush();
    assert.equal(h.requests[3].period, "week"); assert.equal(h.render().data.stats.totalOrders, 7);
    h.requests[3].reject({ response: { status: 503 } }); assert.equal((await h.flush()).status, "stale");
    assert.equal(h.render().data.reportingPeriod.period, "week");
    h.render().refresh("manual"); await h.flush(); h.requests[4].resolve({ reportingPeriod: { period: "week" }, stats: { totalOrders: 8 } });
    assert.equal((await h.flush()).status, "success");
    h.render().refresh("manual"); await h.flush(); const delayed = h.requests[5];
    assert.equal(h.render("week", "").data, null); assert.equal(delayed.signal.aborted, true);
    delayed.resolve({ stats: { totalOrders: 99 } }); assert.equal((await h.flush()).data, null);
  } finally { h.dispose(); }
});
