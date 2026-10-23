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
import { previewProduction, confirmProduction } from "../../backend/services/preparationService.js";
import { randomUUID } from "node:crypto";
import inventoryRoutes from "../../backend/routes/inventoryRoutes.js";
import { productionLabelHtml } from "../src/utils/productionLabel.js";

// Real production controllers/models, but only an owned temporary replica set,
// loopback Express/Next and fixture users/items. No dotenv or external API.
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "owned-preparation-browser-fixture";
process.env.ALLOW_NON_TRANSACTIONAL_INVENTORY = "false";
const root = path.resolve(import.meta.dirname, ".."), output = await mkdtemp(path.join(tmpdir(), "dg-preparation-browser-"));
let browser, next, backend, logs = "", failHistory = false, failYield = false;
await withIsolatedMongo(async () => {
  try {
    const actor = await User.create({ name: "Owned preparation admin", email: "preparation-browser@fixture.invalid", password: "OwnedPassword123!", role: "admin" });
    const category = await InventoryCategory.create({ name: "Owned browser stock", skuPrefix: "PBR" });
    const raw = await InventoryItem.create({ name: "Owned raw ingredient", sku: "PBR-RAW", category: category._id, unit: "kg", currentStock: 100, unitCost: 10 });
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
      const metric = (scope, label) => scope.locator("dl > div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd");
      const axe = async () => { await page.addScriptTag({ path: path.join(root, "node_modules/axe-core/axe.min.js") }); const problems = await page.evaluate(async () => (await window.axe.run(document.querySelector("main"), { runOnly: { type: "tag", values: ["wcag2a","wcag2aa"] } })).violations.map(row => `${row.id}: ${row.nodes.map(node => node.target.join(" ")).join(", ")}`)); assert.deepEqual(problems, []); };
      await page.goto(origin + "/inventory/preparation-recipes"); await page.getByRole("button", { name: "New recipe", exact: true }).click();
      await page.getByLabel("Recipe name", { exact: true }).fill(`Owned sauce ${width}`);
      await select(/Finished stock item/, `Owned prepared sauce ${width} · kg`);
      await page.getByLabel("Expected batch yield", { exact: true }).fill("450"); await select("Yield unit", "g");
      await select("Stock item 1", "Owned raw ingredient · Raw"); await page.getByLabel("Quantity 1", { exact: true }).fill("500"); await select("Unit 1", "g");
      const before = await StockTransaction.countDocuments();
      await page.getByRole("button", { name: "Save recipe", exact: true }).click(); await page.getByText("Recipe saved. Stock balances are unchanged.", { exact: true }).waitFor(); assert.equal(await StockTransaction.countDocuments(), before);
      const recipeCard = page.getByRole("button").filter({ has: page.getByText(`Owned sauce ${width}`, { exact: true }) });
      await recipeCard.getByText("Expected: 450 g · 1 ingredient", { exact: true }).waitFor();
      await page.getByLabel("Preparation notes (optional)", { exact: true }).fill("Mix until smooth. Keep the preparation area clean.");
      await page.getByRole("button", { name: "Save recipe", exact: true }).click(); await recipeCard.getByText("Active · v2", { exact: true }).waitFor();
      await page.getByRole("button", { name: "View version history", exact: true }).click();
      const versions = page.getByRole("dialog", { name: `Recipe history · Owned sauce ${width}`, exact: true });
      await versions.getByRole("heading", { name: "v2 · from v1", exact: true }).waitFor();
      await versions.getByText("Mix until smooth. Keep the preparation area clean.", { exact: true }).waitFor();
      assert.equal(await StockTransaction.countDocuments(), before); await shot("recipe-history"); await axe();
      await versions.getByRole("button", { name: /^Close Recipe history/ }).click();
      await page.getByLabel("Preparation notes (optional)", { exact: true }).fill("Owned unsaved notes");
      page.once("dialog", dialog => dialog.dismiss()); await page.getByRole("button", { name: "New recipe", exact: true }).click(); assert.equal(await page.getByLabel("Preparation notes (optional)", { exact: true }).inputValue(), "Owned unsaved notes");
      await page.getByLabel("Search preparation recipes", { exact: true }).fill("not-a-real-recipe"); await page.getByText("No preparation recipes", { exact: true }).waitFor(); assert.equal(await page.getByLabel("Preparation notes (optional)", { exact: true }).inputValue(), "Owned unsaved notes"); await page.getByLabel("Search preparation recipes", { exact: true }).fill("");
      await shot("recipe"); await axe(); page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.goto(origin + "/inventory/production");
      if (width === 320) {
        await page.evaluate(() => { window.__ownedSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith("dg-submission:production")) throw Error("Owned storage unavailable"); return window.__ownedSetItem.call(this, key, value); }; });
        await page.getByRole("button", { name: "Record production", exact: true }).click(); await page.getByText(/Safe request storage is unavailable/).waitFor(); assert.equal(await page.getByRole("button", { name: "Review & confirm production", exact: true }).isDisabled(), true);
        await page.evaluate(() => { Storage.prototype.setItem = window.__ownedSetItem; }); await page.getByRole("button", { name: "Cancel", exact: true }).click();
      }
      await page.getByRole("button", { name: "Record production", exact: true }).click(); await select("Preparation recipe", `Owned sauce ${width} · v2`);
      await page.getByText("Mix until smooth. Keep the preparation area clean.", { exact: true }).waitFor();
      await select("Plan production by", "Target output quantity"); await select("Target unit", "kg");
      await page.getByLabel("Planned target output", { exact: true }).fill("0.9"); await page.getByRole("button", { name: "Apply target", exact: true }).click();
      assert.equal(await page.getByLabel(/Batch multiplier/).inputValue(), "2"); assert.equal(await page.getByLabel("Actual quantity 1", { exact: true }).inputValue(), "1000");
      await page.getByLabel("Actual quantity 1", { exact: true }).fill("1100");
      await page.getByLabel("Planned target output", { exact: true }).fill("1.35");
      page.once("dialog", dialog => dialog.dismiss()); await page.getByRole("button", { name: "Apply target", exact: true }).click();
      assert.equal(await page.getByLabel("Actual quantity 1", { exact: true }).inputValue(), "1100");
      page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Apply target", exact: true }).click();
      assert.equal(await page.getByLabel("Actual quantity 1", { exact: true }).inputValue(), "1500");
      await page.getByLabel("Planned target output", { exact: true }).fill("0.9"); await page.getByRole("button", { name: "Apply target", exact: true }).click();
      await page.getByLabel("Actual usable finished quantity", { exact: true }).fill("700"); await page.getByLabel("Yield explanation (required)", { exact: true }).waitFor();
      await shot("variance-warning");
      await page.getByLabel("Actual usable finished quantity", { exact: true }).fill("850");
      await page.getByLabel("Yield explanation (optional)", { exact: true }).fill("Extra trimming of damaged raw ingredient");
      await page.getByRole("button", { name: "Use by", exact: true }).click(); const calendar = page.getByRole("dialog", { name: "Choose date", exact: true }); await calendar.getByPlaceholder("DD-MM-YYYY", { exact: true }).fill("02-01-2030"); await calendar.getByRole("button", { name: "Go", exact: true }).click(); await page.keyboard.press("Escape");
      await context.setOffline(true); await page.getByText("Offline. Production cannot be previewed or confirmed.", { exact: true }).waitFor(); assert.equal(await page.getByRole("button", { name: "Review & confirm production", exact: true }).isDisabled(), true); await context.setOffline(false);
      await page.getByRole("button", { name: "Review & confirm production", exact: true }).click(); const confirm = page.getByRole("dialog", { name: "Confirm production", exact: true }); await confirm.waitFor(); assert.equal(await StockTransaction.countDocuments(), before);
      await page.keyboard.press("Escape"); await shot("record-production"); await axe();
      await page.getByRole("button", { name: "Review & confirm production", exact: true }).click(); await confirm.waitFor();
      if (width === 1440) {
        const beforeStale = await Production.countDocuments();
        await InventoryItem.updateOne({ _id: raw._id }, { $inc: { stockVersion: 1 } }); await confirm.getByRole("button", { name: "Confirm production", exact: true }).click(); await confirm.getByRole("alert").filter({ hasText: /changed since preview/ }).waitFor(); assert.equal(await Production.countDocuments(), beforeStale);
        const retainedKey = await page.evaluate(() => Object.entries(sessionStorage).find(([key]) => key.startsWith("dg-submission:production") && key.endsWith(":key"))?.[1]);
        await confirm.getByRole("button", { name: "Go back", exact: true }).click(); await page.getByRole("button", { name: "Review again with same key", exact: true }).click();
        await page.getByRole("button", { name: "Review & confirm production", exact: true }).click(); await confirm.waitFor(); assert.equal(await page.evaluate(() => Object.entries(sessionStorage).find(([key]) => key.startsWith("dg-submission:production") && key.endsWith(":key"))?.[1]), retainedKey);
      }
      if (width === 390) await context.route("**/api/inventory/production/confirm", async route => { await route.fetch(); await route.abort("failed"); }, { times: 1 });
      const count = await Production.countDocuments(); await confirm.getByRole("button", { name: "Confirm production", exact: true }).click();
      if (width === 390) { await confirm.getByRole("alert").waitFor(); await confirm.getByRole("button", { name: "Go back", exact: true }).click(); await page.getByRole("button", { name: "Check saved result", exact: true }).click(); }
      await page.getByRole("dialog", { name: /^PRD-/ }).waitFor(); assert.equal(await Production.countDocuments(), count + 1);
      const details = page.getByRole("dialog", { name: /^PRD-/ });
      await details.getByRole("button", { name: "Print label", exact: true }).click();
      const label = page.getByRole("dialog", { name: "Batch label preview", exact: true });
      await label.getByRole("button", { name: "Print batch label", exact: true }).waitFor();
      const labelFrame = page.frameLocator('iframe[title="Production batch label"]');
      await labelFrame.getByText(`Owned prepared sauce ${width}`, { exact: false }).waitFor();
      await shot("batch-label");
      const printable = page.frames().find(frame => frame.url() === "about:srcdoc");
      await printable.evaluate(() => { window.print = () => { window.__ownedPrinted = true; }; });
      const labelCount = await StockTransaction.countDocuments();
      await label.getByRole("button", { name: "Print batch label", exact: true }).click();
      assert.equal(await printable.evaluate(() => window.__ownedPrinted), true); assert.equal(await StockTransaction.countDocuments(), labelCount);
      const printPage = await context.newPage(); await printPage.setContent(await printable.content()); await printPage.emulateMedia({ media: "print" });
      await printPage.pdf({ path: path.join(output, `batch-label-${width}.pdf`), preferCSSPageSize: true }); await printPage.screenshot({ path: path.join(output, `batch-label-print-${width}.png`) }); await printPage.close();
      await label.getByRole("button", { name: "Close Batch label preview", exact: true }).click();
      assert.equal(await metric(details, "Total preparation loss").innerText(), "0.15 kg");
      assert.equal(await metric(details, "Output below expected").innerText(), "0.05 kg");
      await details.getByText("Yield explanation: Extra trimming of damaged raw ingredient", { exact: true }).waitFor();
      await shot("batch-details"); await axe();
      await page.getByRole("button", { name: /^Close PRD-/ }).click();
      await page.getByRole("button", { name: "Yield / Loss Report", exact: true }).click();
      await select("Report preparation", `Owned sauce ${width}`);
      const report = page.getByRole("region", { name: "Preparation Yield / Loss Report", exact: true });
      await report.getByText("1 completed batches", { exact: true }).waitFor();
      const group = report.locator("article").filter({ has: page.getByRole("heading", { name: `Owned sauce ${width} · kg`, exact: true }) });
      assert.equal(await metric(group, "Total preparation loss").innerText(), "0.15 kg");
      assert.equal(await metric(group, "Output below expected").innerText(), "0.05 kg");
      const beforeReport = await StockTransaction.countDocuments();
      await shot("yield-report"); await axe();
      failYield = true; await report.getByRole("button", { name: "Refresh report", exact: true }).click();
      await report.getByRole("alert").filter({ hasText: /Unable to load yield report/ }).waitFor();
      await report.getByText(/Showing the last loaded results/).waitFor();
      assert.equal(await metric(group, "Total preparation loss").innerText(), "0.15 kg");
      failYield = false; await report.getByRole("button", { name: "Retry yield report", exact: true }).click();
      await report.getByRole("alert").waitFor({ state: "hidden" });
      await select("Report period", "Custom dates"); await report.getByText(/Select both dates to load/).waitFor();
      const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10).split("-").reverse().join("-");
      for (const label of ["Report from date", "Report to date"]) {
        await report.getByRole("button", { name: label, exact: true }).click(); const picker = page.getByRole("dialog", { name: "Choose date", exact: true });
        await picker.getByPlaceholder("DD-MM-YYYY", { exact: true }).fill(today); await picker.getByRole("button", { name: "Go", exact: true }).click(); await page.keyboard.press("Escape");
      }
      await report.getByText("1 completed batches", { exact: true }).waitFor(); assert.equal(await StockTransaction.countDocuments(), beforeReport);
      await report.getByRole("button", { name: "View batch details", exact: true }).click(); await details.waitFor();
      await page.getByRole("button", { name: "Reverse production", exact: true }).click(); await page.getByLabel("Reversal reason", { exact: true }).fill("Owned browser correction"); await page.getByRole("button", { name: "Confirm reversal", exact: true }).click(); await page.getByText(/Reversed .*Owned browser correction/).waitFor();
      assert.equal(await details.getByRole("button", { name: "Print label", exact: true }).count(), 0);
      await page.getByRole("button", { name: /^Close PRD-/ }).click();
      await report.getByText("0 completed batches", { exact: true }).waitFor(); await report.getByText("1 reversed batches excluded", { exact: true }).waitFor();
      assert.equal(await metric(group, "Total preparation loss").innerText(), "Unavailable");
      await shot("reversed-yield-report"); await axe();
      await page.getByRole("button", { name: "Production history", exact: true }).click(); await page.getByLabel("Search batch or preparation", { exact: true }).fill(`Owned sauce ${width}`); await page.getByText("Reversed", { exact: true }).waitFor(); await shot("history"); await axe();
      failHistory = true; await page.getByRole("button", { name: "Refresh", exact: true }).click(); await page.getByRole("alert").filter({ hasText: /Unable to load/ }).waitFor(); await page.getByText("Reversed", { exact: true }).waitFor(); failHistory = false; await page.getByRole("button", { name: "Retry inventory data", exact: true }).click(); await page.getByRole("alert").filter({ hasText: /Unable to load/ }).waitFor({ state: "hidden" });
      if (width === 320) {
        await page.goto(origin + "/inventory/settings");
        await page.getByLabel(/Production output variance threshold/).fill("5"); await page.getByRole("button", { name: "Save settings", exact: true }).click();
        await page.getByText("Inventory settings saved.", { exact: true }).waitFor();
        await page.reload(); assert.equal(await page.getByLabel(/Production output variance threshold/).inputValue(), "5"); await shot("variance-settings");
      }
      // Replenish the upstream recipe through the same production service. The
      // browser then creates and confirms its downstream recipe using that stock.
      const sourceRecipe = await PreparationRecipe.findOne({ finishedItem: finished[width]._id }).lean();
      const upstreamBody = { recipe: String(sourceRecipe._id), expectedVersion: sourceRecipe.version, multiplier: 1, actualQuantity: 450, outputUnit: "g", preparedAt: new Date(Date.now() - 60000).toISOString(), expiryDate: "2030-01-02T12:00:00+03:00", ingredients: [{ inventoryItem: String(raw._id), quantity: 500, unit: "g" }] };
      const upstream = await confirmProduction(actor, { ...upstreamBody, previewFingerprint: (await previewProduction(actor, upstreamBody)).fingerprint, idempotencyKey: randomUUID() });
      const outputItem = await InventoryItem.create({ name: `Owned caramelized sauce ${width}`, sku: `PBR-CARAMEL-${width}`, category: category._id, unit: "g", currentStock: 0 });
      await page.goto(origin + "/inventory/preparation-recipes");
      await page.getByLabel("Search preparation recipes", { exact: true }).fill("no-matching-stage");
      await page.getByText("No preparation recipes", { exact: true }).waitFor();
      await page.getByRole("button", { name: "New recipe", exact: true }).click();
      await page.getByLabel("Recipe name", { exact: true }).fill(`Owned second stage ${width}`);
      await select("Finished stock item", `${outputItem.name} · g`);
      await page.getByLabel("Expected batch yield", { exact: true }).fill("270");
      await page.getByRole("combobox", { name: "Stock item 1", exact: true }).click();
      assert.equal(await page.getByRole("option", { name: `${outputItem.name} · Raw`, exact: true }).count(), 0, "Own finished item excluded");
      await page.getByRole("option", { name: `Owned prepared sauce ${width} · Prepared`, exact: true }).click();
      await page.getByLabel("Quantity 1", { exact: true }).fill("300"); await select("Unit 1", "g");
      await page.getByRole("button", { name: "Add ingredient", exact: true }).click();
      await page.getByRole("combobox", { name: "Stock item 2", exact: true }).click();
      assert.equal(await page.getByRole("option", { name: `Owned prepared sauce ${width} · Prepared`, exact: true }).count(), 0, "Duplicate prepared ingredient excluded");
      await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Remove ingredient 2", exact: true }).click();
      await page.getByText(/Produce prepared ingredients in Production first/).waitFor();
      const beforeMultiStage = await StockTransaction.countDocuments(), rawBefore = (await InventoryItem.findById(raw._id)).currentStock;
      await page.getByRole("button", { name: "Save recipe", exact: true }).click();
      await page.getByText("Recipe saved. Stock balances are unchanged.", { exact: true }).waitFor();
      await page.getByLabel("Search preparation recipes", { exact: true }).fill("");
      assert.equal(await StockTransaction.countDocuments(), beforeMultiStage); await shot("multi-stage-recipe"); await axe();
      await page.goto(origin + "/inventory/production"); await page.getByRole("button", { name: "Record production", exact: true }).click();
      await select("Preparation recipe", `Owned second stage ${width} · v1`);
      await page.getByRole("button", { name: "Review & confirm production", exact: true }).click();
      await confirm.waitFor(); assert.equal(await StockTransaction.countDocuments(), beforeMultiStage);
      await page.getByRole("heading", { name: "Raw or prepared ingredients", exact: true }).waitFor();
      await shot("multi-stage-preview"); await axe();
      await confirm.getByRole("button", { name: "Confirm production", exact: true }).click(); await details.waitFor();
      const saved = await Production.findOne({ finishedItem: outputItem._id }).lean();
      assert.equal((await InventoryItem.findById(raw._id)).currentStock, rawBefore, "No repeated upstream deduction");
      assert.ok(Math.abs((await InventoryItem.findById(finished[width]._id)).currentStock - 0.15) < 0.000001);
      assert.equal((await InventoryItem.findById(outputItem._id)).currentStock, 270);
      assert.equal(String(saved.ingredients[0].allocations[0].batch), String(upstream.finishedBatch));
      await details.getByText(upstream.productionNumber, { exact: false }).waitFor();
      await shot("multi-stage-completed"); await axe();
      assert.deepEqual(errors, []); await context.close(); console.log(`PASS ${width}px: multi-stage prepared selection beyond 100 options, recipe save/preview without writes, direct-stock confirmation, original recipe/production/yield/reversal, stale/offline/recovery and axe`);
    }
    assert.equal((await InventoryItem.findById(raw._id)).currentStock, 98.5);
    const longLabel = await browser.newPage({ viewport: { width: 303, height: 303 } });
    await longLabel.setContent(productionLabelHtml({ status: "completed", productionNumber: "PRD-2026-000001", recipeSnapshot: { name: "W".repeat(120) }, finishedName: "W".repeat(120), preparedAt: "2026-10-23T07:00:00Z", expiryDate: "2026-10-24T12:00:00+03:00" }));
    await longLabel.emulateMedia({ media: "print" });
    assert.ok(await longLabel.locator("article").evaluate(element => element.getBoundingClientRect().height <= 72 / 25.4 * 96), "Maximum-length names fit one 80mm label");
    await longLabel.screenshot({ path: path.join(output, "batch-label-long-names.png") });
    await longLabel.pdf({ path: path.join(output, "batch-label-long-names.pdf"), preferCSSPageSize: true }); await longLabel.close();
    console.log(`Preparation browser artifacts: ${output}`);
  } catch (error) {
    for (const context of browser?.contexts() || []) for (const page of context.pages()) { await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }); console.error(page.url(), (await page.locator("body").innerText()).slice(0, 4500)); }
    console.error(`Artifacts: ${output}`); throw error;
  } finally {
    await browser?.close(); if (next) { next.kill(); await new Promise(resolve => next.exitCode != null ? resolve() : next.once("exit", resolve)); } if (backend) await new Promise(resolve => backend.close(resolve));
  }
});
