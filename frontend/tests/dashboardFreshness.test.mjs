import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as freshness from "../src/components/admin/dashboardFreshness.js";
import * as adminUi from "../src/components/admin/adminUi.js";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
const components = new Map();
function component(name) {
  if (components.has(name)) return components.get(name);
  const path = new URL(`../src/components/admin/${name}.jsx`, import.meta.url);
  const transformed = transformSync(readFileSync(path, "utf8"), { filename: path.pathname, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const compiledModule = { exports: {} };
  const localRequire = id => id === "./dashboardFreshness.js" ? freshness : id === "./adminUi.js" ? adminUi : id === "../SmartImage.jsx" ? () => null : id.endsWith(".jsx") ? component(id.replace("./", "").replace(".jsx", "")) : require(id);
  new Function("require", "module", "exports", transformed.code)(localRequire, compiledModule, compiledModule.exports);
  components.set(name, compiledModule.exports.default); return compiledModule.exports.default;
}
const render = (name, props) => renderToStaticMarkup(React.createElement(component(name), props));
const initial = { status: "loading", data: null, lastSuccessAt: null, refreshing: false, error: null };
const status = summary => render("DashboardDataStatus", { summary, monitoring: initial, settingsHealth: initial });

test("initial loading and persistent failure never claim live data or successful timestamps", () => {
  assert.match(status(initial), /Loading summary/); assert.match(status(initial), /No successful summary update yet/);
  const failure = status({ ...initial, status: "error", errorKind: "server", error: "Server unavailable" });
  assert.match(failure, /role="alert"/); assert.match(failure, /Retry summary/); assert.match(failure, /Summary unavailable/);
  assert.doesNotMatch(failure, /refreshed now|Live data|Last Successful Update/);
  const overview = render("DashboardOverview", { data: null, loading: false });
  assert.match(overview, /Dashboard summary unavailable/); assert.doesNotMatch(overview, /Total Orders|SAR 0/);
});

test("retained stale data has warning and accessible exact Riyadh timestamp; recovery clears warning", () => {
  const summary = { ...initial, status: "stale", lastSuccessAt: Date.parse("2026-10-07T21:01:02Z"), errorKind: "server", error: "API failed" };
  const html = status(summary);
  assert.match(html, /Last successful data is retained/); assert.match(html, /Summary may be outdated/);
  assert.match(html, /dateTime="2026-10-07T21:01:02.000Z"/i); assert.match(html, /aria-label="Last successful update:.*Asia\/Riyadh/);
  const recovered = status({ ...summary, status: "success", error: null });
  assert.match(recovered, /Summary updated/); assert.doesNotMatch(recovered, /retained|Summary may be outdated/);
});

test("successful empty results show real zeros while missing metrics and collections are unavailable", () => {
  const empty = render("DashboardOverview", { data: { stats: { totalOrders: 0, totalRevenue: 0 }, recentOrders: [], menuPreview: [], offers: [], reviews: [], blogPosts: [] }, loading: false });
  assert.match(empty, /Total Orders/); assert.match(empty, /SAR 0\.00/); assert.match(empty, /No recent orders/);
  const missing = render("DashboardOverview", { data: { stats: {} }, loading: false });
  assert.match(missing, /—/); assert.match(missing, /Recent orders unavailable/); assert.match(missing, /Inventory Health unavailable/);
  assert.doesNotMatch(missing, /SAR 0\.00|refreshed now|Live data/);
});

test("order monitoring and offline warnings remain independent of successful summary", () => {
  const html = render("DashboardDataStatus", { summary: { ...initial, status: "success", lastSuccessAt: Date.now() }, monitoring: { ...initial, status: "error", error: "Browser offline.", offline: true }, settingsHealth: initial });
  assert.match(html, /Summary updated/); assert.match(html, /Order monitoring failed/); assert.match(html, /does not mean there are no pending orders/); assert.match(html, /Retry order monitoring/);
  assert.match(status({ ...initial, status: "error", offline: true, error: "Reconnect" }), /Browser offline/);
});
