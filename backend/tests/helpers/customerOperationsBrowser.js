import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function runCustomerOperationsBrowser({ origin, tokens, dish, fries, drink, tableToken, api }) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../frontend");
  const url = `http://127.0.0.1:${port}`;
  const artifacts = process.env.CUSTOMER_OPERATIONS_ARTIFACT_DIR || path.join(os.tmpdir(), "dg-customer-operations-review");
  await fs.mkdir(artifacts, { recursive: true });
  const env = { ...process.env, NODE_ENV: "production", BACKEND_API_URL: origin + "/api", SITE_URL: url, SITE_ENV: "staging", NEXT_TELEMETRY_DISABLED: "1" };
  for (const key of Object.keys(env)) if (/MONGO|DATABASE|JWT_SECRET|SECRET|TOKEN/i.test(key)) delete env[key];
  const child = spawn(process.execPath, [path.join(frontend, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: frontend, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let startupError, logs = "";
  child.on("error", error => { startupError = error; });
  child.stdout.on("data", value => { logs = (logs + value).slice(-2000); }); child.stderr.on("data", value => { logs = (logs + value).slice(-2000); });
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      if (startupError) throw startupError;
      if (child.exitCode != null) throw new Error(logs);
      try { if ((await fetch(url + "/login")).ok) { ready = true; break; } } catch { /* Warming up the owned frontend. */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready);
    browser = await chromium.launch({ channel: "chrome", headless: true });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const errors = [], contexts = [];
      const createPage = async role => {
        const context = await browser.newContext({ viewport, serviceWorkers: "block" }); contexts.push(context);
        if (role) await context.addCookies([{ name: "dg_session", value: tokens[role], url, httpOnly: true, sameSite: "Lax" }, { name: "dg_csrf", value: "owned-browser-csrf", url, sameSite: "Lax" }]);
        const page = await context.newPage(); page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => dialog.accept());
        return page;
      };
      let guest, admin;
      try {
        admin = await createPage("admin");
        await admin.goto(url + "/admin/tables");
        await admin.getByRole("button", { name: "Add table", exact: true }).click();
        let modal = admin.getByRole("dialog", { name: "Add dining table", exact: true });
        await modal.getByLabel("Table code", { exact: true }).pressSequentially(`T-${viewport.width}`);
        await modal.getByLabel("Table name", { exact: true }).pressSequentially("Browser table");
        await modal.getByRole("button", { name: "Save table", exact: true }).click();
        await modal.waitFor({ state: "hidden" });
        await admin.getByRole("button", { name: `QR code for table T-${viewport.width}`, exact: true }).click();
        modal = admin.getByRole("dialog", { name: `QR code · Table T-${viewport.width}`, exact: true });
        const qrImage = modal.getByRole("img", { name: `Ordering QR code for table T-${viewport.width}`, exact: true }); await qrImage.waitFor();
        assert.match(await qrImage.getAttribute("src"), /^data:image\/png;base64,/);
        assert.ok(await qrImage.evaluate(image => image.complete && image.naturalWidth > 0));
        const menu = await modal.getByRole("link", { name: "Open table menu", exact: true }).getAttribute("href");
        await admin.screenshot({ path: path.join(artifacts, `table-qr-${viewport.width}.png`) });
        await modal.getByRole("button", { name: "Close", exact: true }).click();
        guest = await createPage();
        await guest.goto(menu);
        await guest.getByText(`Table T-${viewport.width} · Browser table`, { exact: true }).first().waitFor();
        await guest.getByRole("button", { name: `View ${dish.name}`, exact: true }).click();
        await guest.getByRole("button", { name: /^Add to Cart/ }).click();
        await guest.getByRole("button", { name: /^Open cart,/ }).click();
        let cart = guest.getByRole("dialog", { name: "Your Cart", exact: true });
        await cart.getByRole("heading", { name: "Complete your meal", exact: true }).waitFor();
        await cart.getByRole("button", { name: `Add suggested ${fries.name}`, exact: true }).click();
        await cart.getByRole("button", { name: `Add suggested ${fries.name}`, exact: true }).waitFor({ state: "hidden" });
        await cart.getByRole("button", { name: `Add suggested ${drink.name}`, exact: true }).click();
        await guest.getByRole("button", { name: "Hot", exact: true }).click();
        await guest.getByRole("button", { name: /^Add to Cart/ }).click();
        assert.equal(await cart.getByRole("button", { name: /^Add suggested/ }).count(), 0);
        await cart.getByRole("button", { name: "Close cart", exact: true }).click();
        await guest.goto(url + "/menu?table=" + tableToken);
        await guest.getByText("Table T-01 · Window table", { exact: true }).first().waitFor();
        await guest.goto(menu);
        await guest.getByText(`Table T-${viewport.width} · Browser table`, { exact: true }).first().waitFor();
        await guest.getByRole("button", { name: /^Open cart,/ }).click();
        await cart.getByRole("button", { name: "Pickup", exact: true }).click();
        assert.equal(await cart.getByText(`Table T-${viewport.width} · Browser table`, { exact: true }).count(), 0);
        assert.equal(await guest.evaluate(() => sessionStorage.getItem("dg_dining_table_token")), null);
        await guest.goto(menu);
        await guest.getByText(`Table T-${viewport.width} · Browser table`, { exact: true }).first().waitFor();
        await guest.getByRole("button", { name: /^Open cart,/ }).click();
        cart = guest.getByRole("dialog", { name: "Your Cart", exact: true });
        await guest.screenshot({ path: path.join(artifacts, `table-cart-${viewport.width}.png`) });
        await cart.getByRole("button", { name: "Proceed to Checkout", exact: true }).click();
        await guest.getByLabel("Customer name", { exact: true }).fill("Browser Guest");
        await guest.getByLabel("Customer phone", { exact: true }).fill("0501234567");
        const confirmation = guest.waitForResponse(response => new URL(response.url()).pathname === "/api/orders" && response.request().method() === "POST");
        await guest.getByRole("button", { name: /Place Order/ }).click();
        const response = await confirmation, placed = await response.json();
        assert.equal(response.status(), 201, JSON.stringify(placed));
        assert.equal(placed.data.diningTable.code, `T-${viewport.width}`); assert.equal(placed.data.totalAmount, 28); assert.equal(placed.data.paymentStatus, "pending");
        assert.equal(placed.data.items.find(row => row.name === drink.name).spiceLevel, "hot");
        await guest.getByRole("button", { name: "Track this order", exact: true }).click();
        await guest.getByRole("button", { name: "Get help with this order", exact: true }).click();
        await guest.getByRole("checkbox", { name: `${dish.name} × 1`, exact: true }).check();
        const description = `Missing burger from browser order ${viewport.width}`;
        await guest.getByLabel("Describe the issue", { exact: true }).pressSequentially(description);
        await guest.getByRole("button", { name: "Submit issue", exact: true }).click();
        await guest.getByRole("button", { name: "Refresh conversation", exact: true }).waitFor();
        await guest.getByText(description, { exact: true }).waitFor();
        await guest.screenshot({ path: path.join(artifacts, `guest-support-${viewport.width}.png`) });
        await admin.goto(url + "/admin/support");
        await admin.getByRole("searchbox", { name: "Search support by order number", exact: true }).fill(placed.data.orderNumber);
        await admin.getByRole("button").filter({ hasText: placed.data.orderNumber }).click();
        await admin.getByLabel("Save message as internal note", { exact: true }).check();
        await admin.getByLabel("Internal note (staff only)", { exact: true }).fill("Private browser investigation");
        await admin.getByRole("button", { name: "Save support update", exact: true }).click();
        await admin.getByText("Private browser investigation", { exact: true }).waitFor();
        await guest.getByRole("button", { name: "Refresh conversation", exact: true }).click();
        await guest.getByRole("button", { name: "Refresh conversation", exact: true }).waitFor();
        assert.equal(await guest.getByText("Private browser investigation", { exact: true }).count(), 0);
        await admin.getByLabel("Save message as internal note", { exact: true }).uncheck();
        await admin.getByLabel("Reply to customer", { exact: true }).fill("We are arranging a replacement.");
        await admin.getByRole("combobox", { name: "Support status", exact: true }).click();
        await admin.getByRole("option", { name: "Resolved", exact: true }).click();
        await admin.getByLabel("Resolution (always visible to customer)", { exact: true }).fill("Replacement arranged");
        await admin.getByRole("button", { name: "Save support update", exact: true }).click();
        await admin.getByText("We are arranging a replacement.", { exact: true }).waitFor();
        await guest.getByRole("button", { name: "Refresh conversation", exact: true }).click();
        await guest.getByText("Resolution: Replacement arranged", { exact: true }).waitFor();
        await guest.getByLabel("Your reply", { exact: true }).fill("Thank you for helping.");
        await guest.getByRole("button", { name: "Send reply", exact: true }).click();
        await guest.locator("li").filter({ hasText: "Thank you for helping." }).waitFor();
        await admin.screenshot({ path: path.join(artifacts, `admin-support-${viewport.width}.png`) });
        const accountOrder = await api("customer", "/orders", { idempotencyKey: `browser-account-${viewport.width}`, orderType: "pickup", customer: { name: "Test customer", phone: "0500000000" }, items: [{ productId: String(dish._id), quantity: 1 }] });
        assert.equal(accountOrder.status, 201);
        const account = await createPage("customer");
        await account.goto(url + "/profile/orders");
        await account.getByRole("button", { name: "View Details", exact: true }).first().click();
        await account.getByRole("button", { name: "Get help with this order", exact: true }).click();
        await account.getByRole("button", { name: "Submit issue", exact: true }).waitFor();
        const blocked = await createPage();
        await blocked.goto(url + "/menu?table=invalid");
        await blocked.getByRole("alert").filter({ hasText: "Invalid table QR link" }).waitFor();
        await blocked.getByRole("button", { name: "Continue without a table", exact: true }).click();
        assert.equal(new URL(blocked.url()).searchParams.has("table"), false);
        assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.deepEqual(errors, []);
        console.log(`PASS real API browser: QR/admin tables, suggestions/customization, checkout, guest/account support, private notes and resolution (${viewport.width}px)`);
      } catch (error) {
        await guest?.screenshot({ path: path.join(artifacts, `failure-guest-${viewport.width}.png`) }).catch(() => {});
        await admin?.screenshot({ path: path.join(artifacts, `failure-admin-${viewport.width}.png`) }).catch(() => {});
        throw error;
      } finally { await Promise.all(contexts.map(context => context.close())); }
    }
    console.log(`Browser screenshots: ${artifacts}`);
  } finally {
    await browser?.close();
    if (child.exitCode === null && !startupError) { const stopped = new Promise(resolve => child.once("exit", resolve)); child.kill(); await stopped; }
  }
}
