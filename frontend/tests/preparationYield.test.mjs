import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as quantities from "../src/utils/preparationUnits.js";

const require = createRequire(import.meta.url), { transformSync } = require("next/dist/build/swc");
function load(name, overrides = {}) {
  const file = new URL(`../src/components/inventory/${name}.jsx`, import.meta.url);
  const code = transformSync(readFileSync(file, "utf8"), { filename: file.pathname, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } }).code;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(id => {
    if (id.endsWith("/preparationUnits.js")) return quantities;
    if (Object.hasOwn(overrides, id)) return overrides[id];
    return require(id);
  }, mod, mod.exports);
  return mod.exports;
}
const evidenceModule = load("ProductionYieldEvidence"), Evidence = evidenceModule.default;
const markup = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const fixture = () => ({ unit: "g", comparable: true, actualInputQuantity: 1000, expectedOutputQuantity: 900, actualOutputQuantity: 850, lossQuantity: 150, gainQuantity: 0, outputShortfallQuantity: 50, outputSurplusQuantity: 0, yieldPercent: 85 });
const metrics = html => Object.fromEntries([...html.matchAll(/<dt[^>]*>([^<]+)<\/dt><dd[^>]*>([^<]+)<\/dd>/g)].map(match => [match[1], match[2]]));

test("yield evidence displays server figures, separate loss/shortfall and recorded explanation safely", () => {
  const html = markup(Evidence, { evidence: fixture(), explanation: "Extra trimming <script>" }), values = metrics(html);
  assert.equal(values["Total preparation loss"], "150 g"); assert.equal(values["Output below expected"], "50 g");
  assert.equal(values["Usable yield"], "85%"); assert.match(html, /Extra trimming &lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  const server = markup(Evidence, { evidence: { ...fixture(), lossQuantity: 123, yieldPercent: 77 } });
  assert.equal(metrics(server)["Total preparation loss"], "123 g", "UI does not reconstruct server arithmetic");
  assert.equal(metrics(server)["Usable yield"], "77%");
});
test("unknown physical loss remains unknown while valid output variance stays available", () => {
  const html = markup(Evidence, { evidence: { ...fixture(), comparable: false, actualInputQuantity: null, lossQuantity: null, yieldPercent: null, unavailableReason: "Mixed g and ml" } });
  assert.match(html, /Physical loss unavailable/); assert.match(html, /Mixed g and ml/);
  assert.equal(metrics(html)["Total preparation loss"], undefined); assert.equal(metrics(html)["Output below expected"], "50 g");
  assert.match(html, /Yield explanation: Not recorded/);
  assert.match(markup(Evidence, {}), /Yield evidence is unavailable/);
});
test("reversed batches show exclusion and preview does not invent a saved explanation", () => {
  const reversed = markup(Evidence, { evidence: fixture(), reversed: true });
  assert.match(reversed, /Reversed batch/); assert.match(reversed, /excluded from report totals/);
  const preview = markup(Evidence, { evidence: fixture(), preview: true });
  assert.doesNotMatch(preview, /Yield explanation:/); assert.match(preview, /preview/);
});

function report(resource) {
  const container = ({ children }) => React.createElement("div", null, children);
  const Report = load("ProductionYieldReport", {
    "@/src/api/inventoryApi.js": {}, "./useInventoryResource.js": () => ({ reload: async () => {}, ...resource }),
    "./ProductionYieldEvidence.jsx": evidenceModule,
    "../ui/DarkSelect.jsx": ({ children, ...props }) => React.createElement("select", props, children),
    "../ui/DarkDatePicker.jsx": () => null,
    "./InventoryUI.jsx": { cardClass: "", inputClass: "", Button: ({ children, variant: _variant, ...props }) => React.createElement("button", props, children), Badge: container, Field: container, LoadingState: ({ label }) => label, Pagination: () => null, InventoryLoadError: ({ error }) => error ? React.createElement("p", { role: "alert" }, error.message) : null },
  }).default;
  return markup(Report, { recipes: [], revision: 0, onViewBatch() {} });
}
const empty = () => ({ data: [], summary: [], coverage: { completed: 0, excludedReversed: 0, unavailable: 0 }, range: { from: "2026-10-23", to: "2026-10-23" }, generatedAt: "2026-10-23T10:00:00Z", pagination: { page: 1, total: 0 } });
test("yield report distinguishes loading, failed initial fetch, successful empty range and retained stale results", () => {
  assert.match(report({ data: null, loading: true }), /Loading yield report/);
  const failed = report({ data: null, loading: false, error: new Error("Owned report unavailable") });
  assert.match(failed, /Owned report unavailable/); assert.match(failed, /Retry to verify the figures/); assert.doesNotMatch(failed, /No production batches/);
  assert.match(report({ data: empty(), loading: false }), /No production batches in this date range/);
  const data = { ...empty(), data: [{ _id: "batch", productionNumber: "OWNED-PRD", preparedAt: "2026-10-23T10:00:00Z", status: "completed", yield: fixture() }] };
  const retained = report({ data, loading: false, error: new Error("Refresh failed"), refreshing: false });
  assert.match(retained, /Refresh failed/); assert.match(retained, /OWNED-PRD/); assert.match(retained, /150 g/); assert.match(retained, /Last updated/);
});
