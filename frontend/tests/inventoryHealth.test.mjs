import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { inventoryHealthOptions, initialInventoryStatus } from "../src/components/inventory/inventoryHealthFilters.js";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
const componentPath = new URL("../src/components/admin/InventoryHealthSummary.jsx", import.meta.url);
const localRequire = name => name === "./dashboardFreshness.js" ? { dashboardNumber: value => typeof value === "number" ? value.toLocaleString() : "—" } : require(name);
const transformed = transformSync(readFileSync(componentPath, "utf8"), { filename: componentPath.pathname, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
const compiledModule = { exports: {} }; new Function("require", "module", "exports", transformed.code)(localRequire, compiledModule, compiledModule.exports);
const InventoryHealthSummary = compiledModule.exports.default;
// Read the server-owned destinations so this test cannot pass using a different set of links.
const backend = readFileSync(new URL("../../backend/services/inventoryHealthService.js", import.meta.url), "utf8");
const entries = [...backend.matchAll(/(\w+): "(\/inventory\/[^\"]+)"/g)].map(match => [match[1], match[2]]);
const destinations = Object.fromEntries(entries);

test("summary renders server-provided counts, metric units, inclusive expiry and every filtered link", () => {
  const html = renderToStaticMarkup(React.createElement(InventoryHealthSummary, { summary: { destinations, lowStock: 2, outOfStock: 3, blockedItems: 4, expiredItems: 1, expiryAlertDays: 7 } }));
  for (const href of Object.values(destinations)) assert.ok(html.includes(`href="${href}"`), href);
  assert.match(html, /Expired \/ Blocked Stock · 4 items/); assert.match(html, /unique active items/);
  assert.match(html, /today through \+7 Riyadh days/); assert.match(html, /categories can overlap/);
  assert.match(html, /physical versus saleable/); assert.match(html, /Orders · ordered or partially received/);
  assert.match(renderToStaticMarkup(React.createElement(InventoryHealthSummary, {})), /Inventory Health unavailable/);
});

test("all stock warning destinations are supported by the shared filter options", () => {
  assert.ok(entries.length >= 11);
  for (const [, href] of entries.filter(([, value]) => value.includes("stock-items"))) {
    const status = new URL(href, "http://local.test").searchParams.get("status");
    assert.equal(initialInventoryStatus(status), status);
    assert.ok(inventoryHealthOptions.some(([value]) => value === status));
  }
  assert.equal(initialInventoryStatus("unsupported"), ""); assert.equal(initialInventoryStatus(["out"]), "");
});

test("route awaits query parameters and passes filters to keyed destination components", () => {
  const route = readFileSync(new URL("../app/inventory/[section]/page.jsx", import.meta.url), "utf8");
  assert.match(route, /await searchParams/); assert.match(route, /initialStatus=/); assert.match(route, /initialState=/);
  const dispatch = readFileSync(new URL("../src/components/inventory/InventorySectionPage.jsx", import.meta.url), "utf8");
  assert.match(dispatch, /StockItemsPage key=\{initialStatus\} initialStatus=\{initialStatus\}/);
  assert.match(dispatch, /PurchaseOrdersPage key=\{initialStatus\}/); assert.match(dispatch, /PurchasingActionCenterPage key=\{initialState\}/);
});
