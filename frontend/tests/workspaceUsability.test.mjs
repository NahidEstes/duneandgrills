import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizePreferences, preferenceKey, safeViewFilters, visibleTableColumns } from "../src/components/ui/tablePreferences.js";
import { readDialogForm } from "../src/components/ui/useDialogChanges.js";

test("table preferences are bounded and scoped by account, role and page", () => {
  const user = { _id: "a", role: "admin" };
  assert.notEqual(preferenceKey(user, "stock"), preferenceKey({ ...user, _id: "b" }, "stock"));
  assert.notEqual(preferenceKey(user, "stock"), preferenceKey({ ...user, role: "manager" }, "stock"));
  assert.notEqual(preferenceKey(user, "stock"), preferenceKey(user, "staff"));
  assert.equal(preferenceKey(null, "stock"), null);
  const normalized = normalizePreferences({ pageSize: 999999, hidden: ["a", {}, 42], views: [null, { id: "1", name: "x".repeat(100), filters: { search: "hello", password: { nested: true } } }] }, 25);
  assert.equal(normalized.pageSize, 25); assert.deepEqual(normalized.hidden, ["a"]);
  assert.equal(normalized.views[0].name.length, 60); assert.deepEqual(normalized.views[0].filters, { search: "hello" });
});

test("restoring a saved view only applies known filters with matching types", () => {
  const saved = JSON.parse('{"search":"Chicken","status":"inactive","pageSize":100,"role":"admin","__proto__":{"polluted":true}}');
  assert.deepEqual(safeViewFilters(saved, { search: "", status: "", pageSize: "20" }), { search: "Chicken", status: "inactive", pageSize: "20" });
  assert.equal({}.polluted, undefined);
});

test("column choices keep identifiers, selection and actions available", () => {
  const columns = [{ key: "select" }, { key: "id", required: true }, { key: "amount" }, { key: "actions" }];
  assert.deepEqual(visibleTableColumns(columns, columns.map(column => column.key)).map(column => column.key), ["select", "id", "actions"]);
  assert.deepEqual(visibleTableColumns(columns, ["old-column"]), columns);
});

test("draft comparison includes text, checkbox, custom select and date values", () => {
  const control = (tagName, type, value, checked, textContent, role, popup) => ({ tagName, type, value, checked, textContent, getAttribute: key => key === "role" ? role : key === "aria-haspopup" ? popup : null });
  const controls = [control("INPUT", "text", "Old"), control("INPUT", "checkbox", "on", false), control("BUTTON", "button", "", false, "Cash", "combobox"), control("BUTTON", "button", "", false, "21 Oct 2026", null, "dialog")];
  const root = { querySelectorAll: () => controls };
  const initial = readDialogForm(root);
  for (const [index, property, value] of [[0, "value", "New"], [1, "checked", true], [2, "textContent", "Card"], [3, "textContent", "22 Oct 2026"]]) {
    const old = controls[index][property]; controls[index][property] = value;
    assert.notEqual(readDialogForm(root), initial);
    controls[index][property] = old; assert.equal(readDialogForm(root), initial);
  }
});

const require = createRequire(import.meta.url);
const source = transform => {
  const code = require("next/dist/build/swc").transformSync(readFileSync(new URL("../src/components/ui/ResourceStatus.jsx", import.meta.url), "utf8"), { jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } }).code;
  const mod = { exports: {} }; new Function("require", "module", "exports", code)(require, mod, mod.exports);
  return renderToStaticMarkup(React.createElement(mod.exports.default, transform));
};

test("freshness distinguishes failed initial load, retained data and a real success time", () => {
  const fail = source({ error: new Error("Fixture unavailable"), hasData: false });
  assert.match(fail, /Data could not be loaded/); assert.doesNotMatch(fail, /Last updated/);
  const retained = source({ error: new Error("Fixture unavailable"), hasData: true, lastSuccessAt: Date.UTC(2026, 9, 21, 9) });
  assert.match(retained, /previously loaded data/); assert.match(retained, /Last updated/); assert.match(retained, /Riyadh/);
  const pending = source({ refreshing: true, hasData: true, lastSuccessAt: Date.UTC(2026, 9, 21, 9) });
  assert.match(pending, /Updating data/); assert.doesNotMatch(pending, /Data loaded/);
});
