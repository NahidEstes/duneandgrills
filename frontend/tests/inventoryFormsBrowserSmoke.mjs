import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setFixtureSession } from "./helpers/fixtureSession.mjs";

// Own the frontend and its loopback backend. Browser APIs are intercepted;
// no real accounts, suppliers, inventory or configured database are accessed.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = process.env.INVENTORY_FORMS_ARTIFACT_DIR || path.join(os.tmpdir(), "dg-inventory-forms-review");
await fs.mkdir(artifacts, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixture = http.createServer((request, response) => {
  const role = /dg_session=owned-browser-(admin|customer)/.exec(request.headers.cookie || "")?.[1];
  const session = request.method === "GET" && request.url === "/api/auth/session";
  response.writeHead(session && role ? 200 : 503, { "Content-Type": "application/json" });
  response.end(JSON.stringify(session && role ? { user: { _id: "111111111111111111111111", name: "Owned fixture", role } } : { success: false, message: "Browser APIs must be intercepted" }));
});
await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
const reservation = net.createServer();
await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV: "production", BACKEND_API_URL: `http://127.0.0.1:${fixture.address().port}/api`, SITE_URL: origin, SITE_ENV: "staging", NEXT_TELEMETRY_DISABLED: "1" };
for (const key of Object.keys(env)) if (/MONGO|DATABASE|JWT_SECRET|API_PROXY_SECRET|TOKEN/i.test(key)) delete env[key];
const next = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let serverError;
let serverLog = "";
next.on("error", error => { serverError = error; });
next.stdout.on("data", value => { serverLog = (serverLog + value).slice(-4000); });
next.stderr.on("data", value => { serverLog = (serverLog + value).slice(-4000); });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (serverError) throw serverError;
    if (next.exitCode !== null) throw new Error(serverLog);
    try { if ((await fetch(`${origin}/login`)).ok) { ready = true; break; } } catch { /* Wait for the owned server. */ }
    await pause(500);
  }
  assert.ok(ready, "Owned production frontend is ready");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block" });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => dialog.accept());
    await setFixtureSession(context, origin, "admin");
    let role = "admin";
    let supplierMode = "normal";
    let rejectSupplierSave = false;
    let releaseItemSave;
    let holdItemSave = false;
    let skuCalls = 0;
    let inventoryRequests = 0;
    const writes = [];
    const category = { _id: "222222222222222222222222", name: "Poultry", isActive: true };
    const supplierId = "333333333333333333333333";
    let suppliers = [{ _id: supplierId, code: "SUP-001", name: "Test Supplier", isActive: true, purchaseCount: 2, totalPurchases: 80, lastPurchaseAt: "2026-10-01", leadTimeDays: 2 }];
    let items = [];
    await context.route("**/api/**", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const resource = url.pathname.replace(/^\/api/, "");
      const method = request.method();
      const body = request.postDataJSON();
      let status = 200;
      let payload = { success: true, data: [] };
      if (resource.startsWith("/inventory/")) inventoryRequests++;
      if (resource === "/auth/me" || resource === "/auth/session") payload = { user: { _id: "111111111111111111111111", name: "Test Admin", role } };
      else if (resource === "/cart") payload.data = { items: [], coupon: null };
      else if (resource === "/inventory/categories") payload.data = [category];
      else if (resource.endsWith("/sku-suggestion")) { skuCalls++; payload.data = { sku: "POU-000124" }; }
      else if (resource === "/inventory/items" && method === "GET") payload = { success: true, data: items, pagination: { page: 1, pages: 1, total: items.length } };
      else if ((resource === "/inventory/items" && method === "POST") || (resource.startsWith("/inventory/items/") && method === "PATCH")) {
        writes.push({ resource, method, body });
        if (holdItemSave) await new Promise(resolve => { releaseItemSave = resolve; });
        const row = { ...body, _id: resource.split("/")[3] || "444444444444444444444444", category, supplier: suppliers[0], currentStock: body.openingStock ?? 20, saleableStock: body.openingStock ?? 20, updatedAt: "2026-10-19T10:00:00Z" };
        items = [row]; payload.data = row;
      } else if (resource === "/inventory/suppliers" && method === "GET") {
        if (url.searchParams.get("includeInactive") === "true" && supplierMode === "fail") { status = 503; payload = { success: false, message: "Fixture supplier service unavailable" }; }
        else if (url.searchParams.get("includeInactive") === "true" && supplierMode === "malformed") payload.data = { unexpected: true };
        else {
          const search = (url.searchParams.get("search") || "").toLowerCase();
          const filtered = suppliers.filter(row => `${row.name} ${row.code}`.toLowerCase().includes(search));
          const limit = Number(url.searchParams.get("limit") || 100), current = Number(url.searchParams.get("page") || 1);
          payload.data = filtered.slice((current - 1) * limit, current * limit);
        }
      } else if ((resource === "/inventory/suppliers" && method === "POST") || (resource.startsWith("/inventory/suppliers/") && method === "PATCH")) {
        writes.push({ resource, method, body });
        if (rejectSupplierSave) { status = 409; payload = { success: false, message: "This supplier code already exists" }; }
        else {
          const row = { ...body, _id: method === "POST" ? "555555555555555555555555" : resource.split("/")[3], purchaseCount: 0, totalPurchases: 0 };
          suppliers = [...suppliers.filter(value => value._id !== row._id), row]; payload.data = row;
        }
      } else if (resource.startsWith("/inventory/suppliers/") && method === "DELETE") {
        writes.push({ resource, method }); suppliers = suppliers.map(row => row._id === resource.split("/")[3] ? { ...row, isActive: false } : row);
      }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
    });

    try {
      // Failed and malformed initial responses must not crash or impersonate an empty list.
      supplierMode = "fail";
      await page.goto(`${origin}/inventory/suppliers`);
      await page.getByRole("alert").filter({ hasText: "Fixture supplier service unavailable" }).waitFor();
      assert.equal(await page.getByText("No suppliers yet", { exact: true }).count(), 0);
      supplierMode = "malformed";
      await page.getByRole("button", { name: "Retry suppliers" }).click();
      await page.getByRole("alert").filter({ hasText: "The supplier list could not be loaded" }).waitFor();
      supplierMode = "normal";
      await page.getByRole("button", { name: "Retry suppliers" }).click();
      await page.getByRole("heading", { name: "Test Supplier", exact: true }).waitFor();
      await page.reload();
      await page.getByRole("heading", { name: "Test Supplier", exact: true }).waitFor();

      // Navigation and the actual Stock Item modal, with its existing controls and payloads.
      if (viewport.width < 1024) await page.getByRole("button", { name: "Open inventory navigation" }).click();
      await page.getByRole("link", { name: "Stock Items", exact: true }).click();
      await page.getByRole("button", { name: "Add item", exact: true }).click();
      let dialog = page.getByRole("dialog", { name: "Add stock item", exact: true });
      for (const title of ["Basic details", "Units & stock", "Supplier & storage", "Reorder settings"]) await dialog.getByRole("heading", { name: title, exact: true }).waitFor();
      const footer = await dialog.locator(".stock-item-footer").boundingBox();
      assert.ok(footer.y >= 0 && footer.y + footer.height <= viewport.height, "Save/Cancel footer stays inside the viewport before scrolling");
      await page.screenshot({ path: path.join(artifacts, `stock-item-${viewport.width}-top.png`) });
      const choose = async (label, option) => { await dialog.getByRole("combobox", { name: label }).click(); await page.getByRole("option", { name: option, exact: true }).click(); };
      await dialog.getByRole("textbox", { name: /^Item name/ }).fill("Chicken breast");
      await choose(/^Category/, "Poultry");
      const sku = dialog.getByRole("textbox", { name: /^SKU \/ stable inventory ID/ });
      await page.waitForFunction(() => Array.from(document.querySelectorAll('input')).some(input => input.value === "POU-000124"));
      assert.equal(await sku.inputValue(), "POU-000124");
      const initialSkuCalls = skuCalls;
      await dialog.getByLabel(/^Preferred Brand/).fill("Almarai");
      assert.equal(skuCalls, initialSkuCalls, "Unrelated fields do not refetch SKU suggestions");
      await Promise.all([page.waitForResponse(response => response.url().includes("sku-suggestion")), dialog.getByRole("button", { name: "Regenerate suggested SKU" }).click()]);
      assert.equal(skuCalls, initialSkuCalls + 1);
      await choose(/^Usage \/ base unit/, "g");
      assert.match(await dialog.getByRole("combobox", { name: /^Purchase unit/ }).innerText(), /g/);
      await choose(/^Usage \/ base unit/, "kg");
      await choose(/^Purchase unit/, "box");
      await dialog.getByLabel(/^Base units per box/).fill("10");
      await dialog.getByText("1 box = 10 kg", { exact: true }).waitFor();
      for (const [label, value] of [[/^Base unit cost/, "20"], [/^Opening stock/, "20"], [/^Reorder level/, "5"], [/^Target \/ par stock/, "30"], [/^Safety stock/, "5"], [/^Lead time/, "2"], [/^Minimum order quantity/, "1"], [/^Order multiple/, "2"], [/^Storage location/, "Freezer A"], [/^Supplier item code/, "CH-01"]]) await dialog.getByLabel(label).fill(value);
      await choose(/^Primary supplier/, "Test Supplier");
      await dialog.getByRole("checkbox", { name: "Smart reorder", exact: true }).check();
      await dialog.getByRole("checkbox", { name: "Smart reorder", exact: true }).uncheck();
      assert.equal(await dialog.getByLabel(/^Target \/ par stock/).inputValue(), "30");
      await dialog.getByRole("checkbox", { name: "Smart reorder", exact: true }).check();
      await dialog.getByRole("checkbox", { name: "Track expiry", exact: true }).check();
      await dialog.getByRole("button", { name: /^Next expiry date/ }).click();
      const picker = page.getByRole("dialog", { name: "Choose date", exact: true });
      await picker.getByLabel("Enter date", { exact: true }).fill("30-11-2026");
      await picker.getByRole("button", { name: "Go", exact: true }).click();
      await dialog.getByRole("checkbox", { name: "Track expiry", exact: true }).uncheck();
      await dialog.getByRole("checkbox", { name: "Track expiry", exact: true }).check();
      assert.match(await dialog.getByRole("button", { name: /^Next expiry date/ }).innerText(), /30/);
      await dialog.getByRole("checkbox", { name: "Allow negative stock", exact: true }).check();
      await page.screenshot({ path: path.join(artifacts, `stock-item-${viewport.width}-bottom.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await dialog.evaluate(element => element.scrollWidth > element.clientWidth), false);
      holdItemSave = true;
      await dialog.getByRole("button", { name: "Create item", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('form[aria-label="Stock item details"] fieldset')?.disabled);
      assert.equal(await dialog.getByRole("button", { name: "Cancel", exact: true }).isDisabled(), true);
      assert.equal(writes.filter(write => write.resource === "/inventory/items").length, 1);
      assert.equal(await dialog.getByRole("textbox", { name: /^Item name/ }).isDisabled(), true);
      assert.ok(releaseItemSave);
      holdItemSave = false;
      releaseItemSave();
      await dialog.waitFor({ state: "hidden" });
      const created = writes.find(write => write.resource === "/inventory/items").body;
      for (const [key, expected] of Object.entries({ name: "Chicken breast", sku: "POU-000124", autoGenerateSku: true, category: category._id, unit: "kg", purchaseUnit: "box", purchaseConversionFactor: 10, openingStock: 20, unitCost: 20, reorderLevel: 5, reorderEnabled: true, targetStock: 30, safetyStock: 5, leadTimeDays: 2, minimumOrderQuantity: 1, orderMultiple: 2, supplierItemCode: "CH-01", preferredBrand: "Almarai", supplier: supplierId, storageLocation: "Freezer A", tracksExpiry: true, expiryDate: "2026-11-30", isActive: true, allowNegativeStock: true })) assert.equal(created[key], expected, key);

      await page.getByRole("button", { name: "Edit Chicken breast", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Edit Chicken breast", exact: true });
      await page.waitForFunction(() => Array.from(document.querySelectorAll('input')).some(input => input.value === "CH-01"));
      assert.equal(await dialog.getByRole("textbox", { name: /^SKU/ }).getAttribute("readonly"), "");
      assert.equal(await dialog.getByLabel(/^Opening stock/).count(), 0);
      assert.equal(await dialog.getByRole("button", { name: "Regenerate suggested SKU" }).count(), 0);
      assert.equal(await dialog.getByLabel(/^Supplier item code/).inputValue(), "CH-01");
      await dialog.getByLabel(/^Storage location/).fill("Freezer B");
      await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      const updated = writes.find(write => write.method === "PATCH" && write.resource.startsWith("/inventory/items/")).body;
      assert.equal(updated.storageLocation, "Freezer B");
      assert.equal(updated.autoGenerateSku, false);
      assert.equal(Object.hasOwn(updated, "openingStock"), false);
      assert.equal(updated.sku, created.sku);
      assert.equal(updated.purchaseConversionFactor, 10);
      assert.equal(updated.expiryDate, "2026-11-30");
      assert.equal(skuCalls, initialSkuCalls + 1, "Editing never generates a replacement SKU");

      await page.getByRole("button", { name: "Add item", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Add stock item", exact: true });
      await dialog.getByRole("textbox", { name: /^Item name/ }).fill("Manual SKU item");
      await choose(/^Category/, "Poultry");
      await page.waitForFunction(() => Array.from(document.querySelectorAll('input')).some(input => input.value === "POU-000124"));
      await dialog.getByRole("textbox", { name: /^SKU/ }).fill("pou-custom-01");
      await dialog.getByRole("button", { name: "Create item", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      const manual = writes.filter(write => write.resource === "/inventory/items").at(-1).body;
      assert.equal(manual.sku, "POU-CUSTOM-01"); assert.equal(manual.autoGenerateSku, false);
      await page.getByRole("button", { name: "Add item", exact: true }).click();
      await page.getByRole("dialog", { name: "Add stock item", exact: true }).getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await page.getByRole("dialog", { name: "Add stock item", exact: true }).count(), 0);

      // Supplier search, pagination, create/edit/archive and failed-save recovery.
      await page.goto(`${origin}/inventory/suppliers`);
      const search = page.getByRole("searchbox", { name: "Search supplier / code" });
      await search.fill("No matching fixture");
      await page.getByText("No matching suppliers", { exact: true }).waitFor();
      await search.fill("");
      await page.getByRole("heading", { name: "Test Supplier", exact: true }).waitFor();
      await page.getByRole("button", { name: "Add supplier", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Add supplier", exact: true });
      await dialog.getByLabel("Supplier code", { exact: true }).fill("sup-new");
      await dialog.getByLabel("Supplier name", { exact: true }).fill("New Supplier");
      rejectSupplierSave = true;
      await dialog.getByRole("button", { name: "Create supplier", exact: true }).click();
      await page.getByText("This supplier code already exists", { exact: true }).waitFor();
      assert.equal(await dialog.getByLabel("Supplier name", { exact: true }).inputValue(), "New Supplier");
      rejectSupplierSave = false;
      await dialog.getByRole("button", { name: "Create supplier", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Edit New Supplier", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Edit New Supplier", exact: true });
      await dialog.getByLabel("Contact name", { exact: true }).fill("Updated contact");
      await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      await page.getByText("Updated contact", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Archive New Supplier", exact: true }).click();
      await page.getByText("Inactive", { exact: true }).waitFor();
      assert.equal(suppliers.find(row => row.name === "New Supplier").isActive, false);
      suppliers = Array.from({ length: 21 }, (_, index) => ({ ...suppliers[0], _id: `fixture-${index}`, name: `Supplier ${String(index + 1).padStart(2, "0")}` }));
      await page.reload();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByText("Page 2", { exact: true }).waitFor();
      await page.getByRole("heading", { name: "Supplier 21", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Next", exact: true }).isDisabled(), true);
      await page.getByRole("button", { name: "Previous", exact: true }).click();
      await page.getByRole("heading", { name: "Supplier 01", exact: true }).waitFor();
      await page.screenshot({ path: path.join(artifacts, `suppliers-${viewport.width}.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (viewport.width < 1024) await page.getByRole("button", { name: "Open inventory navigation" }).click();
      await page.getByRole("link", { name: "Suppliers", exact: true }).click();
      await page.getByRole("heading", { name: "Suppliers", exact: true }).waitFor();

      role = "customer";
      const previousRequests = inventoryRequests;
      await page.reload();
      await page.waitForURL(url => url.pathname === "/");
      assert.equal(inventoryRequests, previousRequests, "A customer is redirected before inventory data loads");
      assert.deepEqual(errors, []);
      console.log(`PASS stock create/edit/manual SKU/units/expiry/reorder/footer and supplier recovery/CRUD/search/pagination/navigation/access (${viewport.width}px)`);
    } catch (error) {
      await page.screenshot({ path: path.join(artifacts, `failure-${viewport.width}.png`) }).catch(() => {});
      console.error("Browser errors:", errors);
      throw error;
    } finally { releaseItemSave?.(); await context.close(); }
  }
  console.log(`Screenshots: ${artifacts}`);
} finally {
  await browser?.close();
  if (next.exitCode === null && !serverError) {
    const stopped = new Promise(resolve => next.once("exit", resolve));
    next.kill();
    await stopped;
  }
  await new Promise(resolve => fixture.close(resolve));
}
