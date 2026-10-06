import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function runBrowserRehearsal({ origin, actors, dish, expenseCategory, invoice, receiptItem, supplier }) {
  const { chromium } = await import(pathToFileURL(process.env.PHASE4_PLAYWRIGHT_MODULE).href);
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../frontend");
  const env = { ...process.env, NODE_ENV: "production", BACKEND_API_URL: origin + "/api", PORT: String(port), NEXT_TELEMETRY_DISABLED: "1" };
  // Frontend process gets the owned local API only, never a database connection.
  for (const key of Object.keys(env)) if (/MONGO|DATABASE|DB_URI|JWT_SECRET|SECRET|TOKEN/i.test(key)) delete env[key];
  const child = spawn(process.execPath, [path.join(frontend, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: frontend, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let startupError; child.on("error", error => { startupError = error; });
  // Drain output without printing connection details or session tokens.
  child.stdout.on("data", () => {}); child.stderr.on("data", () => {});
  const url = "http://127.0.0.1:" + port;
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 90; i++) { if (startupError) throw startupError; if (child.exitCode != null) throw new Error("Disposable frontend server exited"); try { if ((await fetch(url + "/login")).ok) { ready = true; break; } } catch { /* local server warming up */ } await delay(500); }
    assert.equal(ready, true, "Built frontend starts against the local API");
    browser = await chromium.launch({ headless: true, ...(process.env.PHASE4_BROWSER_CHANNEL ? { channel: process.env.PHASE4_BROWSER_CHANNEL } : {}) });
    const contexts = {};
    const login = async role => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
      const page = await context.newPage();
      await page.goto(url + "/login");
      await page.getByPlaceholder("Email", { exact: true }).fill(actors[role].email);
      await page.getByPlaceholder("Password", { exact: true }).fill("TestPassword123!");
      await page.getByRole("button", { name: "Log In", exact: true }).click();
      await page.waitForURL(url + "/", { timeout: 30000 });
      const cookies = await context.cookies();
      assert.ok(cookies.some(cookie => cookie.name === "dg_session" && cookie.httpOnly));
      assert.ok(cookies.some(cookie => cookie.name === "dg_csrf" && !cookie.httpOnly));
      contexts[role] = { context, page }; return page;
    };
    const cashier = await login("cashier"), admin = await login("admin"), inventory = await login("inventory");
    const browserApi = (page, route, body, method = body === undefined ? "GET" : "POST") => page.evaluate(async ({ route, body, method }) => {
      const csrf = document.cookie.split("; ").find(row => row.startsWith("dg_csrf="))?.slice(8);
      const session = sessionStorage.getItem("dg_pos_session");
      const response = await fetch("/api" + route, { method, headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : {}), ...(session && route.startsWith("/pos/") ? { "X-POS-Session": session } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    }, { route, body, method });
    await admin.goto(url + "/admin/expenses/entries");
    await admin.getByRole("heading", { name: "Expense Entries", exact: true }).waitFor();
    await inventory.goto(url + "/inventory/purchase-orders");
    await inventory.getByRole("heading", { name: "Purchase Orders", exact: true }).waitFor();
    assert.equal((await browserApi(inventory, "/expenses/entries")).status, 403);
    await cashier.goto(url + "/pos");
    await cashier.getByRole("button", { name: "Unlock POS", exact: true }).waitFor();
    // Password unlock through the rendered form exercises cookies, CSRF and POS sessions.
    await cashier.getByRole("button", { name: "Use account password", exact: true }).click();
    await cashier.getByLabel("Account password", { exact: true }).fill("TestPassword123!");
    await cashier.getByRole("button", { name: "Unlock POS", exact: true }).click();
    await cashier.getByRole("button", { name: "Unlock POS", exact: true }).waitFor({ state: "hidden" });
    await cashier.reload();
    await cashier.getByRole("combobox", { name: "POS terminal" }).click();
    await cashier.getByRole("option").filter({ hasText: "MAIN" }).click();
    await cashier.getByText(dish.name, { exact: true }).first().waitFor();
    assert.equal((await browserApi(cashier, "/menu/manage")).status, 403);
    assert.equal((await browserApi(cashier, "/pos/customers?search=Dummy")).status, 200);
    assert.equal((await browserApi(cashier, "/pos/shifts/open", { terminal: "MAIN", openingCash: 20 })).status, 201);
    const saleBody = { terminal: "MAIN", idempotencyKey: randomUUID(), items: [{ productId: String(dish._id), quantity: 1 }], orderType: "takeaway", paymentMethod: "cash", cashReceived: 20 };
    let intercepted = false;
    await cashier.route("**/api/pos/sales", async route => {
      if (route.request().method() === "POST" && !intercepted) { intercepted = true; await route.fetch(); await route.abort("failed"); } else await route.continue();
    });
    await browserApi(cashier, "/pos/sales", saleBody).catch(() => undefined);
    await cashier.unroute("**/api/pos/sales");
    const retry = await browserApi(cashier, "/pos/sales", saleBody); assert.equal(retry.status, 200); assert.equal(retry.body.duplicate, true);
    const orderId = retry.body.data._id;
    assert.equal((await browserApi(cashier, "/pos/sales/" + orderId + "/reprint", {})).status, 200);
    await contexts.cashier.context.setOffline(true);
    await assert.rejects(browserApi(cashier, "/pos/sales"));
    await contexts.cashier.context.setOffline(false);
    assert.equal((await browserApi(cashier, "/pos/sales")).status, 200);
    assert.equal((await browserApi(cashier, "/pos/session/lock", {})).status, 200);
    await cashier.reload(); await cashier.getByRole("button", { name: "Unlock POS", exact: true }).waitFor();
    await cashier.evaluate(() => sessionStorage.removeItem("dg_pos_session"));
    assert.equal((await browserApi(cashier, "/pos/sales")).status, 401);
    assert.equal((await browserApi(cashier, "/pos/session")).body.data.locked, true);
    // A new window loses sessionStorage but retains cookies: it must stay locked.
    const reopened = await contexts.cashier.context.newPage(); await reopened.goto(url + "/pos");
    await reopened.getByRole("button", { name: "Unlock POS", exact: true }).waitFor();
    const expense = await browserApi(admin, "/expenses/entries", { title: "Browser dummy expense", category: String(expenseCategory._id), totalAmount: 12, expenseDate: "2026-10-06", idempotencyKey: randomUUID() });
    assert.equal(expense.status, 201);
    assert.equal((await browserApi(admin, "/expenses/entries/export?search=" + expense.body.data.expenseNumber)).body.data.length, 1);
    await admin.goto(url + "/inventory/supplier-invoices");
    await admin.getByRole("heading", { name: "Supplier Invoices & Payables", exact: true }).waitFor();
    await admin.getByTitle("View", { exact: true }).first().click();
    await admin.getByText(invoice.internalReference, { exact: false }).first().waitFor();
    await admin.getByRole("button", { name: "Reverse payment", exact: true }).first().waitFor();
    await admin.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await admin.getByTitle("Record payment", { exact: true }).first().click();
    await admin.getByLabel("Amount (SAR)", { exact: true }).fill("5");
    let lostPayment = false;
    await admin.route("**/api/inventory/supplier-invoices/*/payments", async route => {
      if (!lostPayment) { lostPayment = true; await route.fetch(); await route.abort("failed"); } else await route.continue();
    });
    await admin.getByRole("dialog").getByRole("button", { name: "Record payment", exact: true }).click();
    await admin.getByRole("button", { name: "Retry saved payment", exact: true }).waitFor();
    await admin.unroute("**/api/inventory/supplier-invoices/*/payments");
    const replacement = await contexts.admin.context.newPage();
    await replacement.goto(url + "/inventory/supplier-invoices");
    await replacement.getByTitle("Record payment", { exact: true }).first().click();
    await replacement.getByRole("button", { name: "Retry saved payment", exact: true }).click();
    await replacement.getByRole("dialog").waitFor({ state: "hidden" });
    const confirmed = await browserApi(replacement, "/inventory/supplier-invoices/" + invoice._id);
    assert.equal(confirmed.body.data.paidAmount, 65); assert.equal(confirmed.body.data.outstandingAmount, 15);
    assert.equal(confirmed.body.payments.filter(row => row.amountHalala === 500).length, 1);
    await replacement.close();
    const receiptPo = (await browserApi(inventory, "/inventory/purchase-orders", { supplier: String(supplier._id), items: [{ item: String(receiptItem._id), quantity: 2, unitCost: 1 }] })).body.data;
    for (const [page, status] of [[inventory, "submitted"], [admin, "approved"], [inventory, "ordered"]]) {
      assert.equal((await browserApi(page, "/inventory/purchase-orders/" + receiptPo._id + "/status", { status }, "PATCH")).status, 200);
    }
    await inventory.reload();
    await inventory.getByRole("row").filter({ hasText: receiptPo.orderNumber }).getByRole("button", { name: "Receive", exact: true }).click();
    await inventory.getByRole("dialog").getByRole("checkbox").check();
    let lostReceipt = false;
    await inventory.route("**/api/inventory/purchase-orders/*/receive", async route => {
      if (!lostReceipt) { lostReceipt = true; await route.fetch(); await route.abort("failed"); } else await route.continue();
    });
    await inventory.getByRole("button", { name: "Receive selected items", exact: true }).click();
    await inventory.getByRole("dialog").getByRole("alert").waitFor();
    await inventory.getByRole("button", { name: "Retry original receipt", exact: true }).waitFor();
    await inventory.unroute("**/api/inventory/purchase-orders/*/receive");
    const receiptWindow = await contexts.inventory.context.newPage();
    await receiptWindow.goto(url + "/inventory/purchase-orders");
    await receiptWindow.getByRole("row").filter({ hasText: receiptPo.orderNumber }).getByRole("button", { name: "Receive", exact: true }).click();
    await receiptWindow.getByRole("button", { name: "Retry original receipt", exact: true }).click();
    await receiptWindow.getByRole("dialog").waitFor({ state: "hidden" });
    const received = (await browserApi(receiptWindow, "/inventory/purchase-orders/" + receiptPo._id)).body.data;
    assert.equal(received.status, "received"); assert.equal(received.items[0].receivedQuantity, 2);
    await receiptWindow.close();
    // Visible list errors replace misleading empty/stale success.
    await inventory.route("**/api/inventory/purchase-orders**", route => route.fulfill({ status: 503, contentType: "application/json", body: '{"success":false,"message":"Dummy outage"}' }));
    await inventory.reload();
    await inventory.getByRole("alert").filter({ hasText: "Unable to refresh purchase orders" }).waitFor();
    await inventory.unroute("**/api/inventory/purchase-orders**"); await inventory.getByRole("button", { name: "Retry", exact: true }).click();
    await inventory.getByRole("alert").filter({ hasText: "Unable to refresh purchase orders" }).waitFor({ state: "hidden" });
  } finally {
    await browser?.close();
    if (child.exitCode == null && !startupError) { const ended = new Promise(resolve => child.once("exit", resolve)); child.kill(); await ended; }
  }
}
