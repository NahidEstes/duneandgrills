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
import MenuAddOn from "../../backend/models/MenuAddOn.js";
import InventoryItem from "../../backend/models/InventoryItem.js";
import InventoryCategory from "../../backend/models/InventoryCategory.js";
import InventoryBatch from "../../backend/models/InventoryBatch.js";
import InventoryRecipe from "../../backend/models/InventoryRecipe.js";
import AddOnInventoryRecipe from "../../backend/models/AddOnInventoryRecipe.js";
import StockTransaction from "../../backend/models/StockTransaction.js";
import Production from "../../backend/models/Production.js";
import { saveSellingRecipe, getSellingRecipe } from "../../backend/services/sellingRecipeService.js";
import { savePreparationRecipe } from "../../backend/services/preparationService.js";
import inventoryRoutes from "../../backend/routes/inventoryRoutes.js";

// No dotenv, external URI or shared service. Everything runs on owned loopback fixtures.
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "owned-selling-recipe-browser"; process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "false";
const root = path.resolve(import.meta.dirname, ".."), output = await mkdtemp(path.join(tmpdir(), "dg-selling-recipes-browser-"));
let browser, next, backend, logs = "", failList = false;
await withIsolatedMongo(async () => {
  try {
    const actor = await User.create({ name: "Owned recipe admin", email: "selling-browser@fixture.invalid", password: "OwnedPassword123!", role: "admin" });
    const category = await InventoryCategory.create({ name: "Owned browser stock", skuPrefix: "SBR" });
    const raw = await InventoryItem.create({ name: "ZZZ raw flour", sku: "SBR-RAW", category: category._id, unit: "kg", currentStock: 100, unitCost: 10 });
    await InventoryItem.insertMany(Array.from({ length: 125 }, (_, i) => ({ name: "AAA filler " + i, sku: "SBR-FILLER-" + i, category: category._id, unit: "g", currentStock: 0, unitCost: 0 })));
    const app = express(); app.use(express.json());
    app.get(["/api/auth/me","/api/auth/session"], (_req, res) => res.json({ success: true, user: { _id: actor._id, name: actor.name, role: actor.role } }));
    app.use("/api/inventory", (req, res, done) => failList && req.path === "/recipes" ? res.status(503).json({ success: false, message: "Owned list refresh failure" }) : done(), inventoryRoutes);
    app.get("/api/settings/public", (_req, res) => res.json({ success: true, data: { location: {}, openingHours: [] } }));
    app.get("/api/cart", (_req, res) => res.json({ success: true, data: { items: [] } }));
    app.get("/api/orders/config", (_req, res) => res.json({ success: true, data: { websiteOrderingEnabled: false } }));
    app.use((_req, res) => res.json({ success: true, data: [] }));
    app.use((error, _req, res, _next) => res.status(error.status || 400).json({ success: false, message: error.message }));
    backend = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
    const probe = createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    const origin = "http://127.0.0.1:" + port, env = { ...process.env, NODE_ENV: "production", BACKEND_API_URL: "http://127.0.0.1:" + backend.address().port + "/api", SITE_URL: origin, SITE_ENV: "staging" };
    for (const key of Object.keys(env)) if (/MONGO|DATABASE|JWT_SECRET|API_PROXY_SECRET|RESEND|CUSTOMER_EMAIL/i.test(key)) delete env[key];
    next = spawn(process.execPath, ["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p",String(port)], { cwd: root, env, windowsHide: true, stdio: ["ignore","pipe","pipe"] });
    next.stdout.on("data", value => logs += value); next.stderr.on("data", value => logs += value);
    for (let attempt = 0; attempt < 100; attempt++) { try { await fetch(origin + "/login"); break; } catch { if (next.exitCode != null) throw Error(logs); await new Promise(resolve => setTimeout(resolve, 200)); } }
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    for (const width of [1440,390,320]) {
      const finished = await InventoryItem.create({ name: "ZZZ prepared sauce " + width, sku: "SBR-PREPARED-" + width, category: category._id, unit: "kg", currentStock: 0, unitCost: 0 });
      const prep = await savePreparationRecipe(actor, { name: "Owned sauce recipe " + width, finishedItem: String(finished._id), outputQuantity: 1, outputUnit: "kg", isActive: true, ingredients: [{ inventoryItem: String(raw._id), quantity: 1, unit: "kg" }] });
      const makeMenu = name => MenuItem.create({ name, description: "Owned fixture", category: "Food", price: 20, image: "/fixture.jpg" });
      const dish = await makeMenu("Owned dish " + width), source = await makeMenu("Owned source " + width);
      const recipe = quantity => ({ expectedRevision: null, isActive: true, doNotTrack: false, ingredients: [{ inventoryItem: String(finished._id), quantity, enteredUnit: "g", isActive: true }] });
      await saveSellingRecipe(actor, "menu", String(dish._id), recipe(250));
      await saveSellingRecipe(actor, "menu", String(source._id), { ...recipe(500), ingredients: [{ inventoryItem: String(raw._id), quantity: 500, enteredUnit: "g", isActive: true }] });
      const addon = await MenuAddOn.create({ name: "Owned extra " + width, price: 2, menuItems: [dish._id] });
      await saveSellingRecipe(actor, "addon", String(addon._id), { ...recipe(100), ingredients: [{ inventoryItem: String(raw._id), quantity: 100, enteredUnit: "g", isActive: true }] });
      const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, serviceWorkers: "block" }), page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await context.addCookies([{ name: "dg_session", value: jwt.sign({ id: actor._id, sv: 0 }, process.env.JWT_SECRET), url: origin }, { name: "dg_csrf", value: "owned-browser-csrf", url: origin }]);
      await context.route("https://**", route => route.fulfill({ status: 200, body: "" }));
      const chooseDish = async name => { await page.getByRole("button").filter({ has: page.getByText(name, { exact: true }) }).click(); await page.getByRole("heading", { name, exact: true }).waitFor(); };
      const shot = async name => { await page.screenshot({ path: path.join(output, name + "-" + width + ".png"), fullPage: true }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + " overflow"); };
      const axe = async () => { await page.addScriptTag({ path: path.join(root, "node_modules/axe-core/axe.min.js") }); const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector("main"), { runOnly: { type: "tag", values: ["wcag2a","wcag2aa"] } })).violations.map(row => row.id + ": " + row.nodes.map(node => node.target.join(" ")).join(", "))); assert.deepEqual(violations, []); };
      const waitReview = async () => page.waitForFunction(() => document.querySelector('[aria-label="Stock planner"]')?.textContent.includes("Available portions:"));
      await page.goto(origin + "/inventory/recipes"); await chooseDish(dish.name); await waitReview();
      assert.equal(await page.getByRole("combobox", { name: "Inventory item 1", exact: true }).innerText(), finished.name + " · " + finished.sku + " · kg");
      assert.equal(await page.getByLabel("Quantity per sale 1", { exact: true }).inputValue(), "250");
      const before = await StockTransaction.countDocuments(), rawBefore = (await InventoryItem.findById(raw._id)).currentStock;
      await page.getByRole("combobox", { name: "Inventory item 1", exact: true }).click();
      await page.getByLabel("Search inventory item 1", { exact: true }).fill(raw.sku);
      await page.getByLabel("Ingredient type", { exact: true }).selectOption("raw");
      await page.getByRole("option").filter({ hasText: raw.name + " · Raw" }).waitFor();
      await page.getByRole("button", { name: "Close item search", exact: true }).click();
      const ghosts = [], dismissGhost = dialog => { ghosts.push(dialog.message()); dialog.dismiss(); };
      page.on("dialog", dismissGhost); await page.getByRole("button", { name: "Add-on Recipes", exact: true }).click(); await chooseDish(addon.name); page.off("dialog", dismissGhost); assert.deepEqual(ghosts, []);
      await page.getByRole("button", { name: "Menu Item Recipes", exact: true }).click(); await chooseDish(dish.name); await waitReview();
      await page.getByLabel("Quantity per sale 1", { exact: true }).fill("300"); await waitReview();
      await page.getByLabel("Search recipes", { exact: true }).fill("No such recipe"); await page.getByText("No matching recipes", { exact: true }).waitFor();
      assert.equal(await page.getByLabel("Quantity per sale 1", { exact: true }).inputValue(), "300");
      await page.getByLabel("Search recipes", { exact: true }).fill(""); await page.getByRole("button").filter({ has: page.getByText(source.name, { exact: true }) }).waitFor();
      page.once("dialog", dialog => dialog.dismiss()); await page.getByRole("button", { name: "Add-on Recipes", exact: true }).click();
      assert.equal(await page.getByLabel("Quantity per sale 1", { exact: true }).inputValue(), "300");
      if (width === 320) {
        await context.setOffline(true); await page.getByRole("alert").filter({ hasText: "Offline." }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Update Recipe", exact: true }).isDisabled(), true);
        await context.setOffline(false); await waitReview();
      }
      // Preparation reads and production preserve the unsaved selling recipe draft.
      await page.getByRole("button", { name: "View preparation recipe", exact: true }).click();
      const definition = page.getByRole("dialog", { name: "Recipe · " + prep.name, exact: true }); await definition.waitFor(); assert.equal(await StockTransaction.countDocuments(), before);
      await definition.getByRole("button", { name: "Close Recipe · " + prep.name, exact: true }).click();
      await page.getByRole("button", { name: "Produce " + finished.name, exact: true }).click();
      const workspace = page.getByRole("region", { name: "Production workspace", exact: true });
      await workspace.getByRole("button", { name: "Use one full batch", exact: true }).click();
      await workspace.getByRole("button", { name: "Review & confirm production", exact: true }).click();
      const confirmation = page.getByRole("dialog", { name: "Confirm production", exact: true }); await confirmation.waitFor();
      assert.equal(await StockTransaction.countDocuments(), before);
      await confirmation.getByRole("button", { name: "Confirm production", exact: true }).click();
      await workspace.getByRole("heading", { name: "Production confirmed", exact: true }).waitFor();
      await workspace.getByRole("button", { name: "Continue to " + dish.name + " recipe draft", exact: true }).click(); await workspace.waitFor({ state: "hidden" }); await waitReview();
      assert.equal(await page.getByLabel("Quantity per sale 1", { exact: true }).inputValue(), "300");
      assert.equal(await Production.countDocuments({ recipe: prep._id }), 1); assert.equal((await InventoryItem.findById(raw._id)).currentStock, rawBefore - 1);
      assert.equal((await InventoryRecipe.findOne({ menuItem: dish._id })).ingredients[0].quantityPerSale, .25);
      await page.getByLabel("Plan portions", { exact: true }).fill("5"); await page.getByText("0.5 kg", { exact: true }).waitFor(); await shot("shortage-draft"); await axe();
      // Definite save survives a failed list refresh; double clicks never add another version.
      if (width === 1440) failList = true;
      const previous = await getSellingRecipe("menu", dish._id);
      await page.getByRole("button", { name: "Update Recipe", exact: true }).dblclick();
      await page.getByText("Recipe saved. Stock and historical order costs are unchanged.", { exact: true }).waitFor();
      assert.equal((await InventoryRecipe.findOne({ menuItem: dish._id })).__v, previous.recipe.__v + 1);
      assert.equal(await page.getByText("Saved version", { exact: true }).isVisible(), true);
      if (width === 1440) { await page.getByText(/Owned list refresh failure/).first().waitFor(); failList = false; await page.getByRole("button", { name: "Retry list", exact: true }).click(); }
      if (width === 390) {
        await page.getByLabel("Quantity per sale 1", { exact: true }).fill("310");
        const prior = await getSellingRecipe("menu", dish._id);
        await context.route("**/api/inventory/recipes/" + dish._id, async route => { await route.fetch(); await route.abort("failed"); }, { times: 1 });
        await page.getByRole("button", { name: "Update Recipe", exact: true }).click();
        await page.getByRole("alert").filter({ hasText: "Your draft is retained." }).waitFor();
        assert.equal(await page.getByLabel("Quantity per sale 1", { exact: true }).inputValue(), "310");
        assert.equal((await InventoryRecipe.findOne({ menuItem: dish._id })).__v, prior.recipe.__v + 1);
        assert.equal(await page.getByRole("button", { name: "Update Recipe", exact: true }).isDisabled(), true);
        await page.getByRole("button", { name: "Review saved version", exact: true }).click(); page.once("dialog", dialog => dialog.accept());
        await page.getByRole("dialog", { name: "Review saved version", exact: true }).getByRole("button", { name: "Load saved version into editor", exact: true }).click();
      }
      // Copy only changes the draft, preserving destination price/status and source.
      await page.getByRole("button", { name: "Copy from recipe", exact: true }).click();
      const copy = page.getByRole("dialog", { name: "Copy ingredients into " + dish.name, exact: true });
      await copy.getByRole("button", { name: source.name, exact: true }).click(); await copy.getByRole("button", { name: "Replace draft ingredients", exact: true }).click();
      assert.equal(await page.getByLabel("Quantity per sale 1", { exact: true }).inputValue(), "500");
      assert.equal((await InventoryRecipe.findOne({ menuItem: dish._id })).ingredients[0].quantityPerSale, width === 390 ? .31 : .3);
      assert.equal((await InventoryRecipe.findOne({ menuItem: source._id })).ingredients[0].quantityPerSale, .5);
      await page.getByRole("button", { name: "Review saved version", exact: true }).click();
      const latest = page.getByRole("dialog", { name: "Review saved version", exact: true }); page.once("dialog", dialog => dialog.accept()); await latest.getByRole("button", { name: "Load saved version into editor", exact: true }).click();
      await page.getByRole("button", { name: "View history", exact: true }).click();
      const history = page.getByRole("dialog", { name: "Recipe history · " + dish.name, exact: true }); await history.getByText("INVENTORY_RECIPE_UPDATED", { exact: false }).first().waitFor(); await shot("recipe-history"); await axe(); await history.getByRole("button", { name: "Close Recipe history · " + dish.name, exact: true }).click();
      // A concurrent save rejects the old editor without losing its draft.
      await page.getByLabel("Quantity per sale 1", { exact: true }).fill("350"); await waitReview();
      const concurrent = await getSellingRecipe("menu", dish._id);
      await saveSellingRecipe(actor, "menu", String(dish._id), { ...recipe(400), expectedRevision: concurrent.recipeRevision });
      await page.getByRole("button", { name: "Update Recipe", exact: true }).click(); await page.getByRole("alert").filter({ hasText: "Recipe changed" }).waitFor();
      assert.equal(await page.getByLabel("Quantity per sale 1", { exact: true }).inputValue(), "350");
      await page.getByRole("button", { name: "Review saved version", exact: true }).click(); page.once("dialog", dialog => dialog.accept()); await page.getByRole("dialog", { name: "Review saved version", exact: true }).getByRole("button", { name: "Load saved version into editor", exact: true }).click();
      // Explicit exclusion confirms twice and records a reason. No stock moves.
      const noTrackingBefore = await StockTransaction.countDocuments();
      await page.getByLabel("Do not track inventory", { exact: true }).check(); await page.getByRole("button", { name: "Update Recipe", exact: true }).click();
      const tracking = page.getByRole("dialog", { name: "Confirm Do Not Track", exact: true }); await tracking.waitFor();
      assert.equal(await tracking.getByRole("button", { name: "Confirm and save exclusion", exact: true }).isDisabled(), true);
      await tracking.getByLabel("I confirm clearing this mapping and disabling tracking", { exact: true }).check(); await tracking.getByLabel("Reason for disabling tracking", { exact: true }).fill("Owned browser non-stock exclusion");
      await tracking.getByRole("button", { name: "Confirm and save exclusion", exact: true }).click(); await tracking.waitFor({ state: "hidden" });
      assert.equal((await InventoryRecipe.findOne({ menuItem: dish._id })).ingredients.length, 0); assert.equal(await StockTransaction.countDocuments(), noTrackingBefore);
      await page.getByRole("button", { name: "Add-on Recipes", exact: true }).click(); await chooseDish(addon.name); await waitReview();
      await page.getByLabel("Quantity per add-on 1", { exact: true }).fill("200"); await page.getByRole("button", { name: "Update Recipe", exact: true }).click(); await page.getByText("Saved version", { exact: true }).waitFor(); assert.equal((await AddOnInventoryRecipe.findOne({ addOn: addon._id })).ingredients[0].quantityPerAddOn, .2);
      await page.getByLabel("Export scope", { exact: true }).selectOption("all"); const downloadEvent = page.waitForEvent("download"); await page.getByRole("button", { name: "Export recipes", exact: true }).click(); const download = await downloadEvent; await download.saveAs(path.join(output, "addons-" + width + ".csv")); assert.equal(await download.failure(), null);
      await shot("addon-editor"); await axe(); assert.deepEqual(errors, []); await context.close();
      console.log("PASS " + width + "px: >100 picker, no phantom dirty state, retained draft/search/production, server conversion, safe save/conflict, history/copy, explicit exclusion, add-on save/export and accessibility");
    }
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["tests/stockRecipeBrowserSmoke.mjs"], { cwd: root, env: { ...process.env, STOCK_RECIPE_SMOKE_URL: origin }, windowsHide: true, stdio: "inherit" });
      child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(Error("Stock recipe smoke failed: " + code)));
    });
    console.log("Selling recipe browser artifacts: " + output);
  } catch (error) {
    for (const context of browser?.contexts() || []) for (const page of context.pages()) { await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }); console.error(page.url(), (await page.locator("body").innerText()).slice(0, 6500)); }
    console.error("Artifacts: " + output); throw error;
  } finally {
    await browser?.close(); if (next) { next.kill(); await new Promise(resolve => next.exitCode != null ? resolve() : next.once("exit", resolve)); } if (backend) await new Promise(resolve => backend.close(resolve));
  }
});
