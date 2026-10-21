import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { apiErrorMessage, formatDate } from "../src/components/inventory/inventoryUtils.js";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
const file = new URL("../src/components/inventory/SuppliersPage.jsx", import.meta.url);
const code = transformSync(readFileSync(file, "utf8"), {
  filename: file.pathname,
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  module: { type: "commonjs" },
}).code;

function renderPage(resource) {
  const container = ({ children }) => React.createElement("div", null, children);
  const ui = {
    Badge: container,
    Button: ({ children, ...props }) => React.createElement("button", props, children),
    EmptyState: ({ title, action }) => React.createElement("div", null, title, action),
    LoadingState: () => React.createElement("div", null, "Loading suppliers"),
    Modal: ({ open, children }) => open ? children : null,
    Money: ({ value }) => String(value ?? 0),
    PageHeader: ({ title, actions }) => React.createElement("header", null, title, actions),
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(id => {
    if (id.endsWith("/useInventoryResource.js")) return () => ({ reload: async () => {}, ...resource });
    if (id.endsWith("/ResourceStatus.jsx")) return () => null;
    if (id.endsWith("/InventoryUI.jsx")) return ui;
    if (id.endsWith("/inventoryUtils.js")) return { apiErrorMessage, formatDate };
    if (id.endsWith("/RecordId.jsx")) return ({ value }) => value;
    if (id.endsWith("/SupplierForm.jsx")) return () => null;
    if (id.endsWith("/inventoryApi.js")) return {};
    return require(id);
  }, mod, mod.exports);
  return renderToStaticMarkup(React.createElement(mod.exports.default));
}

test("a failed initial supplier request renders recovery instead of crashing on null data", () => {
  const html = renderPage({ data: null, loading: false, error: new Error("Supplier API unavailable") });
  assert.match(html, /role="alert"/);
  assert.match(html, /Supplier API unavailable/);
  assert.match(html, /Retry/);
  assert.doesNotMatch(html, /No suppliers yet/);
});

test("loading, a successful empty list and populated suppliers remain distinct", () => {
  assert.match(renderPage({ data: null, loading: true, error: null }), /Loading suppliers/);
  assert.match(renderPage({ data: [], loading: false, error: null }), /No suppliers yet/);
  const html = renderPage({ data: [{ _id: "supplier-1", name: "Test Supplier", code: "SUP-001", isActive: true, purchaseCount: 2, totalPurchases: 45 }], loading: false, error: null });
  assert.match(html, /Test Supplier/);
  assert.match(html, /SUP-001/);
  assert.doesNotMatch(html, /No suppliers yet/);
});
