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
import { savePreparationRecipe } from "../../backend/services/preparationService.js";
import inventoryRoutes from "../../backend/routes/inventoryRoutes.js";

// Real production controllers/models, but only an owned temporary replica set,
// loopback Express/Next and fixture users/items. No dotenv or external API.
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "owned-preparation-browser-fixture";
process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "false";
const root = path.resolve(import.meta.dirname, ".."), output = await mkdtemp(path.join(tmpdir(), "dg-preparation-workflow-browser-"));
let browser, next, backend, logs = "", failHistory = false, failYield = false;
await withIsolatedMongo(async () => {
  try {
    const actor = await User.create({ name: "Owned preparation admin", email: "preparation-browser@fixture.invalid", password: "OwnedPassword123!", role: "admin" });
    const category = await InventoryCategory.create({ name: "Owned browser stock", skuPrefix: "PBR" });
    // Exercise long ingredient names throughout narrow-screen entry and stock/source reviews.
    const raw = await InventoryItem.create({ name: "Owned raw ingredient with a long supplier description for checking narrow-screen ingredient cards and stock previews", sku: "PBR-RAW", category: category._id, unit: "kg", currentStock: 100, unitCost: 10 });
    const finished = {};
    for (const width of [1440,390,320]) finished[width] = await InventoryItem.create({ name: `Owned prepared sauce ${width}`, sku: `PBR-SAUCE-${width}`, category: category._id, unit: "kg", currentStock: 0, tracksExpiry: true });
    // Prepared choices must remain available beyond the first 100 stock items.
    await InventoryItem.insertMany(Array.from({ length: 125 }, (_, index) => ({ name: `A filler ${index}`, sku: `PBR-FILLER-${index}`, category: category._id, unit: "g", currentStock: 0, unitCost: 0 })));
    const app = express(); app.use(express.json());
    app.get(["/api/auth/me", "/api/auth/session"], (_req, res) => res.json({ success: true, user: { _id: actor._id, name: actor.name, role: actor.role } }));
    app.use("/api/inventory", (req, res, done) => (failHistory && req.path === "/production") || (failYield && req.path === "/production/yield-report") ? res.status(503).json({ success: false, message: "Owned inventory report unavailable" }) : done(), inventoryRoutes);
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
      const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, serviceWorkers: "block" }), page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await context.addCookies([{ name: "dg_session", value: jwt.sign({ id: actor._id, sv: 0 }, process.env.JWT_SECRET), url: origin }, { name: "dg_csrf", value: "owned-browser-csrf", url: origin }]);
      await context.route("https://**", route => route.fulfill({ status: 200, body: "" }));
      const shot = async name => { await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`); };
      const select = async (label, option) => { await page.getByRole("combobox", { name: label }).click(); await page.getByRole("option", { name: option, exact: true }).click(); };
      const axe = async () => { await page.addScriptTag({ path: path.join(root, "node_modules/axe-core/axe.min.js") }); const problems = await page.evaluate(async () => (await window.axe.run(document.querySelector("main"), { runOnly: { type: "tag", values: ["wcag2a","wcag2aa"] } })).violations.map(row => `${row.id}: ${row.nodes.map(node => node.target.join(" ")).join(", ")}`)); assert.deepEqual(problems, []); };
      const prepared = finished[width];
      const child = await savePreparationRecipe(actor, { name: 'Owned sliced recipe ' + width, finishedItem: String(prepared._id), isActive: true, outputQuantity: 900, outputUnit: 'g', ingredients: [{ inventoryItem: String(raw._id), quantity: 1000, unit: 'g' }] });
      const outputItem = await InventoryItem.create({ name: 'Owned caramelized ' + width, sku: 'PBR-CARAMEL-' + width, category: category._id, unit: 'g', currentStock: 0 });
      const parent = await savePreparationRecipe(actor, { name: 'Owned caramelized recipe ' + width, finishedItem: String(outputItem._id), isActive: true, outputQuantity: 450, outputUnit: 'g', ingredients: [{ inventoryItem: String(prepared._id), quantity: 500, unit: 'g' }] });
      const rawBefore = (await InventoryItem.findById(raw._id)).currentStock;
      await page.goto(origin + '/inventory/preparation-recipes');
      await page.getByLabel('Search preparation recipes', { exact: true }).fill(parent.name);
      await page.getByRole('button').filter({ has: page.getByText(parent.name, { exact: true }) }).click();
      const stockPicker = page.getByRole('combobox', { name: 'Stock item 1', exact: true });
      assert.equal(await page.getByLabel('Search stock item 1', { exact: true }).count(), 0, 'Closed picker exposes only one selection field');
      const quantityBeforeFilter = await page.getByLabel('Quantity 1', { exact: true }).inputValue();
      const unitBeforeFilter = await page.getByRole('combobox', { name: 'Unit 1', exact: true }).innerText();
      const movementsBeforeFilter = await StockTransaction.countDocuments();
      await stockPicker.click();
      assert.equal(await page.getByRole('option').count(), 50);
      await page.getByRole('button', { name: 'Load more ingredients', exact: true }).click();
      assert.equal(await page.getByRole('option').count(), 100);
      await page.getByLabel('Search stock item 1', { exact: true }).fill('no-matching-stock-item');
      await page.getByRole('status').filter({ hasText: 'No matching ingredients.' }).waitFor();
      await page.keyboard.press('Escape');
      assert.ok((await stockPicker.innerText()).includes(prepared.name), 'An empty search does not clear the selected ingredient');
      assert.equal(await page.getByLabel('Quantity 1', { exact: true }).inputValue(), quantityBeforeFilter);
      assert.equal(await page.getByRole('combobox', { name: 'Unit 1', exact: true }).innerText(), unitBeforeFilter);
      const searchGhosts = [], dismissSearchGhost = dialog => { searchGhosts.push(dialog.message()); dialog.dismiss(); };
      page.on('dialog', dismissSearchGhost); await page.getByRole('button').filter({ has: page.getByText(parent.name, { exact: true }) }).click(); page.off('dialog', dismissSearchGhost);
      assert.deepEqual(searchGhosts, [], 'Search and pagination alone must not create unsaved recipe edits');
      await page.getByRole('combobox', { name: 'Stock item 1', exact: true }).click();
      await page.getByLabel('Search stock item 1', { exact: true }).fill(prepared.sku);
      await page.getByRole('group', { name: 'Ingredient type 1', exact: true }).getByRole('button', { name: 'Prepared', exact: true }).click();
      await shot('unified-ingredient-picker');
      const anchorBox = await stockPicker.boundingBox(), popupBox = await page.locator('[data-preparation-picker-panel]').boundingBox();
      assert.ok(Math.min(Math.abs(popupBox.y + popupBox.height - anchorBox.y), Math.abs(popupBox.y - anchorBox.y - anchorBox.height)) <= 8, 'Filtered popup stays attached to its field when opening above or below');
      await page.addScriptTag({ path: path.join(root, 'node_modules/axe-core/axe.min.js') });
      assert.deepEqual(await page.evaluate(async () => (await window.axe.run(document.querySelector('[data-preparation-picker-panel]'), { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa'] } })).violations.map(row => row.id)), []);
      await page.getByLabel('Search stock item 1', { exact: true }).press('ArrowDown');
      assert.equal(await page.getByRole('option', { name: prepared.name + ' · Prepared', exact: true }).evaluate(node => node === document.activeElement), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.getByRole('combobox', { name: 'Unit 1', exact: true }).innerText(), unitBeforeFilter, 'Reselecting an item preserves its entered unit');
      assert.equal(await StockTransaction.countDocuments(), movementsBeforeFilter, 'Picker interactions never post stock');
      const ghostDialogs = [], catchGhost = dialog => { ghostDialogs.push(dialog.message()); dialog.dismiss(); };
      page.on('dialog', catchGhost); await page.getByRole('button').filter({ has: page.getByText(parent.name, { exact: true }) }).click(); page.off('dialog', catchGhost); assert.deepEqual(ghostDialogs, [], 'Ingredient search/filter is not a recipe edit');
      await page.getByLabel('Preparation notes (optional)', { exact: true }).fill('Owned retained recipe draft');
      const produce = page.getByRole('button', { name: 'Produce ' + prepared.name, exact: true });
      await produce.waitFor(); await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.startsWith('Produce Owned prepared') && !button.disabled));
      const initialMovements = await StockTransaction.countDocuments();
      await page.getByRole('button', { name: 'View recipe', exact: true }).click();
      const recipeDialog = page.getByRole('dialog', { name: 'Recipe · ' + child.name, exact: true }); await recipeDialog.waitFor();
      assert.equal(await StockTransaction.countDocuments(), initialMovements); await recipeDialog.getByRole('button', { name: 'Close Recipe · ' + child.name, exact: true }).click();
      if (width === 1440) {
        await context.route('**/api/inventory/preparation/availability', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Owned stock read unavailable' }) }), { times: 1 });
        await page.getByRole('button', { name: 'Refresh usable stock', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'Owned stock read unavailable' }).waitFor(); assert.equal(await produce.isDisabled(), true);
        await page.getByRole('button', { name: 'Refresh usable stock', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'Owned stock read unavailable' }).waitFor({ state: 'hidden' });
      }
      await shot('recipe-shortage'); await axe(); await produce.click();
      const workspace = page.getByRole('region', { name: 'Production workspace', exact: true });
      await workspace.getByRole('button', { name: 'Use one full batch', exact: true }).click();
      const pickUseBy = async () => { await workspace.getByRole('button', { name: 'Use by', exact: true }).click(); const calendar = page.getByRole('dialog', { name: 'Choose date', exact: true }); await calendar.getByPlaceholder('DD-MM-YYYY', { exact: true }).fill('02-01-2030'); await calendar.getByRole('button', { name: 'Go', exact: true }).click(); await page.keyboard.press('Escape'); };
      await pickUseBy();
      if (width === 320) { await context.setOffline(true); await workspace.getByText('Offline. Production cannot be previewed or confirmed.', { exact: true }).waitFor(); assert.equal(await workspace.getByRole('button', { name: 'Review & confirm production', exact: true }).isDisabled(), true); await context.setOffline(false); }
      const confirm = page.getByRole('dialog', { name: 'Confirm production', exact: true });
      await workspace.getByRole('button', { name: 'Review & confirm production', exact: true }).click(); await confirm.waitFor();
      assert.equal(await StockTransaction.countDocuments(), initialMovements);
      if (width === 1440) {
        await InventoryItem.updateOne({ _id: prepared._id }, { $inc: { stockVersion: 1 } });
        await confirm.getByRole('button', { name: 'Confirm production', exact: true }).click();
        await confirm.getByRole('alert').filter({ hasText: /changed since preview/ }).waitFor();
        await confirm.getByRole('button', { name: 'Go back', exact: true }).click();
        await workspace.getByRole('button', { name: 'Review again with same key', exact: true }).click();
        await workspace.getByRole('button', { name: 'Review & confirm production', exact: true }).click(); await confirm.waitFor();
      }
      if (width === 390) await context.route('**/api/inventory/production/confirm', async route => { await route.fetch(); await route.abort('failed'); }, { times: 1 });
      await confirm.getByRole('button', { name: 'Confirm production', exact: true }).click();
      if (width === 390) { await confirm.getByRole('alert').waitFor(); await confirm.getByRole('button', { name: 'Go back', exact: true }).click(); await workspace.getByRole('button', { name: 'Check saved result', exact: true }).click(); }
      await workspace.getByRole('heading', { name: 'Production confirmed', exact: true }).waitFor();
      assert.equal(await Production.countDocuments({ recipe: child._id }), 1); await shot('upstream-completed'); await axe();
      await workspace.getByRole('button', { name: 'Continue to ' + parent.name, exact: true }).click();
      await workspace.waitFor({ state: 'hidden' });
      assert.equal(await page.getByLabel('Preparation notes (optional)', { exact: true }).inputValue(), 'Owned retained recipe draft');
      assert.equal(await page.getByLabel('Quantity 1', { exact: true }).inputValue(), '500');
      await page.getByRole('button', { name: 'Save recipe', exact: true }).click(); await page.getByText('Recipe saved. Stock balances are unchanged.', { exact: true }).waitFor();
      await page.goto(origin + '/inventory/production'); await page.getByRole('button', { name: 'Record production', exact: true }).click();
      await select('Preparation recipe', parent.name + ' · v2');
      await page.getByLabel('Actual quantity 1', { exact: true }).fill('1000'); await page.getByLabel('Notes (optional)', { exact: true }).fill('Owned retained production draft');
      await select('Plan production by', 'Target output quantity'); await page.getByLabel('Planned target output', { exact: true }).fill('2000');
      const upstreamAction = workspace.getByRole('button', { name: 'Produce ' + prepared.name, exact: true });
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.startsWith('Produce Owned prepared') && !button.disabled));
      await upstreamAction.click(); await workspace.getByRole('button', { name: 'Use one full batch', exact: true }).click(); await pickUseBy();
      await workspace.getByRole('button', { name: 'Review & confirm production', exact: true }).click(); await confirm.waitFor(); await confirm.getByRole('button', { name: 'Confirm production', exact: true }).click();
      await workspace.getByRole('heading', { name: 'Production confirmed', exact: true }).waitFor(); await workspace.getByRole('button', { name: 'Continue to ' + parent.name, exact: true }).click();
      await workspace.getByText('Draft retained. Usable stock is being refreshed; review again before confirming.', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Actual quantity 1', { exact: true }).inputValue(), '1000'); assert.equal(await page.getByLabel('Notes (optional)', { exact: true }).inputValue(), 'Owned retained production draft');
      assert.equal(await page.getByLabel('Planned target output', { exact: true }).inputValue(), '2000'); await select('Plan production by', 'Batch multiplier');
      page.once('dialog', dialog => dialog.dismiss()); await workspace.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal(await page.getByLabel('Notes (optional)', { exact: true }).inputValue(), 'Owned retained production draft');
      await InventoryItem.updateOne({ _id: prepared._id }, { $set: { unitCost: 999 } });
      const beforeParent = await StockTransaction.countDocuments();
      await workspace.getByRole('button', { name: 'Review & confirm production', exact: true }).click(); await confirm.waitFor();
      const impact = confirm.getByRole('region', { name: 'Stock changes to confirm', exact: true }); await impact.getByText('0.8 kg', { exact: true }).waitFor();
      await confirm.getByRole('button', { name: 'View source production', exact: true }).first().click();
      const sourceDialog = page.getByRole('dialog', { name: /^PRD-/ }); await sourceDialog.waitFor(); await sourceDialog.getByText(raw.name, { exact: true }).first().waitFor();
      assert.equal(await StockTransaction.countDocuments(), beforeParent); await sourceDialog.getByRole('button', { name: /^Close PRD-/ }).click();
      await shot('stock-review-and-source'); await axe();
      await confirm.getByRole('button', { name: 'Confirm production', exact: true }).click();
      const details = page.getByRole('dialog', { name: /^PRD-/ }); await details.waitFor();
      const saved = await Production.findOne({ recipe: parent._id }).lean();
      assert.ok(Math.abs(saved.totalCost - 1000 / 900 * 10) < 0.000001); assert.equal(saved.ingredients[0].allocations.length, 2);
      assert.equal((await InventoryItem.findById(raw._id)).currentStock, rawBefore - 2);
      assert.ok(Math.abs((await InventoryItem.findById(prepared._id)).currentStock - 0.8) < 0.000001); assert.equal((await InventoryItem.findById(outputItem._id)).currentStock, 450);
      await details.getByRole('button', { name: 'View source production', exact: true }).first().click();
      const sourceDialogs = page.getByRole('dialog', { name: /^PRD-/ }); await sourceDialogs.last().getByText(/cannot be safely reversed/).waitFor();
      await sourceDialogs.last().getByRole('button', { name: /^Close PRD-/ }).click();
      await details.getByRole('button', { name: 'Reverse production', exact: true }).click(); await details.getByLabel('Reversal reason', { exact: true }).fill('Owned downstream correction'); await details.getByRole('button', { name: 'Confirm reversal', exact: true }).click(); await details.getByText(/Reversed .*Owned downstream correction/).waitFor();
      assert.ok(Math.abs((await InventoryItem.findById(prepared._id)).currentStock - 1.8) < 0.000001); assert.equal((await InventoryItem.findById(raw._id)).currentStock, rawBefore - 2);
      assert.deepEqual(errors, []); await shot('safe-downstream-reversal'); await axe(); await context.close(); console.log('PASS ' + width + 'px: shortage/search, recipe and production draft retention, separate upstream keys, stale/offline/uncertain recovery, source history, costs, physical stock review and reversal');
    }
    console.log('Preparation workflow browser artifacts: ' + output);
  } catch (error) {
    for (const context of browser?.contexts() || []) for (const page of context.pages()) { await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }); console.error(page.url(), (await page.locator("body").innerText()).slice(0, 4500)); }
    console.error(`Artifacts: ${output}`); throw error;
  } finally {
    await browser?.close(); if (next) { next.kill(); await new Promise(resolve => next.exitCode != null ? resolve() : next.once("exit", resolve)); } if (backend) await new Promise(resolve => backend.close(resolve));
  }
});
