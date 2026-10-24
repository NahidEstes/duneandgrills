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
import MenuItem from "../../backend/models/MenuItem.js";
import InventoryItem from "../../backend/models/InventoryItem.js";
import InventoryCategory from "../../backend/models/InventoryCategory.js";
import InventoryRecipe from "../../backend/models/InventoryRecipe.js";
import StockTransaction from "../../backend/models/StockTransaction.js";
import inventoryRoutes from "../../backend/routes/inventoryRoutes.js";
import { saveSellingRecipe, getSellingRecipe } from "../../backend/services/sellingRecipeService.js";
import { savePreparationRecipe } from "../../backend/services/preparationService.js";

// Owned local servers and disposable database only. No live inventory access.
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "owned-conversion-browser"; process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "false";
const root = path.resolve(import.meta.dirname, ".."), output = await mkdtemp(path.join(tmpdir(), "dg-conversion-browser-"));
let browser, next, backend, logs = "";
await withIsolatedMongo(async () => {
  try {
    const actor = await User.create({ name: "Conversion browser admin", email: "conversion-browser@fixture.invalid", password: "OwnedPassword123!", role: "admin" });
    const category = await InventoryCategory.create({ name: "Conversion stock", skuPrefix: "CBR" });
    const app = express(); app.use(express.json());
    app.get(["/api/auth/me", "/api/auth/session"], (_req, res) => res.json({ success: true, user: { _id: actor._id, name: actor.name, role: actor.role } }));
    app.use("/api/inventory", inventoryRoutes);
    app.get("/api/settings/public", (_req, res) => res.json({ success: true, data: {} }));
    app.get("/api/orders/config", (_req, res) => res.json({ success: true, data: { websiteOrderingEnabled: false } }));
    app.use((_req, res) => res.json({ success: true, data: [] }));
    app.use((error, _req, res, _next) => res.status(error.status || 400).json({ success: false, message: error.message }));
    backend = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    const probe = createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    const origin = "http://127.0.0.1:" + port, env = { ...process.env, NODE_ENV: "production", BACKEND_API_URL: "http://127.0.0.1:" + backend.address().port + "/api", SITE_URL: origin, SITE_ENV: "staging" };
    for (const key of Object.keys(env)) if (/MONGO|DATABASE|JWT_SECRET|API_PROXY_SECRET|RESEND|CUSTOMER_EMAIL/i.test(key)) delete env[key];
    next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    next.stdout.on("data", value => logs += value); next.stderr.on("data", value => logs += value);
    for (let attempt = 0; attempt < 100; attempt++) { try { await fetch(origin + "/login"); break; } catch { if (next.exitCode != null) throw Error(logs); await new Promise(resolve => setTimeout(resolve, 200)); } }
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    for (const width of [1440, 390, 320]) {
      const oil = await InventoryItem.create({ name: "Conversion oil " + width, sku: "CBR-" + width, category: category._id, unit: "L", purchaseUnit: "L", unitCost: 10, currentStock: 10 });
      const dish = await MenuItem.create({ name: "Conversion dish " + width, description: "Owned fixture", price: 20, image: "/fixture.jpg", category: "Food" });
      const sauce = await InventoryItem.create({ name: "Conversion sauce " + width, sku: "CBR-SAUCE-" + width, category: category._id, unit: "kg" });
      await saveSellingRecipe(actor, "menu", dish._id, { expectedRevision: null, isActive: true, doNotTrack: false, ingredients: [{ inventoryItem: String(oil._id), quantity: .02, enteredUnit: "L", isActive: true }] });
      const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: "block" }), page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await context.addCookies([{ name: "dg_session", value: jwt.sign({ id: actor._id, sv: 0 }, process.env.JWT_SECRET), url: origin }, { name: "dg_csrf", value: "owned-conversion-csrf", url: origin }]);
      await context.route("https://**", route => route.fulfill({ status: 200, body: "" }));
      const shot = async name => { await page.screenshot({ path: path.join(output, name + "-" + width + ".png"), fullPage: true }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + " overflow"); };
      const select = async (name, value) => { await page.getByRole("combobox", { name, exact: true }).click(); await page.getByRole("option", { name: value, exact: true }).click(); };
      const editStock = async () => { await page.goto(origin + "/inventory/stock-items?edit=" + oil._id); await page.getByRole("form", { name: "Stock item details" }).waitFor(); };
      const waitSaved = async () => { await page.getByRole("button", { name: "Save changes", exact: true }).click(); await page.getByRole("form", { name: "Stock item details" }).waitFor({ state: "detached" }); };
      await editStock();
      assert.equal(await page.getByLabel("Enable weight–volume conversion").isChecked(), false);
      await page.getByLabel("Enable weight–volume conversion").check();
      assert.equal(await page.getByLabel("Grams per liter", { exact: true }).inputValue(), "");
      await page.getByLabel("Grams per liter", { exact: true }).fill("920");
      await page.getByLabel("Conversion verification note").pressSequentially("Verified product measurement", { delay: 15 });
      assert.equal(await page.getByLabel("Conversion verification note").inputValue(), "Verified product measurement");
      await shot("stock-item-conversion"); await waitSaved();
      assert.equal((await InventoryItem.findById(oil._id)).currentStock, 10); assert.equal((await InventoryItem.findById(oil._id)).unitCost, 10);
      await page.goto(origin + "/inventory/recipes");
      await page.getByRole("button").filter({ has: page.getByText(dish.name, { exact: true }) }).click();
      await select("Entered unit 1", "g"); await page.getByLabel("Quantity per sale 1", { exact: true }).fill("20");
      await page.getByRole("button", { name: "Update Recipe", exact: true }).waitFor();
      await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(node => node.textContent.trim() === "Update Recipe")?.disabled);
      await page.getByText(/Stock usage: ≈ 0\.021739 L/).waitFor(); await shot("recipe-grams-preview");
      await page.getByRole("button", { name: "Update Recipe", exact: true }).click();
      await page.getByText("Saved version", { exact: true }).first().waitFor();
      assert.equal((await getSellingRecipe("menu", dish._id)).recipe.ingredients[0].quantityPerSale, .021739);
      assert.equal(await StockTransaction.countDocuments(), 0);
      await savePreparationRecipe(actor, { name: "Conversion prep " + width, finishedItem: String(sauce._id), outputQuantity: 500, outputUnit: "g", isActive: true, ingredients: [{ inventoryItem: String(oil._id), quantity: 20, unit: "g", expectedGramsPerLiter: 920 }] });
      await editStock(); await page.getByLabel("Grams per liter", { exact: true }).fill("900"); await waitSaved();
      await page.goto(origin + "/inventory/recipes"); await page.getByRole("button").filter({ has: page.getByText(dish.name, { exact: true }) }).click();
      await page.getByText(/Saved conversion: 1 L = 920 g/).waitFor();
      await page.getByText(/Stock usage: ≈ 0\.021739 L/).waitFor();
      await page.getByLabel("Apply current conversion to this quantity").check();
      await page.getByText(/Stock usage: ≈ 0\.022222 L/).waitFor();
      await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(node => node.textContent.trim() === "Update Recipe")?.disabled);
      await page.getByRole("button", { name: "Update Recipe", exact: true }).click(); await page.getByText("Saved version", { exact: true }).first().waitFor();
      assert.equal((await InventoryRecipe.findOne({ menuItem: dish._id })).ingredients[0].quantityPerSale, .022222);
      await editStock(); await page.getByLabel("Enable weight–volume conversion").uncheck(); await waitSaved();
      await page.goto(origin + "/inventory/preparation-recipes");
      await page.getByRole("button").filter({ has: page.getByText("Conversion prep " + width, { exact: true }) }).click();
      await page.getByText(/Conversion is currently disabled/).waitFor();
      await page.getByLabel("Preparation notes (optional)").fill("Unrelated edit keeps saved quantities");
      await shot("preparation-conversion-disabled");
      await page.getByRole("button", { name: "Save recipe", exact: true }).click();
      await page.getByText("Recipe saved. Stock balances are unchanged.", { exact: true }).waitFor();
      assert.equal((await InventoryItem.findById(oil._id)).currentStock, 10); assert.equal(await StockTransaction.countDocuments(), 0);
      assert.deepEqual(errors, []);
      console.log("PASS conversion form, recipe preview, explicit reapply and disabled preparation at " + width + "px");
      await context.close();
    }
    console.log("Conversion browser artifacts: " + output);
  } catch (error) {
    for (const context of browser?.contexts() || []) for (const page of context.pages()) { await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }); console.error(page.url(), (await page.locator("body").innerText()).slice(0, 6500)); }
    console.error("Artifacts: " + output); throw error;
  } finally {
    await browser?.close(); if (next) { next.kill(); await new Promise(resolve => next.exitCode != null ? resolve() : next.once("exit", resolve)); } if (backend) await new Promise(resolve => backend.close(resolve));
  }
});
