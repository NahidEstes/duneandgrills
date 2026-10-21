import assert from "node:assert/strict";
import { test } from "node:test";
import { collectInventoryReport, inventoryReportCsvHeaders } from "../src/components/inventory/inventoryReportExport.js";
import { inventoryNavigationAllowed, inventoryPageRoles } from "../src/components/inventory/inventoryAccess.js";

const records = Array.from({ length: 237 }, (_, index) => ({ _id: `row-${index}`, amount: index }));
const response = (rows, page, total = records.length) => ({ data: rows, pagination: { page, limit: 100, total, pages: Math.ceil(total / 100) } });

test("all filtered report pages are collected without changing captured filters", async () => {
  const requests = [], progress = [];
  const filters = { type: "supplier", supplier: "supplier-a", from: "2026-10-01", to: "2026-10-21" };
  const rows = await collectInventoryReport(async params => {
    requests.push(params);
    return response(records.slice((params.page - 1) * 100, params.page * 100), params.page);
  }, filters, value => progress.push(value.loaded));
  assert.deepEqual(rows, records);
  assert.deepEqual(requests, [1, 2, 3].map(page => ({ ...filters, page, limit: 100 })));
  assert.deepEqual(progress, [100, 200, 237]);
  assert.equal(filters.page, undefined);
});

test("a later-page failure never produces a partial export", async () => {
  await assert.rejects(collectInventoryReport(async ({ page }) => {
    if (page === 2) throw new Error("Unavailable");
    return response(records.slice(0, 100), page);
  }, {}), /Unavailable/);
});

test("changed totals, repeated IDs, missing records and malformed pagination reject", async () => {
  for (const variant of ["changed-total", "duplicate", "short-page", "bad-pages"]) {
    await assert.rejects(collectInventoryReport(async ({ page }) => {
      const result = response(records.slice((page - 1) * 100, page * 100), page);
      if (variant === "changed-total" && page === 2) result.pagination.total++;
      if (variant === "duplicate" && page === 2) result.data[0] = records[0];
      if (variant === "short-page") result.data.pop();
      if (variant === "bad-pages") result.pagination.pages = 900;
      return result;
    }, {}), /incomplete|changed/);
  }
  assert.deepEqual(await collectInventoryReport(async () => response([], 1, 0), {}), []);
});

test("CSV keeps numeric amounts and escapes spreadsheet formulas in text", () => {
  const row = { _id: "id", name: '=HYPERLINK("bad")', amount: -12.34, quantity: 0, supplier: { name: "nested" } };
  const headers = inventoryReportCsvHeaders([row]);
  assert.deepEqual(headers.map(([key, read]) => [key, read(row)]), [["name", "'=HYPERLINK(\"bad\")"], ["amount", -12.34], ["quantity", 0]]);
});

test("accountant access is limited to payables and read-only purchasing actions", () => {
  for (const path of ["/inventory/supplier-invoices", "/inventory/purchasing-actions"]) {
    assert.ok(inventoryPageRoles(path).includes("accountant"));
    assert.equal(inventoryNavigationAllowed("accountant", path), true);
  }
  for (const path of ["/inventory", "/inventory/stock-in", "/inventory/settings", "/inventory/inventory-count"]) {
    assert.equal(inventoryPageRoles(path).includes("accountant"), false);
    assert.equal(inventoryNavigationAllowed("accountant", path), false);
    assert.ok(inventoryPageRoles(path).includes("admin"));
    assert.equal(inventoryNavigationAllowed("inventory", path), true);
  }
});
