import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import express from "../../backend/node_modules/express/index.js";
import jwt from "../../backend/node_modules/jsonwebtoken/index.js";
import { withIsolatedMongo } from "../../backend/tests/helpers/isolatedMongo.js";
import User from "../../backend/models/User.js";
import InventoryItem from "../../backend/models/InventoryItem.js";
import InventoryCategory from "../../backend/models/InventoryCategory.js";
import InventoryBatch from "../../backend/models/InventoryBatch.js";
import InventorySettings from "../../backend/models/InventorySettings.js";
import StockTransaction from "../../backend/models/StockTransaction.js";
import inventoryRoutes from "../../backend/routes/inventoryRoutes.js";
import { savePreparationRecipe } from "../../backend/services/preparationService.js";

process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "owned-inventory-workspace-browser";
const root = path.resolve(import.meta.dirname, ".."), output = await mkdtemp(path.join(tmpdir(), "dg-workspace-browser-"));
let browser, next, backend, logs = "";
await withIsolatedMongo(async () => {
  try {
    const actor = await User.create({ name: "Owned workspace admin", email: "workspace-browser@fixture.invalid", password: "OwnedPassword123!", role: "admin" });
    const category = await InventoryCategory.create({ name: "Owned workspace stock", skuPrefix: "UXB" });
    await InventorySettings.create({ key: "default" });
    await InventoryItem.insertMany(Array.from({ length: 105 }, (_, i) => ({ name: `A fixture ${String(i).padStart(3, "0")}`, sku: `UXB-${i}`, category: category._id, unit: "kg", currentStock: 0 })));
    const raw = await InventoryItem.create({ name: "ZZ Kitchen Rice", sku: "UXB-RICE", category: category._id, unit: "kg", purchaseUnit: "box", purchaseConversionFactor: 5, currentStock: 100, unitCost: 2 });
    const blocked = await InventoryItem.create({ name: "Owned blocked meat", sku: "UXB-MEAT", category: category._id, unit: "kg", tracksExpiry: true, currentStock: 12, unitCost: 3 });
    for (const [quantity, expiryDate] of [[8, "2030-01-01"], [4, "2020-01-01"]]) await InventoryBatch.create({ item: blocked._id, lotNumber: `MEAT-${quantity}`, receivedQuantity: quantity, remainingQuantity: quantity, unitCost: 3, expiryDate, source: "STOCK_IN" });
    const finished = await InventoryItem.create({ name: "Owned finished rice", sku: "UXB-FINISHED", category: category._id, unit: "kg", currentStock: 0 });
    await savePreparationRecipe(actor, { name: "Owned rice preparation", finishedItem: String(finished._id), outputQuantity: 1, outputUnit: "kg", ingredients: [{ inventoryItem: String(raw._id), quantity: 1, unit: "kg" }], isActive: true });
    const app = express(); app.use(express.json());
    app.get(["/api/auth/me", "/api/auth/session"], (_req, res) => res.json({ success: true, user: { _id: actor._id, name: actor.name, role: actor.role } }));
    app.use("/api/inventory", inventoryRoutes);
    app.get("/api/settings/public", (_req, res) => res.json({ success: true, data: { location: {}, openingHours: [] } }));
    app.get("/api/cart", (_req, res) => res.json({ success: true, data: { items: [] } }));
    app.get("/api/orders/config", (_req, res) => res.json({ success: true, data: { websiteOrderingEnabled: false } }));
    app.use((_req, res) => res.json({ success: true, data: [] }));
    app.use((error, _req, res, _done) => res.status(error.status || 400).json({ success: false, message: error.message }));
    backend = await new Promise(resolve => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
    const probe = createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    const origin = `http://127.0.0.1:${port}`, env = { ...process.env, NODE_ENV: "production", BACKEND_API_URL: `http://127.0.0.1:${backend.address().port}/api`, SITE_URL: origin, SITE_ENV: "staging" };
    for (const key of Object.keys(env)) if (/MONGO|DATABASE|JWT_SECRET|API_PROXY_SECRET|RESEND|CUSTOMER_EMAIL/i.test(key)) delete env[key];
    next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    next.stdout.on("data", value => logs += value); next.stderr.on("data", value => logs += value);
    for (let attempt = 0; attempt < 100; attempt++) { try { await fetch(origin + "/login"); break; } catch { if (next.exitCode != null) throw Error(logs); await new Promise(resolve => setTimeout(resolve, 200)); } }
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    for (const width of [1440, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, serviceWorkers: "block" }), page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await context.addCookies([{ name: "dg_session", value: jwt.sign({ id: actor._id, sv: 0 }, process.env.JWT_SECRET), url: origin }, { name: "dg_csrf", value: "owned-workspace-csrf", url: origin }]);
      await context.route("https://**", route => route.fulfill({ status: 200, body: "" }));
      const shot = async name => { await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`); };
      const axe = async () => { await page.addScriptTag({ path: path.join(root, "node_modules/axe-core/axe.min.js") }); const problems = await page.evaluate(async () => (await window.axe.run(document.querySelector("main"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations.map(row => `${row.id}: ${row.nodes.map(node => node.target.join(" ")).join(", ")}`)); assert.deepEqual(problems, []); };
      const pick = async (label, search, name) => { await page.getByRole("combobox", { name: label, exact: true }).click(); await page.getByRole("textbox", { name: `Search ${label.toLowerCase()}`, exact: true }).fill(search); await page.getByRole("option").filter({ hasText: name }).click(); };
      await page.goto(origin + "/inventory/stock-items");
      if (width < 1024) await page.getByRole("button", { name: "Open inventory navigation", exact: true }).click();
      const nav = page.locator('aside[aria-label="Inventory navigation"]');
      await nav.getByRole("button", { name: "Pin Stock Items", exact: true }).click(); await nav.getByRole("region", { name: "Favourites", exact: true }).getByRole("link", { name: "Stock Items", exact: true }).waitFor();
      await shot("grouped-navigation");
      if (width < 1024) await page.keyboard.press("Escape");
      await page.reload(); if (width < 1024) await page.getByRole("button", { name: "Open inventory navigation", exact: true }).click();
      await nav.getByRole("region", { name: "Favourites", exact: true }).getByRole("link", { name: "Stock Items", exact: true }).waitFor(); if (width < 1024) await page.keyboard.press("Escape");
      const search = page.getByPlaceholder("Search by item, SKU, brand or location…", { exact: true }); await search.fill("ZZ Kitchen");
      await page.getByRole("button", { name: /ZZ Kitchen Rice/ }).first().click(); const drawer = page.getByRole("dialog", { name: "ZZ Kitchen Rice", exact: true }); await drawer.waitFor();
      const beforeReads = await StockTransaction.countDocuments();
      await drawer.getByRole("button", { name: "Batches", exact: true }).click(); await drawer.getByText(/No batches recorded|LEGACY-/).first().waitFor();
      await drawer.getByRole("button", { name: "Recipe usage", exact: true }).click(); await drawer.getByText("Owned rice preparation", { exact: true }).waitFor();
      await drawer.getByRole("button", { name: "Overview", exact: true }).click(); await shot("item-drawer"); await axe(); assert.equal(await StockTransaction.countDocuments(), beforeReads);
      await drawer.getByRole("button", { name: "Close ZZ Kitchen Rice", exact: true }).click(); assert.equal(await search.inputValue(), "ZZ Kitchen"); await shot("stock-list"); await axe();
      await page.goto(`${origin}/inventory/stock-items?item=${blocked._id}`); const blockedDrawer = page.getByRole("dialog", { name: blocked.name, exact: true }); await blockedDrawer.getByText("4 kg", { exact: true }).waitFor(); await blockedDrawer.getByText("8 kg", { exact: true }).waitFor(); await shot("eligibility"); await blockedDrawer.getByRole("button", { name: `Close ${blocked.name}`, exact: true }).click();
      if (width === 1440) {
        await page.goto(origin + "/inventory/stock-items"); const searched = page.waitForResponse(response => response.url().includes("/api/inventory/items?") && new URL(response.url()).searchParams.get("search") === "ZZ Kitchen"); await page.getByPlaceholder("Search by item, SKU, brand or location…", { exact: true }).fill("ZZ Kitchen"); await searched; await page.waitForFunction(() => document.querySelectorAll("tbody > tr").length === 1);
        await page.locator("summary:visible").filter({ hasText: "ZZ Kitchen Rice" }).click(); await page.getByRole("link", { name: "Receive stock (outside PO)", exact: true }).click();
      } else {
        await page.goto(`${origin}/inventory/stock-items?item=${raw._id}`); await drawer.waitFor(); await drawer.locator("summary").filter({ hasText: "Actions" }).click(); await drawer.getByRole("link", { name: "Receive stock (outside PO)", exact: true }).click();
      }
      await page.getByRole("combobox", { name: "Inventory item", exact: true }).filter({ hasText: "ZZ Kitchen Rice" }).waitFor();
      await pick("Inventory item", "ZZ Kitchen", "ZZ Kitchen Rice"); await page.getByText(/Physical stock:/).waitFor();
      if (width === 1440) {
        await context.route("**/api/inventory/item-options?**", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, message: "Owned picker unavailable" }) }), { times: 1 });
        await page.getByRole("combobox", { name: "Inventory item", exact: true }).click(); await page.getByRole("button", { name: "Retry search", exact: true }).waitFor(); await page.getByRole("button", { name: "Retry search", exact: true }).click(); await page.getByRole("option").first().waitFor();
        const input = page.getByRole("textbox", { name: "Search inventory item", exact: true });
        let release; const held = new Promise(resolve => release = resolve);
        await context.route("**/api/inventory/item-options?**", async route => { if (new URL(route.request().url()).searchParams.get("search") === "Owned blocked") { const response = await route.fetch(); await held; await route.fulfill({ response }).catch(() => undefined); } else await route.continue(); });
        const requested = page.waitForRequest(request => request.url().includes("item-options") && new URL(request.url()).searchParams.get("search") === "Owned blocked");
        await input.fill("Owned blocked"); await requested; await input.fill("ZZ Kitchen"); await page.getByRole("option").filter({ hasText: "ZZ Kitchen Rice" }).waitFor(); release();
        await page.getByRole("option").filter({ hasText: "ZZ Kitchen Rice" }).click(); await context.unroute("**/api/inventory/item-options?**");
        await page.getByText(/Physical stock:/).waitFor();
      }
      const stockBefore = (await InventoryItem.findById(raw._id)).currentStock, movementsBefore = await StockTransaction.countDocuments();
      await page.getByLabel(/^Receive quantity \(box\)/).fill("2"); await page.getByLabel("Reason", { exact: true }).fill("Owned fixture delivery");
      await context.setOffline(true); await page.getByText("Offline. No stock action will be submitted.", { exact: true }).waitFor(); assert.equal(await page.getByRole("button", { name: "Review stock change", exact: true }).isDisabled(), true); await context.setOffline(false);
      await page.getByRole("button", { name: "Review stock change", exact: true }).click(); const confirm = page.getByRole("dialog", { name: "Confirm stock change", exact: true }); await confirm.waitFor();
      await confirm.getByText(/2 box = 10 kg/).waitFor(); assert.equal(await StockTransaction.countDocuments(), movementsBefore); await shot("stock-review"); await axe();
      if (width === 1440) {
        await InventoryItem.updateOne({ _id: raw._id }, { $inc: { stockVersion: 1 } }); await confirm.getByRole("button", { name: "Confirm stock change", exact: true }).click(); await confirm.getByRole("alert").filter({ hasText: /changed since review/ }).waitFor();
        assert.equal(await StockTransaction.countDocuments(), movementsBefore); await confirm.getByRole("button", { name: "Go back", exact: true }).click(); await page.getByRole("button", { name: "Review again with same key", exact: true }).click(); await page.getByRole("button", { name: "Review stock change", exact: true }).click(); await confirm.waitFor();
      }
      if (width === 390) await context.route("**/api/inventory/movement-review/confirm", async route => { await route.fetch(); await route.abort("failed"); }, { times: 1 });
      await confirm.getByRole("button", { name: "Confirm stock change", exact: true }).click();
      if (width === 390) { await confirm.getByRole("alert").waitFor(); await confirm.getByRole("button", { name: "Go back", exact: true }).click(); await page.getByRole("button", { name: "Check saved stock result", exact: true }).click(); }
      await page.getByText(/This is the confirmed physical balance/).waitFor(); assert.equal((await InventoryItem.findById(raw._id)).currentStock, stockBefore + 10); assert.equal(await StockTransaction.countDocuments(), movementsBefore + 1);
      await page.goto(`${origin}/inventory/stock-out?item=${raw._id}`); await page.getByText(/Physical stock:/).waitFor(); await page.getByLabel(/^Quantity to deduct \(kg\)/).fill("1"); await page.getByLabel("Reason", { exact: true }).fill("Owned kitchen usage"); await page.getByRole("button", { name: "Review stock change", exact: true }).click(); await confirm.waitFor(); await confirm.getByRole("button", { name: "Confirm stock change", exact: true }).click(); await page.getByText(/This is the confirmed physical balance/).waitFor(); assert.equal((await InventoryItem.findById(raw._id)).currentStock, stockBefore + 9);
      await page.goto(`${origin}/inventory/waste-damaged?item=${raw._id}&action=add`); await page.getByRole("combobox", { name: "Inventory item", exact: true }).filter({ hasText: "ZZ Kitchen Rice" }).waitFor(); await page.getByLabel(/^Quantity to deduct \(kg\)/).fill("1"); await page.getByRole("button", { name: "Review stock change", exact: true }).click(); await confirm.waitFor(); await confirm.getByRole("button", { name: "Confirm stock change", exact: true }).click(); await page.getByText(/Stock loss recorded:/).waitFor(); assert.equal((await InventoryItem.findById(raw._id)).currentStock, stockBefore + 8);
      await page.goto(`${origin}/inventory/stock-movements?item=${raw._id}`); await page.getByRole("combobox", { name: "Filter inventory item", exact: true }).filter({ hasText: "ZZ Kitchen Rice" }).waitFor(); await shot("linked-history");
      await page.goto(origin + "/inventory"); await page.getByRole("link", { name: "View out of stock", exact: true }).click(); await page.getByRole("button", { name: "Clear filters", exact: true }).waitFor(); assert.match(page.url(), /status=out/);
      assert.deepEqual(errors, []); await context.close(); console.log(`PASS ${width}px: grouped favourites, drawer/card/eligibility, >100-item picker, conversions, review/recovery, waste and stock ledger, filtered dashboard and accessibility`);
    }
    console.log(`Inventory workspace browser artifacts: ${output}`);
  } catch (error) {
    for (const context of browser?.contexts() || []) for (const page of context.pages()) { await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }); console.error(page.url(), (await page.locator("body").innerText()).slice(0, 6000)); }
    console.error(`Artifacts: ${output}`); throw error;
  } finally {
    await browser?.close(); if (next) { next.kill(); await new Promise(resolve => next.exitCode != null ? resolve() : next.once("exit", resolve)); } if (backend) await new Promise(resolve => backend.close(resolve));
  }
});
