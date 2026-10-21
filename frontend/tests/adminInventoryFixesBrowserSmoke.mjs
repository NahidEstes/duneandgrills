import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setFixtureSession } from "./helpers/fixtureSession.mjs";

// Own both servers. Every browser API is intercepted; no configured backend or real data.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(os.tmpdir(), "dg-admin-inventory-fixes");
await fs.mkdir(artifacts, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const fixture = http.createServer((request, response) => {
  const role = /dg_session=owned-browser-(admin|manager|inventory|accountant|customer)/.exec(request.headers.cookie || "")?.[1];
  const session = request.method === "GET" && request.url === "/api/auth/session";
  response.writeHead(session && role ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(session && role ? { user: { _id: "111111111111111111111111", name: "Owned audit fixture", role } } : { success: false, message: "Browser APIs must be intercepted" }));
});
await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV: "production", BACKEND_API_URL: `http://127.0.0.1:${fixture.address().port}/api`, SITE_URL: origin, SITE_ENV: "staging", NEXT_TELEMETRY_DISABLED: "1" };
for (const key of Object.keys(env)) if (/MONGO|DATABASE|JWT_SECRET|API_PROXY_SECRET|TOKEN/i.test(key)) delete env[key];
const next = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let serverError, browser; let serverLog = "";
next.on("error", error => { serverError = error; });
next.stdout.on("data", value => { serverLog = (serverLog + value).slice(-3000); });
next.stderr.on("data", value => { serverLog = (serverLog + value).slice(-3000); });
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (serverError) throw serverError;
    if (next.exitCode !== null) throw new Error(serverLog);
    try { if ((await fetch(origin + "/login")).ok) { ready = true; break; } } catch {}
    await pause(300);
  }
  assert.ok(ready, "Owned production frontend started");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block" });
    await setFixtureSession(context, origin, "admin");
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const errors = [], writes = [], requests = [], downloads = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("download", download => downloads.push(download));
    let role = "admin", categoryMode = "normal", countMode = "normal", settingsMode = "fail", exportFails = false;
    let oldStarted = deferred(), oldRelease = deferred(), oldDone = deferred();
    const category = { _id: "222222222222222222222222", name: "Poultry", color: "#f59e0b", itemCount: 0, inventoryValue: 0, isActive: true };
    const supplier = { _id: "333333333333333333333333", name: "Owned Supplier", code: "SUP-001", isActive: true };
    let settings = { outletName: "Owned outlet", expiryAlertDays: 14, defaultAllowNegativeStock: false, purchasingAutomation: { demandLookbackDays: 60, defaultLeadTimeDays: 3, defaultSafetyStock: 4, staleAfterHours: 48, dismissalSnoozeDays: 2, dueSoonDays: 5 } };
    let counts = [];
    const item = (name, sku) => ({ _id: sku, name, sku, category, unit: "kg", unitCost: 10, currentStock: 5, saleableStock: 5, reorderLevel: 2, isActive: true });
    await context.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url()), resource = url.pathname.replace(/^\/api/, ""), method = request.method();
      requests.push({ resource, method, params: Object.fromEntries(url.searchParams) });
      if (method !== "GET") writes.push({ resource, method, body: request.postDataJSON() });
      let status = 200, payload = { success: true, data: [] };
      if (["/auth/me", "/auth/session"].includes(resource)) payload = { user: { _id: "111111111111111111111111", name: "Owned fixture", role } };
      else if (resource === "/cart") payload.data = { items: [], coupon: null };
      else if (resource === "/inventory/categories") {
        if (categoryMode === "fail") { status = 503; payload = { success: false, message: "Fixture categories unavailable" }; }
        else payload.data = [category];
      } else if (resource === "/inventory/suppliers") payload.data = [supplier];
      else if (resource.endsWith("/sku-suggestion")) payload.data = { sku: "POU-000001" };
      else if (resource === "/inventory/counts" && method === "GET") {
        await pause(150);
        if (countMode === "fail") { status = 503; payload = { success: false, message: "Fixture counts unavailable" }; }
        else payload.data = counts;
      } else if (resource === "/inventory/counts" && method === "POST") {
        const body = request.postDataJSON();
        payload.data = { _id: "444444444444444444444444", countNumber: "IC-2026-0001", status: "in_progress", blindCount: body.blindCount, createdAt: "2026-10-21T09:00:00Z", items: [{ _id: "555555555555555555555555", itemName: "Test counted item", sku: "COUNT-1", expectedQuantity: 5 }], createdBy: { name: "Owned fixture" } };
        counts = [payload.data];
      } else if (resource.endsWith("/complete") && resource.startsWith("/inventory/counts/")) {
        counts = counts.map(row => ({ ...row, status: "completed" })); payload.data = counts[0];
      } else if (resource === "/inventory/settings") {
        if (method === "GET") {
          if (settingsMode === "fail") { status = 503; payload = { success: false, message: "Fixture settings unavailable" }; }
          else if (settingsMode === "malformed") payload.data = [];
          else payload.data = settings;
        } else { settings = { ...settings, ...request.postDataJSON() }; payload.data = settings; }
      } else if (resource === "/inventory/items") {
        const query = url.searchParams.get("search");
        if (query === "old") { oldStarted.resolve(); await oldRelease.promise; }
        payload = { success: true, data: query ? [item(query === "old" ? "Old filter item" : "New filter item", query === "old" ? "OLD-1" : "NEW-1")] : [], pagination: { page: 1, pages: 1, total: query ? 1 : 0, limit: 20 } };
      } else if (resource === "/inventory/reports") {
        const current = Number(url.searchParams.get("page") || 1), limit = Number(url.searchParams.get("limit") || 50), type = url.searchParams.get("type");
        if (exportFails && current === 2 && limit === 100) { status = 503; payload = { success: false, message: "Fixture export page unavailable" }; }
        else {
          const all = Array.from({ length: 237 }, (_, index) => ({ _id: String(index), name: `Test stock ${index}`, sku: `STK-${index}`, currentStock: 1, unit: "pcs", unitCost: 2, inventoryValue: 2, orderNumber: `PO-${index}`, supplier, items: [], status: "ordered", total: 2, createdAt: "2026-10-21T09:00:00Z" }));
          payload = { success: true, data: all.slice((current - 1) * limit, current * limit), pagination: { page: current, pages: Math.ceil(all.length / limit), total: all.length, limit }, currency: "SAR" };
        }
      } else if (["/inventory/supplier-invoices", "/inventory/purchasing-actions", "/inventory/purchase-orders"].includes(resource)) payload = { success: true, data: [], pagination: { page: 1, pages: 0, total: 0, limit: 20 } };
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
      if (resource === "/inventory/items" && url.searchParams.get("search") === "old") oldDone.resolve();
    });
    try {
      await page.goto(origin + "/inventory/inventory-count");
      await page.getByText("No inventory counts yet", { exact: true }).waitFor();
      assert.equal(await page.getByText("THE GRILL WENT COLD", { exact: true }).count(), 0);
      countMode = "fail"; await page.reload();
      await page.getByRole("alert").filter({ hasText: "Fixture counts unavailable" }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Start inventory count", exact: true }).isDisabled(), true);
      countMode = "normal"; await page.getByRole("button", { name: "Retry inventory counts", exact: true }).click();
      await page.getByText("No inventory counts yet", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Start inventory count", exact: true }).click();
      await page.getByRole("button", { name: "Start count", exact: true }).click();
      const sheet = page.getByRole("dialog", { name: "Count sheet · IC-2026-0001", exact: true });
      await sheet.getByLabel("Counted", { exact: true }).fill("5");
      await sheet.getByRole("button", { name: "Complete count & adjust stock", exact: true }).click();
      await sheet.waitFor({ state: "hidden" });
      assert.deepEqual(writes.find(row => row.resource.endsWith("/complete")).body.items, [{ lineId: "555555555555555555555555", countedQuantity: 5, notes: "" }]);

      categoryMode = "fail"; await page.goto(origin + "/inventory/categories");
      await page.getByRole("alert").filter({ hasText: "Fixture categories unavailable" }).waitFor();
      assert.equal(await page.getByText("No categories yet", { exact: true }).count(), 0);
      categoryMode = "normal"; await page.getByRole("button", { name: "Retry categories", exact: true }).click();
      await page.getByRole("heading", { name: "Poultry", exact: true }).waitFor();

      await page.goto(origin + "/inventory/settings");
      await page.getByRole("alert").filter({ hasText: "Fixture settings unavailable" }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Save settings", exact: true }).count(), 0);
      settingsMode = "malformed"; await page.getByRole("button", { name: "Retry inventory settings", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "response was incomplete" }).waitFor();
      assert.equal(writes.filter(row => row.resource === "/inventory/settings").length, 0);
      settingsMode = "normal"; await page.getByRole("button", { name: "Retry inventory settings", exact: true }).click();
      await page.getByRole("button", { name: "Save settings", exact: true }).waitFor();
      assert.equal(await page.getByLabel("Expiry alert window (days)", { exact: true }).inputValue(), "14");
      await page.getByLabel("Outlet name", { exact: true }).fill("Updated owned outlet");
      await page.getByRole("button", { name: "Save settings", exact: true }).click();
      await page.getByText("Inventory settings saved.", { exact: true }).waitFor();
      const saved = writes.find(row => row.resource === "/inventory/settings").body;
      assert.deepEqual(saved, settings);
      assert.equal(saved.expiryAlertDays, 14); assert.equal(saved.purchasingAutomation.demandLookbackDays, 60); assert.equal(saved.defaultAllowNegativeStock, false);

      await page.goto(origin + "/inventory/stock-items");
      const search = page.getByPlaceholder("Search by item, SKU, brand or location…");
      await search.fill("old"); await oldStarted.promise;
      await search.fill("new"); await page.getByText("New filter item", { exact: true }).waitFor();
      oldRelease.resolve(); await oldDone.promise; await pause(150);
      assert.equal(await page.getByText("Old filter item", { exact: true }).count(), 0);
      assert.equal(await page.getByText("New filter item", { exact: true }).count(), 1);
      await page.getByRole("button", { name: "Add item", exact: true }).click();
      const form = page.getByRole("dialog", { name: "Add stock item", exact: true });
      await form.getByRole("textbox", { name: /^Item name/ }).fill("Unsaved stock draft");
      await form.getByRole("combobox", { name: "Category", exact: true }).click();
      await page.keyboard.press("Escape"); await page.getByRole("listbox").waitFor({ state: "hidden" });
      assert.equal(await form.isVisible(), true);
      assert.equal(await form.getByRole("textbox", { name: /^Item name/ }).inputValue(), "Unsaved stock draft");
      await form.getByRole("button", { name: "Cancel", exact: true }).click();

      await page.goto(origin + "/inventory/reports");
      await page.getByText("Test stock 0", { exact: true }).waitFor();
      let pendingDownload = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export current page", exact: true }).click();
      let download = await pendingDownload;
      assert.match(download.suggestedFilename(), /page-1/);
      assert.equal((await fs.readFile(await download.path(), "utf8")).trim().split(/\r?\n/).length - 1, 50);
      await page.getByRole("button", { name: "Supplier Purchase History", exact: true }).click();
      await page.getByRole("combobox", { name: "All suppliers", exact: true }).click();
      await page.getByRole("option", { name: "Owned Supplier", exact: true }).click();
      await page.getByText("PO-0", { exact: true }).waitFor();
      pendingDownload = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export all filtered", exact: true }).click();
      download = await pendingDownload;
      assert.match(download.suggestedFilename(), /supplier-all/);
      assert.equal((await fs.readFile(await download.path(), "utf8")).trim().split(/\r?\n/).length - 1, 237);
      const allRequests = requests.filter(row => row.resource === "/inventory/reports" && row.params.limit === "100");
      assert.deepEqual(allRequests.map(row => row.params.page), ["1", "2", "3"]);
      assert.ok(allRequests.every(row => row.params.type === "supplier" && row.params.supplier === supplier._id));
      exportFails = true; const beforeDownloads = downloads.length;
      await page.getByRole("button", { name: "Export all filtered", exact: true }).click();
      await page.getByText("Fixture export page unavailable", { exact: true }).waitFor();
      assert.equal(downloads.length, beforeDownloads, "No partial download after page failure");
      await page.screenshot({ path: path.join(artifacts, `reports-${viewport.width}.png`) });

      role = "accountant"; await context.clearCookies(); await setFixtureSession(context, origin, role);
      await page.goto(origin + "/inventory/supplier-invoices");
      await page.getByRole("heading", { name: "Supplier Invoices & Payables", exact: true }).waitFor();
      assert.equal(await page.getByRole("link", { name: "Stock In", exact: true }).count(), 0);
      await page.goto(origin + "/inventory/purchasing-actions");
      await page.getByRole("heading", { name: "Purchasing Action Center", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Scan conditions", exact: true }).isDisabled(), true);
      const settingsRequests = requests.filter(row => row.resource === "/inventory/settings").length;
      await page.goto(origin + "/inventory/settings"); await page.waitForURL(url => url.pathname === "/");
      assert.equal(requests.filter(row => row.resource === "/inventory/settings").length, settingsRequests);
      role = "customer"; await context.clearCookies(); await setFixtureSession(context, origin, role);
      await page.goto(origin + "/inventory/supplier-invoices"); await page.waitForURL(url => url.pathname === "/");
      assert.ok(writes.every(row => row.resource === "/inventory/counts" || row.resource.endsWith("/complete") || row.resource === "/inventory/settings"), "Only explicitly submitted fixture count/settings writes occurred");
      assert.deepEqual(errors, []);
      console.log(`PASS ${viewport.width}px: count/category recovery, safe settings/retry, latest filter, dropdown Escape, CSV 50/237/no partial file, scoped accountant/customer access`);
    } catch (error) {
      await page.screenshot({ path: path.join(artifacts, `failure-${viewport.width}.png`) }).catch(() => {});
      throw error;
    } finally { oldRelease.resolve(); await context.close(); }
  }
  console.log(`Screenshots: ${artifacts}`);
} finally {
  await browser?.close();
  if (next.exitCode === null && !serverError) { const stopped = new Promise(resolve => next.once("exit", resolve)); next.kill(); await stopped; }
  await new Promise(resolve => fixture.close(resolve));
}
