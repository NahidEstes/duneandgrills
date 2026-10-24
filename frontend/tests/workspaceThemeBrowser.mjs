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
import StockTransaction from "../../backend/models/StockTransaction.js";
import Production from "../../backend/models/Production.js";
import PreparationRecipe from "../../backend/models/PreparationRecipe.js";
import inventoryRoutes from "../../backend/routes/inventoryRoutes.js";
import { savePreparationRecipe } from "../../backend/services/preparationService.js";
import { adminDeliveryPreview } from "../../backend/services/deliveryPreviewService.js";

// Disposable loopback fixture only. Theme interactions must never post stock,
// reprice historical records, reset a draft or submit any business write.
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "owned-workspace-theme-test";
process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "false";
const root = path.resolve(import.meta.dirname, ".."), output = await mkdtemp(path.join(tmpdir(), "dg-workspace-theme-"));
let browser, next, backend, logs = "";
await withIsolatedMongo(async ({ uri }) => {
  try {
    process.env.MONGO_URI = uri; process.env.RIDER_PREVIEW_ENABLED = "true";
    const actor = await User.create({ name: "Theme fixture admin", email: "theme@fixture.invalid", password: "OwnedPassword123!", role: "admin" });
    const category = await InventoryCategory.create({ name: "Theme fixture ingredients", skuPrefix: "THM" });
    const raw = await InventoryItem.create({ name: "Theme fixture flour", sku: "THM-RAW", category: category._id, unit: "kg", currentStock: 100, unitCost: 10, tracksExpiry: true });
    const finished = await InventoryItem.create({ name: "Theme fixture sauce", sku: "THM-SAUCE", category: category._id, unit: "kg", currentStock: 0 });
    const recipe = await savePreparationRecipe(actor, { name: "Theme fixture preparation", finishedItem: finished._id.toString(), outputQuantity: 1, outputUnit: "kg", ingredients: [{ inventoryItem: raw._id.toString(), quantity: 0.5, unit: "kg" }], isActive: true });
    const snapshot = async () => JSON.stringify({ items: await InventoryItem.find().sort({ _id: 1 }).lean(), recipes: await PreparationRecipe.find().lean(), stock: await StockTransaction.find().lean(), productions: await Production.find().lean() });
    const before = await snapshot(), writes = [];
    const app = express(); app.use(express.json());
    app.use((req, _res, done) => { if (!["GET","HEAD","OPTIONS"].includes(req.method)) writes.push(req.method + " " + req.path); done(); });
    app.get(["/api/auth/me", "/api/auth/session"], (_req, res) => res.json({ success: true, user: { _id: actor._id, name: actor.name, role: actor.role } }));
    app.use("/api/inventory", inventoryRoutes);
    app.get("/api/admin/dashboard", (req, res) => res.json({ success: true, data: { reportingPeriod: { period: req.query.period, label: "Today" }, stats: { totalOrders: 0, totalRevenue: 0, completedOrders: 0, pendingOrders: 0, openOrders: 0 }, recentOrders: [], recentMenuItems: [], recentPosts: [], offers: [], recentReviews: [], activities: [] } }));
    app.get("/api/admin/operations-overview", (_req, res) => res.status(503).json({ success: false, message: "Owned unavailable operations fixture" }));
    app.get("/api/planner/notifications", (_req, res) => res.json({ data: [], unread: 0, count: 0 }));
    app.get("/api/deliveries/preview", (_req, res) => res.json(adminDeliveryPreview(actor)));
    app.get("/api/deliveries/preview/:id", (req, res) => res.json({ success: true, mode: "preview", operationalEnabled: false, data: adminDeliveryPreview(actor, req.params.id) }));
    app.get("/api/orders", (_req, res) => res.json({ success: true, data: [], pagination: { page: 1, pages: 1, total: 0 } }));
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
    for (const width of [1440,390,320]) {
      const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, serviceWorkers: "block", colorScheme: "light" }), page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await context.addCookies([{ name: "dg_session", value: jwt.sign({ id: actor._id, sv: 0 }, process.env.JWT_SECRET), url: origin }, { name: "dg_csrf", value: "owned-theme-csrf", url: origin }]);
      await context.route("https://**/*", route => route.fulfill({ status: 204 }));
      const theme = async value => { await page.waitForFunction(value => document.documentElement.dataset.workspaceTheme === value, value); if (await page.getByRole("switch", { name: "Light mode" }).count()) assert.equal(await page.getByRole("switch", { name: "Light mode" }).getAttribute("aria-checked"), String(value === "light")); };
      const toggle = async (target = page) => { if (!await target.getByRole("switch", { name: "Light mode" }).count()) await target.getByRole("button", { name: "Account menu" }).click(); await target.getByRole("switch", { name: "Light mode" }).click(); if (await target.getByRole("button", { name: "Account menu" }).getAttribute("aria-expanded").catch(() => "false") === "true") await target.getByRole("button", { name: "Account menu" }).click(); };
      const shot = async name => { await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow: ${name}, ${width}`); };
      const axe = async selector => {
        await page.addScriptTag({ path: path.join(root, "node_modules/axe-core/axe.min.js") });
        const violations = await page.evaluate(async selector => (await window.axe.run(document.querySelector(selector), { runOnly: { type: "tag", values: ["wcag2a","wcag2aa"] } })).violations.map(row => ({ id: row.id, nodes: row.nodes.map(node => node.target) })), selector);
        assert.deepEqual(violations, [], selector + " accessibility");
      };
      await page.goto(origin + "/admin"); await page.getByText("Total Orders", { exact: true }).waitFor(); await theme("dark");
      assert.equal(await page.locator("header").evaluate(node => getComputedStyle(node).backgroundColor), "rgba(8, 11, 13, 0.95)");
      await shot("admin-dark"); await toggle(); await theme("light");
      await shot("admin-light"); await axe("main");
      await page.reload(); await theme("light");
      await page.getByRole("button", { name: /Planner reminders/ }).click(); await page.getByRole("region", { name: "Planner notifications" }).waitFor();
      assert.equal(await page.locator("#planner-reminder-panel").evaluate(node => getComputedStyle(node).backgroundColor), "rgb(255, 255, 255)");
      await axe("#planner-reminder-panel"); await page.keyboard.press("Escape");
      await page.goto(origin + "/inventory/preparation-recipes"); await theme("light");
      await page.getByRole("button").filter({ has: page.getByText(recipe.name, { exact: true }) }).click();
      const quantity = page.getByLabel("Quantity 1", { exact: true }); await quantity.fill("0.75");
      const unit = await page.getByRole("combobox", { name: "Unit 1", exact: true }).innerText();
      await toggle(); await theme("dark"); await shot("preparation-dark");
      await toggle(); await theme("light");
      assert.equal(await quantity.inputValue(), "0.75"); assert.equal(await page.getByRole("combobox", { name: "Unit 1", exact: true }).innerText(), unit);
      await shot("preparation-light"); await axe("main");
      await page.getByRole("combobox", { name: "Stock item 1", exact: true }).click();
      assert.equal(await page.locator("[data-preparation-picker-panel]").evaluate(node => getComputedStyle(node).backgroundColor), "rgb(255, 255, 255)");
      await axe("[data-preparation-picker-panel]"); await shot("ingredient-popup-light"); await page.keyboard.press("Escape");
      await quantity.fill("0.5"); // restore fixture draft without saving
      await page.goto(origin + "/inventory/stock-in"); await theme("light");
      await page.getByRole("combobox", { name: "Inventory item", exact: true }).click();
      await page.getByRole("option").filter({ hasText: raw.name }).click();
      await page.getByRole("button", { name: "Expiry date", exact: true }).click();
      const date = page.getByRole("dialog", { name: "Choose date", exact: true }); await date.waitFor();
      await axe('[role="dialog"][aria-label="Choose date"]'); await shot("date-picker-light");
      await date.getByRole("textbox", { name: "Enter date", exact: true }).fill("31-12-2030"); await date.getByRole("button", { name: "Go", exact: true }).click();
      await page.getByLabel(/^Receive quantity/).fill("1"); await page.getByLabel("Reason", { exact: true }).fill("Read-only theme review");
      await page.getByRole("button", { name: "Review stock change", exact: true }).click();
      const confirm = page.getByRole("dialog", { name: "Confirm stock change", exact: true }); await confirm.waitFor(); await axe('dialog[open]'); await shot("stock-review-light");
      await confirm.getByRole("button", { name: "Go back", exact: true }).click();
      // Preview is an expected read-only POST, never a confirmation.
      assert.ok(writes.every(value => ["POST /api/inventory/movement-review/preview", "POST /api/inventory/preparation/availability"].includes(value)), JSON.stringify(writes));
      await page.goto(origin + "/inventory/stock-items"); await page.getByRole("heading", { name: "Stock Items", exact: true }).waitFor();
      await shot("stock-items-light"); await axe("main");
      if (width < 1024) { await page.getByRole("button", { name: "Open inventory navigation" }).click(); await shot("inventory-navigation-light"); await page.keyboard.press("Escape"); }
      await page.goto(origin + "/admin/deliveries?preview=1"); await theme("light");
      await page.getByRole("region", { name: "Delivery orders", exact: true }).waitFor(); await shot("deliveries-light"); await axe("main");
      await page.getByRole("button", { name: "Assign Rider", exact: true }).first().click();
      const delivery = page.getByRole("dialog", { name: "Delivery details & actions", exact: true }); await delivery.waitFor();
      await delivery.getByText("PREVIEW-A", { exact: true }).first().waitFor(); await shot("delivery-drawer-light"); await axe('dialog[open]');
      await delivery.getByRole("button", { name: "Close Delivery details & actions", exact: true }).click();
      if (width === 1440) {
        const second = await context.newPage(); await second.goto(origin + "/admin/record-search");
        await toggle(second); await theme("dark"); await second.close();
        await page.getByRole("switch", { name: "Light mode" }).focus(); await page.keyboard.press("Space"); await theme("light");
      }
      await page.goto(origin + "/login"); assert.equal(await page.locator("html").getAttribute("data-workspace-theme"), null);
      assert.equal(await page.locator("body").evaluate(node => getComputedStyle(node).backgroundColor), "rgb(0, 0, 0)");
      await page.goto(origin + "/admin/record-search"); await theme("light");
      await toggle(); await theme("dark"); await page.reload(); await theme("dark");
      assert.deepEqual(errors, []); await context.close();
      console.log(`PASS ${width}px: dark default, persisted light, Admin/Inventory, portals, draft retention, keyboard, accessibility, public scope and unchanged stock`);
    }
    const blocked = await browser.newContext({ serviceWorkers: "block" }); await blocked.addCookies([{ name: "dg_session", value: jwt.sign({ id: actor._id, sv: 0 }, process.env.JWT_SECRET), url: origin }]);
    await blocked.addInitScript(() => {
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Object.defineProperty(Storage.prototype, "getItem", { value: function (key) { if (key === "dg-workspace-theme") throw Error("Owned blocked theme preference"); return get.call(this, key); } });
      Object.defineProperty(Storage.prototype, "setItem", { value: function (key, value) { if (key === "dg-workspace-theme") throw Error("Owned blocked theme preference"); return set.call(this, key, value); } });
    });
    const blockedPage = await blocked.newPage(); await blockedPage.goto(origin + "/admin/record-search"); await blockedPage.getByRole("switch", { name: "Light mode" }).click();
    await blockedPage.waitForFunction(() => document.documentElement.dataset.workspaceTheme === "light"); await blocked.close();
    assert.equal(await snapshot(), before, "Theme changes and stock review preserve every stock/cost/recipe record");
    console.log("Workspace theme artifacts: " + output);
  } catch (error) {
    for (const context of browser?.contexts() || []) for (const page of context.pages()) { await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }); console.error(page.url(), (await page.locator("body").innerText()).slice(0, 4000)); }
    console.error("Artifacts: " + output); throw error;
  } finally { await browser?.close(); if (next) { next.kill(); await new Promise(resolve => next.exitCode != null ? resolve() : next.once("exit", resolve)); } if (backend) await new Promise(resolve => backend.close(resolve)); }
});
