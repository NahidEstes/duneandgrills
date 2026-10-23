import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedNavigation, navigationPreferences, navigationGroups } from "../src/components/inventory/inventoryNavigation.js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as quantities from "../src/utils/preparationUnits.js";
const entries = [["Stock", "/inventory/stock-items"], ["Invoices", "/inventory/supplier-invoices", null, ["admin", "manager", "accountant"]], ["Settings", "/inventory/settings", null, ["admin", "manager"]], ["Help", "/tips-and-tricks"]];
test("navigation preferences cannot reveal inaccessible routes across roles or accept arbitrary favourites", () => {
  const accountant = allowedNavigation("accountant", entries);
  assert.deepEqual(accountant.map(row => row[1]), ["/inventory/supplier-invoices", "/tips-and-tricks"]);
  assert.deepEqual(allowedNavigation("customer", entries), []);
  assert.deepEqual(navigationPreferences({ pinned: ["/inventory/settings", "/inventory/stock-items", "/inventory/supplier-invoices", "/inventory/supplier-invoices", "javascript:bad"], collapsed: ["Stock", "Unknown"] }, accountant), { pinned: ["/inventory/supplier-invoices"], collapsed: ["Stock"] });
  assert.equal(new Set(navigationGroups.flatMap(([, paths]) => paths)).size, navigationGroups.flatMap(([, paths]) => paths).length);
});
test("stock breakdown renders server evidence, missing data and mismatch limitations without assuming zero", () => {
  const require = createRequire(import.meta.url), { transformSync } = require("next/dist/build/swc");
  const file = new URL("../src/components/inventory/StockEligibilityBreakdown.jsx", import.meta.url);
  const code = transformSync(readFileSync(file, "utf8"), { filename: file.pathname, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } }).code;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(id => id.endsWith("/preparationUnits.js") ? quantities : require(id), mod, mod.exports);
  const view = props => renderToStaticMarkup(React.createElement(mod.exports.default, props));
  assert.match(view({}), /evidence is unavailable/);
  const html = view({ breakdown: { unit: "kg", physicalStock: 12, saleableStock: 8, buckets: { expired: 4 }, basis: "saved_batches", reconciled: true } });
  assert.match(html, /12 kg/); assert.match(html, /8 kg/); assert.match(html, /4 kg/);
  const mismatch = view({ breakdown: { unit: "kg", physicalStock: 12, saleableStock: 8, buckets: { expired: 8 }, batchExcessQuantity: 4, reconciled: false } });
  assert.match(mismatch, /not a complete division of physical stock/); assert.match(mismatch, /exceeds physical stock by 4 kg/);
});
