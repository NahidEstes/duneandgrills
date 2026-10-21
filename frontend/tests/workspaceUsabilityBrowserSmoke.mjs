import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setFixtureSession } from "./helpers/fixtureSession.mjs";

// Own loopback servers only. API requests use fixtures; no actual accounts or financial records.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(os.tmpdir(), "dg-workspace-usability");
await fs.mkdir(artifacts, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixture = http.createServer((request, response) => {
  const role = /dg_session=owned-browser-(admin|accountant|customer)/.exec(request.headers.cookie || "")?.[1];
  const session = request.method === "GET" && request.url === "/api/auth/session";
  response.writeHead(session && role ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(session && role ? { user: { _id: "111111111111111111111111", name: "Owned fixture", role } } : { success: false, message: "Owned browser interception required" }));
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
  assert.ok(ready);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block" });
    await setFixtureSession(context, origin, "admin");
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const errors = [], writes = [], reads = [], prompts = [];
    let reply = "dismiss", failStock = false, actorId = "111111111111111111111111", releasePayment;
    let paymentTotal = 0;
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", async dialog => { prompts.push(dialog.message()); await dialog[reply](); });
    const category = { _id: "222222222222222222222222", name: "Poultry", color: "#f59e0b", isActive: true };
    const supplier = { _id: "333333333333333333333333", name: "Owned Supplier", code: "SUP-001", isActive: true };
    const items = Array.from({ length: 75 }, (_, index) => ({ _id: String(index).padStart(24, "0"), name: `${index % 2 ? "Beef" : "Chicken"} ${index}`, sku: `TEST-${index}`, category, supplier, unit: "kg", purchaseUnit: "kg", purchaseConversionFactor: 1, unitCost: 10, currentStock: 5, saleableStock: 5, reorderLevel: 2, isActive: true, updatedAt: "2026-10-21T09:00:00Z" }));
    const stockBefore = JSON.stringify(items);
    const invoice = { _id: "666666666666666666666666", internalReference: "INV-OWNED-1", supplierInvoiceNumber: "OWNED-1", supplier, total: 50, outstandingAmount: 50, status: "posted", displayPaymentStatus: "unpaid", invoiceDate: "2026-10-21", dueDate: "2026-10-30", matchSummary: { mismatches: 0 }, items: [] };
    const settings = { outletName: "Owned outlet", expiryAlertDays: 14, defaultAllowNegativeStock: false, purchasingAutomation: { demandLookbackDays: 60, defaultLeadTimeDays: 3, defaultSafetyStock: 4, staleAfterHours: 48, dismissalSnoozeDays: 2, dueSoonDays: 5 } };
    const settingsBefore = JSON.stringify(settings);
    const envelope = (rows, url, fallback = 20) => { const limit = Number(url.searchParams.get("limit") || fallback), current = Number(url.searchParams.get("page") || 1); return { success: true, data: rows.slice((current - 1) * limit, current * limit), pagination: { page: current, limit, total: rows.length, pages: Math.ceil(rows.length / limit) } }; };
    await context.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url()), resource = url.pathname.replace(/^\/api/, ""), method = request.method();
      if (method === "GET") reads.push({ resource, params: Object.fromEntries(url.searchParams) });
      else writes.push({ resource, method, body: request.postDataJSON() });
      let payload = { success: true, data: [] }, status = 200;
      if (["/auth/me", "/auth/session"].includes(resource)) payload = { user: { _id: actorId, name: "Owned Admin", role: "admin" } };
      else if (resource === "/cart") payload.data = { items: [], coupon: null };
      else if (resource === "/inventory/categories") payload.data = [category];
      else if (resource === "/inventory/suppliers") payload.data = [supplier];
      else if (resource.endsWith("/sku-suggestion")) payload.data = { sku: "POU-000001" };
      else if (resource === "/inventory/items") {
        if (failStock) { status = 503; payload = { success: false, message: "Owned stock unavailable" }; }
        else payload = envelope(items.filter(row => !url.searchParams.get("search") || row.name.toLowerCase().includes(url.searchParams.get("search").toLowerCase())), url);
      } else if (resource === "/inventory/settings") payload.data = settings;
      else if (resource === "/admin/staff") payload = envelope([{ _id: "777777777777777777777777", employeeId: "EMP-OWNED-1", name: "Owned Staff", email: "staff@example.test", role: "cashier", isActive: true, attendanceEnabled: false }], url, 50);
      else if (resource === "/attendance/shifts") payload.data = [];
      else if (resource === "/expenses/categories") payload.data = [{ _id: "888888888888888888888888", name: "Rent", isActive: true }];
      else if (resource === "/expenses") payload = envelope([], url, 15);
      else if (resource === "/inventory/purchase-orders") payload = envelope([], url);
      else if (resource === "/inventory/supplier-invoices") payload = { ...envelope([invoice], url), aging: {} };
      else if (resource === `/inventory/supplier-invoices/${invoice._id}/payments`) {
        await new Promise(resolve => { releasePayment = resolve; });
        paymentTotal += Number(request.postDataJSON().amount);
        payload.data = { _id: "999999999999999999999999", amount: 10 };
      }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
    });
    try {
      await page.goto(origin + "/inventory/stock-items");
      await page.getByText(/Last updated:/).waitFor();
      assert.equal(await page.locator("tbody tr").count(), 20);
      const rows = page.getByRole("combobox", { name: "Rows per page", exact: true });
      const chooseRows = async size => { await rows.click(); const response = page.waitForResponse(result => result.url().includes("/api/inventory/items?") && new URL(result.url()).searchParams.get("limit") === String(size)); await page.getByRole("option", { name: String(size), exact: true }).click(); await response; };
      await chooseRows(50); await page.locator("tbody tr").nth(49).waitFor();
      await page.getByRole("button", { name: "Next page", exact: true }).click();
      await page.getByText("Chicken 50", { exact: true }).waitFor();
      await chooseRows(10); await page.getByText("Chicken 0", { exact: true }).waitFor();
      assert.equal(reads.filter(row => row.resource === "/inventory/items").at(-1).params.page, "1");
      await page.locator("summary").click();
      const columnMenu = await page.locator("details > div").boundingBox(); assert.ok(columnMenu.x >= 0 && columnMenu.x + columnMenu.width <= viewport.width);
      const supplierColumn = page.locator("details").getByRole("checkbox", { name: "Supplier", exact: true });
      await supplierColumn.uncheck();
      assert.equal(await page.getByRole("columnheader", { name: "Supplier", exact: true }).count(), 0);
      assert.equal(await page.locator("details").getByRole("checkbox", { name: "Item", exact: true }).isDisabled(), true);
      await page.locator("summary").click();
      await page.getByPlaceholder("Search by item, SKU, brand or location…").fill("Chicken");
      await page.getByText("Chicken 18", { exact: true }).waitFor();
      await page.getByRole("combobox", { name: "All categories", exact: true }).click(); await page.getByRole("option", { name: "Poultry", exact: true }).click();
      await page.getByLabel("New saved view name", { exact: true }).fill("Chicken stock"); await page.getByRole("button", { name: "Save view", exact: true }).click();
      await page.reload(); await page.getByText(/Last updated:/).waitFor();
      assert.equal(await rows.innerText(), "10");
      assert.equal(await page.getByRole("columnheader", { name: "Supplier", exact: true }).count(), 0);
      await page.getByRole("combobox", { name: "Saved views", exact: true }).click(); await page.getByRole("option", { name: "Chicken stock", exact: true }).click();
      await page.getByText("Chicken 18", { exact: true }).waitFor();
      assert.equal(await page.getByPlaceholder("Search by item, SKU, brand or location…").inputValue(), "Chicken");
      assert.ok(reads.some(row => row.params.search === "Chicken" && row.params.category === category._id));
      const lastSuccess = await page.locator("time").first().getAttribute("datetime");
      failStock = true; await page.getByRole("button", { name: "Refresh data", exact: true }).click();
      await page.getByText(/Showing previously loaded data/).waitFor();
      assert.equal(await page.locator("time").first().getAttribute("datetime"), lastSuccess);
      assert.equal(await page.getByRole("button", { name: "Add item", exact: true }).isDisabled(), true);
      failStock = false; await page.getByRole("button", { name: "Retry data", exact: true }).click();
      await page.getByRole("button", { name: "Refresh data", exact: true }).waitFor();
      assert.ok((await page.locator("time").first().getAttribute("datetime")) >= lastSuccess);
      await page.screenshot({ path: path.join(artifacts, `stock-${viewport.width}.png`) });

      await page.getByRole("button", { name: "Add item", exact: true }).click();
      let dialog = page.getByRole("dialog", { name: "Add stock item", exact: true });
      const beforeCleanClose = prompts.length;
      await dialog.getByRole("button", { name: "Close", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      assert.equal(prompts.length, beforeCleanClose, "Unedited forms close without a prompt");
      await page.getByRole("button", { name: "Add item", exact: true }).click();
      await dialog.getByRole("textbox", { name: /^Item name/ }).fill("RAM-ONLY-DRAFT");
      await dialog.getByRole("combobox", { name: "Category", exact: true }).click();
      await page.keyboard.press("Escape"); await page.getByRole("listbox").waitFor({ state: "hidden" });
      assert.equal(prompts.length, beforeCleanClose);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.match(prompts.at(-1), /Discard unsaved changes/); assert.equal(await dialog.isVisible(), true);
      assert.equal(await dialog.getByRole("textbox", { name: /^Item name/ }).inputValue(), "RAM-ONLY-DRAFT");
      reply = "accept"; await dialog.getByRole("button", { name: "Close", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); reply = "dismiss";

      await page.goto(origin + "/inventory/suppliers"); await page.getByRole("button", { name: "Add supplier", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Add supplier", exact: true });
      for (const heading of ["Supplier details", "Contact information", "Terms & notes"]) await dialog.getByRole("heading", { name: heading, exact: true }).waitFor();
      await dialog.getByLabel("Supplier name", { exact: true }).fill("Draft supplier");
      const footer = await dialog.locator(".workspace-form-actions").boundingBox(); assert.ok(footer.y >= 0 && footer.y + footer.height <= viewport.height);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click(); assert.equal(await dialog.isVisible(), true);
      await page.screenshot({ path: path.join(artifacts, `supplier-${viewport.width}.png`) });
      reply = "accept"; await dialog.getByRole("button", { name: "Cancel", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); reply = "dismiss";

      await page.goto(origin + "/admin/staff"); await page.getByRole("button", { name: "Add staff", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Add staff account", exact: true });
      const staffFooter = await dialog.locator(".workspace-form-actions").boundingBox(); assert.ok(staffFooter.y >= 0 && staffFooter.y + staffFooter.height <= viewport.height);
      await dialog.getByRole("combobox", { name: "cashier", exact: true }).click(); await page.getByRole("option", { name: "kitchen", exact: true }).click();
      await dialog.getByRole("button", { name: "Close", exact: true }).click(); assert.equal(await dialog.isVisible(), true, "A custom-select-only edit is protected");
      await dialog.getByLabel("Name", { exact: true }).pressSequentially("Draft Staff");
      assert.equal(await dialog.getByLabel("Name", { exact: true }).inputValue(), "Draft Staff");
      reply = "accept"; await dialog.getByRole("button", { name: "Cancel", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); reply = "dismiss";

      await page.goto(origin + "/admin/expenses/entries"); await page.getByRole("button", { name: "Add Expense", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Add expense", exact: true });
      const expenseFooter = await dialog.locator(".workspace-form-actions").boundingBox(); assert.ok(expenseFooter.y >= 0 && expenseFooter.y + expenseFooter.height <= viewport.height);
      for (const heading of ["Expense details", "Amounts & dates", "Payment & supporting details"]) await dialog.getByRole("heading", { name: heading, exact: true }).waitFor();
      await dialog.getByLabel("Total amount (SAR)", { exact: true }).fill("125.50");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await dialog.getByLabel("Total amount (SAR)", { exact: true }).inputValue(), "125.50");
      reply = "accept"; await dialog.getByRole("button", { name: "Cancel", exact: true }).click(); await dialog.waitFor({ state: "hidden" }); reply = "dismiss";
      assert.equal(writes.length, 0, "Preferences, refreshes and discarded drafts never write application records");

      await page.goto(origin + "/admin?tab=menu"); await page.getByRole("button", { name: "Add Item", exact: true }).click();
      const menuForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Add Menu Item", exact: true }) });
      await menuForm.getByLabel("Item name", { exact: true }).fill("Unsaved dish");
      await menuForm.getByRole("button", { name: "Close form", exact: true }).click(); assert.equal(await menuForm.isVisible(), true);
      reply = "accept"; await page.keyboard.press("Escape"); await menuForm.waitFor({ state: "hidden" }); reply = "dismiss";
      assert.equal(writes.length, 0);

      await page.goto(origin + "/inventory/settings"); await page.getByLabel("Outlet name", { exact: true }).fill("Unsaved outlet");
      await page.getByRole("button", { name: "Refresh data", exact: true }).click();
      assert.equal(await page.getByLabel("Outlet name", { exact: true }).inputValue(), "Unsaved outlet");
      reply = "accept"; await page.getByRole("button", { name: "Refresh data", exact: true }).click();
      await page.waitForFunction(() => [...document.querySelectorAll("input")].some(input => input.value === "Owned outlet")); reply = "dismiss";
      assert.equal(JSON.stringify(settings), settingsBefore);
      const preferences = await page.evaluate(() => JSON.stringify(localStorage));
      assert.ok(!preferences.includes("RAM-ONLY-DRAFT") && !preferences.includes("Draft Staff") && !preferences.includes("125.50"));

      await page.goto(origin + "/inventory/supplier-invoices"); await page.getByRole("button", { name: "Record payment", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Record payment · INV-OWNED-1", exact: true });
      await dialog.getByLabel("Amount (SAR)", { exact: true }).fill("10");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click(); assert.equal(await dialog.isVisible(), true);
      await dialog.getByRole("button", { name: "Record payment", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('form[aria-busy="true"]'));
      const duringPayment = prompts.length;
      await dialog.getByRole("button", { name: "Close", exact: true }).click(); await page.keyboard.press("Escape");
      assert.equal(await dialog.isVisible(), true); assert.equal(prompts.length, duringPayment);
      assert.equal(writes.length, 1); assert.equal(writes[0].body.amount, 10);
      releasePayment(); await dialog.waitFor({ state: "hidden" });
      assert.equal(paymentTotal, 10); assert.equal(writes.length, 1);
      assert.equal(JSON.stringify(items), stockBefore); assert.equal(JSON.stringify(settings), settingsBefore);

      actorId = "aaaaaaaaaaaaaaaaaaaaaaaa"; await page.goto(origin + "/inventory/stock-items"); await page.getByText(/Last updated:/).waitFor();
      assert.equal(await rows.innerText(), "20");
      assert.equal(await page.getByRole("columnheader", { name: "Supplier", exact: true }).count(), 1);
      assert.deepEqual(errors, []);
      console.log(`PASS ${viewport.width}px: page size/reset, saved filters, columns/account isolation, real freshness/retry, draft cancel/keep, sticky sections/actions, busy payment/one exact submission, unchanged stock/settings`);
    } catch (error) {
      await page.screenshot({ path: path.join(artifacts, `failure-${viewport.width}.png`) }).catch(() => {}); throw error;
    } finally { releasePayment?.(); await context.close(); }
  }
  console.log(`Screenshots: ${artifacts}`);
} finally {
  await browser?.close();
  if (next.exitCode === null && !serverError) { const stopped = new Promise(resolve => next.once("exit", resolve)); next.kill(); await stopped; }
  await new Promise(resolve => fixture.close(resolve));
}
