import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
function load(relative, overrides = {}) {
  const file = new URL(relative, import.meta.url);
  const code = transformSync(readFileSync(file, "utf8"), { filename: file.pathname, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } }).code;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(id => id in overrides ? overrides[id] : require(id), mod, mod.exports);
  return mod.exports;
}
const { DataTable } = load("../src/components/inventory/InventoryUI.jsx", {
  "./inventoryUtils.js": {}, "../ui/useDialogChanges.js": {},
});
function render(resource) {
  const box = ({ children }) => React.createElement("div", null, children);
  const page = load("../src/components/admin/customers/CustomersPage.jsx", {
    "../../ui/ResourceStatus.jsx": ({ error }) => error ? React.createElement("p", { role: "alert" }, error.message, " Retry data") : null,
    "../../ui/TableTools.jsx": { __esModule: true, default: ({ columns }) => React.createElement("div", null, `${columns.length} columns`), useTablePreferences: () => ({ pageSize: 20, visibleColumns: columns => columns }) },
    "../../inventory/useInventoryResource.js": () => ({ reload: async () => {}, ...resource }),
    "../../inventory/InventoryUI.jsx": { DataTable },
    "@/src/components/ui/RecordId.jsx": ({ value }) => React.createElement("code", null, value),
    "../../ui/DarkSelect.jsx": ({ children, ...props }) => React.createElement("select", props, children),
    "../../../api/api.js": {},
    "../../SmartImage.jsx": ({ src }) => React.createElement("img", { src, alt: "" }),
    "../adminUi.js": { formatAdminCurrency: value => `SAR ${value.toFixed(2)}`, formatAdminDate: () => "22 Oct 2026" },
    "./CustomerDetailsDrawer.jsx": () => null,
    "./customerUi.jsx": { customerCardClass: "", customerInputClass: "", EmptySection: box, Pagination: () => null, SectionLoading: ({ label }) => label },
  });
  return renderToStaticMarkup(React.createElement(page.default));
}
test("Customers renders during initial load, request failure and an empty successful result", () => {
  assert.match(render({ data: null, loading: true, error: null }), /Loading customer directory/);
  const failed = render({ data: null, loading: false, error: new Error("Customer directory unavailable") });
  assert.match(failed, /Customer directory unavailable/); assert.match(failed, /Retry data/); assert.doesNotMatch(failed, /No customers match/);
  assert.match(render({ data: { data: [], pagination: {} }, loading: false }), /No customers match/);
});
test("every customer column renders its own row, including avatar, contact, analytics and details action", () => {
  const first = { _id: "a", customerNumber: "CUS-000001", name: "Amina", email: "amina@example.test", avatar: "/avatar.png", phone: "0501111111", createdAt: "2026-10-22", totalOrders: 4, validOrders: 3, totalSpent: 87.5, lastOrderAt: "2026-10-22", pointsBalance: 12 };
  const second = { ...first, _id: "b", customerNumber: "CUS-000002", name: "Bashir", email: "bashir@example.test", avatar: null, phone: "", totalOrders: 0, validOrders: 0, totalSpent: 0, lastOrderAt: null, pointsBalance: 0 };
  const html = render({ data: { data: [first, second], pagination: { total: 2 } }, loading: false });
  for (const text of ["7 columns", "Amina", "Bashir", "CUS-000001", "CUS-000002", "amina@example.test", "bashir@example.test", "0501111111", "No phone saved", "SAR 87.50", "SAR 0.00", "No orders", "12 pts", "0 pts", "/avatar.png"]) assert.ok(html.includes(text), text);
  assert.equal((html.match(/View details/g) || []).length, 2);
});
