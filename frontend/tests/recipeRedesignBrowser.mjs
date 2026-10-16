import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RECIPE_LIBRARY } from "../../backend/data/recipeInstructionPilot.js";

// Own a loopback Next process. Every browser API is intercepted: no .env backend,
// database, real trial, approval, import, stock or production setting is touched.
const output = await mkdtemp(path.join(tmpdir(), "dg-recipe-redesign-"));
const socket = createServer(); await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const sessionFixture = createHttpServer((req, res) => { res.setHeader("Content-Type", "application/json"); if (req.url === "/api/auth/session" && req.headers.cookie?.includes("dg_session=")) res.end(JSON.stringify({ user: { _id: "444444444444444444444444", name: "Isolated staff session", role: "manager" } })); else { res.statusCode = 404; res.end("{}"); } });
await new Promise(resolve => sessionFixture.listen(0, "127.0.0.1", resolve));
const fixtureUrl = `http://127.0.0.1:${sessionFixture.address().port}/api`;
const frontend = path.resolve(import.meta.dirname, "..");
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], { cwd: frontend, windowsHide: true, env: { ...process.env, NODE_ENV: "production", SITE_URL: origin, BACKEND_API_URL: fixtureUrl }, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; child.stdout.on("data", value => { log += value; }); child.stderr.on("data", value => { log += value; });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
let browser;
try {
  for (let attempt = 0; ; attempt++) { try { await fetch(`${origin}/kitchen/recipes`, { redirect: "manual" }); break; } catch { if (attempt > 100 || child.exitCode != null) throw new Error(`Next startup failed: ${log}`); await new Promise(resolve => setTimeout(resolve, 200)); } }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const viewport of [{ width: 1660, height: 1050 }, { width: 820, height: 1180 }, { width: 390, height: 844 }, { width: 320, height: 760 }]) {
    const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [], writes = [];
    await context.addCookies([{ name: "dg_session", value: "isolated-recipe-fixture", url: origin }]);
    const mobile = viewport.width < 768;
    let role = "manager", failure = false, empty = false, readinessFailure = false;
    const rows = structuredClone(RECIPE_LIBRARY).map(row => ({ ...row, revision: 3, workflowVersion: 6, persisted: true, status: "published", currentPublished: true, currentWorking: true, publishedRevision: 3, dependencyPins: row.code === "B01" ? [{ code: "HB01", revision: 2, updateAvailable: true }, { code: "T1", revision: 3, updateAvailable: false }] : [] }));
    const working = { ...structuredClone(rows[0]), revision: 4, status: "trial_required", currentPublished: false, currentWorking: true };
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/api/**", async route => {
      const req = route.request(), url = new URL(req.url()), resource = url.pathname.replace(/^\/api/, ""), code = resource.split("/")[3];
      let status = 200, data = [], payload;
      if (!/GET|HEAD/.test(req.method())) writes.push(resource);
      if (["/auth/me", "/auth/session"].includes(resource)) payload = { user: { _id: "444444444444444444444444", name: "Isolated Recipe Reviewer", role } };
      else if (resource === "/cart") data = { items: [], coupon: null };
      else if (resource === "/kitchen/recipes") {
        if (failure) { status = 503; payload = { message: "Isolated recipe read failure" }; }
        else data = empty ? [] : url.searchParams.get("view") === "published" ? rows : [working, ...rows.slice(1)];
      } else if (resource.endsWith("/manual")) data = { available: false };
      else if (resource.endsWith("/inventory-options")) data = [];
      else if (resource.endsWith("/history") || resource.endsWith("/trials")) data = { rows: [], nextBefore: null };
      else if (resource.endsWith("/readiness")) {
        if (readinessFailure) { status = 503; payload = { message: "Isolated readiness unavailable" }; }
        else data = { revision: Number(url.searchParams.get("revision")), workflowVersion: 6, publishedRevision: 3, qualifyingTrialIds: [], requiredChecks: [], submit: { allowed: false, reasons: ["Only the current draft can request trial."] }, approve: { allowed: false, reasons: ["A qualifying trial for this exact revision is required.", "HB01 must be approved and published first."] }, publish: { allowed: false, reasons: ["Recorded approval required."] } };
      } else if (resource.startsWith("/kitchen/recipes/")) {
        const row = rows.find(r => r.code === code);
        if (row) data = { ...row, revision: Number(url.searchParams.get("revision") || 3), currentPublished: Number(url.searchParams.get("revision") || 3) === 3, currentWorking: false };
        else { status = 404; payload = { message: "Exact revision unavailable" }; }
      }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload || { success: true, data }) });
    });
    const heading = name => page.getByRole("heading", { level: 2, name, exact: true });
    const allRecipes = async () => { await page.getByRole("button", { name: "All Recipes", exact: true }).click(); await page.getByRole("textbox", { name: "Search recipes", exact: true }).waitFor(); };
    await page.goto(`${origin}/kitchen/recipes`); await page.locator(".recipe-list-item").first().waitFor();
    assert.equal(await page.getByRole("link", { name: "Service Recipes", exact: true }).getAttribute("aria-current"), "page");
    assert.equal(await page.getByRole("heading", { name: /Next action/ }).count(), 0);
    if (mobile) assert.equal(await page.locator(".recipe-reader").isVisible(), false);
    await page.getByRole("textbox", { name: "Search recipes", exact: true }).fill("s1"); assert.equal(await page.locator(".recipe-list-item").count(), 1);
    await page.getByRole("textbox", { name: "Search recipes", exact: true }).fill("");
    await page.screenshot({ path: path.join(output, `library-${viewport.width}.png`), fullPage: false });
    await page.locator(".recipe-list-item").filter({ hasText: "Double Beef Cheeseburger" }).click(); await heading("Double Beef Cheeseburger").waitFor();
    if (mobile) assert.equal(await page.locator(".recipe-list").isVisible(), false);
    await page.getByRole("button", { name: "10 servings", exact: true }).click(); await page.getByRole("cell", { name: "1,600 g", exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `reader-${viewport.width}.png`), fullPage: false });
    await page.getByRole("button", { name: "Start Cooking", exact: true }).click();
    await page.getByRole("button", { name: "Next step", exact: true }).click(); await page.getByRole("checkbox", { name: "Read preparation instruction 1", exact: true }).check();
    await page.getByText("Step 2 of 6", { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `step-${viewport.width}.png`), fullPage: false });
    await page.getByRole("button", { name: "Next step", exact: true }).click(); await page.locator("p").filter({ hasText: /EVERY patty reaches at least 72°C/ }).waitFor();
    await page.getByRole("button", { name: "View All Steps", exact: true }).last().click();
    for (const title of ["Ingredients", "Preparation", "Cooking", "Assembly", "Serving", "Delivery"]) assert.equal(await page.getByRole("heading", { name: title, exact: true }).isVisible(), true);
    await page.getByRole("button", { name: "Start Cooking", exact: true }).click();
    // Neither checklists, selected step nor closed disclosures may truncate print.
    await page.emulateMedia({ media: "print" });
    for (const title of ["Ingredients", "Preparation", "Cooking", "Assembly", "Serving", "Delivery", "Storage controls", "Allergens"]) assert.equal(await page.getByRole("heading", { name: title, exact: true }).isVisible(), true, `print ${title}`);
    assert.equal(await page.getByRole("cell", { name: "1,600 g", exact: true }).isVisible(), true);
    assert.equal(await page.getByText(/SOURCE GUIDANCE ONLY/).isVisible(), true);
    if (viewport.width === 1660) { await page.pdf({ path: path.join(output, "complete-recipe.pdf"), format: "A4", printBackground: true }); await page.screenshot({ path: path.join(output, "print.png"), fullPage: true }); }
    await page.emulateMedia({ media: "screen" });
    await page.getByRole("button", { name: "S1 / HB01 · House Burger Sauce →", exact: true }).click(); await page.waitForURL(/recipe=HB01.*revision=2/); await heading("Classic House Burger Sauce").waitFor();
    await page.getByText(/Historical \/ superseded/).waitFor(); await page.reload(); await page.getByText("Exact revision 2", { exact: true }).waitFor();
    await page.goBack(); await heading("Double Beef Cheeseburger").waitFor(); await page.goForward(); await heading("Classic House Burger Sauce").waitFor();
    await allRecipes();
    await page.getByRole("button", { name: "Guides", exact: true }).focus(); await page.keyboard.press("Enter"); assert.equal(await page.locator(".recipe-list-item").count(), 5);
    await page.locator(".recipe-list-item").filter({ hasText: "Ingredient Specifications" }).click(); await heading("Ingredient Specifications").waitFor();
    assert.equal(await page.locator(".recipe-presets").count(), 0); assert.equal(await page.locator("table").count(), 0);
    await page.getByRole("button", { name: "Read Steps", exact: true }).click(); await page.getByText("Step 1 of 1", { exact: true }).waitFor(); assert.equal(await page.getByRole("button", { name: "Next step", exact: true }).isDisabled(), true);
    await page.goto(`${origin}/kitchen/recipes?view=manage&recipe=B01`); await page.getByRole("heading", { name: "Record or review a kitchen trial", exact: true }).waitFor();
    await page.getByText("HB01 must be approved and published first.", { exact: true }).waitFor();
    assert.equal(await page.locator("#recipe-edit").getAttribute("open"), null);
    assert.equal(await page.locator(".recipe-reading-panel").getAttribute("open"), null);
    await page.screenshot({ path: path.join(output, `manager-${viewport.width}.png`), fullPage: false });
    await page.getByRole("button", { name: "Open trial form", exact: true }).click(); await page.getByLabel("Actual batch size", { exact: true }).waitFor();
    await context.setOffline(true); await page.getByText(/Offline — reconnect/).waitFor(); assert.equal(await page.getByLabel("Actual batch size", { exact: true }).isDisabled(), true); await context.setOffline(false);
    await page.getByText("Authorized review / version actions", { exact: true }).click();
    await page.getByLabel("Action reason / reviewer comments", { exact: true }).fill("Fixture review"); assert.equal(await page.getByRole("button", { name: "Record authorized approval", exact: true }).isDisabled(), true);
    failure = true; await page.getByRole("button", { name: "Refresh", exact: true }).click(); await page.getByRole("alert").filter({ hasText: "Isolated recipe read failure" }).waitFor(); await page.getByText(/Retained information may be outdated/).waitFor();
    assert.equal(await page.getByLabel("Action reason / reviewer comments", { exact: true }).isDisabled(), true);
    failure = false; await page.getByRole("button", { name: "Retry / reload recipes", exact: true }).click(); await page.getByRole("button", { name: "Refresh", exact: true }).waitFor();
    readinessFailure = true; await page.reload(); await page.getByRole("alert").filter({ hasText: "Isolated readiness unavailable" }).waitFor(); readinessFailure = false;
    await page.getByRole("button", { name: "Reload workflow", exact: true }).click();
    await page.waitForFunction(() => !document.body.textContent.includes("Isolated readiness unavailable"));
    role = "kitchen"; await page.goto(`${origin}/kitchen/recipes?recipe=B01&view=manage`); await heading("Double Beef Cheeseburger").waitFor();
    assert.equal(await page.getByRole("link", { name: "Manage Recipes", exact: true }).count(), 0); assert.equal(await page.locator("#recipe-edit").count(), 0); assert.equal(await page.getByText("Exact revision 4", { exact: true }).count(), 0); await page.getByText("Exact revision 3", { exact: true }).waitFor();
    await page.addScriptTag({ path: path.join(frontend, "node_modules/axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector(".recipe-workspace"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })));
    assert.deepEqual(violations, [], `accessibility ${viewport.width}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow ${viewport.width}`);
    empty = true; await page.goto(`${origin}/kitchen/recipes?view=trial`); await page.getByRole("heading", { name: "No trial recipe instructions available", exact: true }).waitFor();
    assert.deepEqual(writes, []); assert.deepEqual(errors, []);
    await context.close(); console.log(`PASS redesigned recipe reading/steps, guides, pins/history, readiness/privacy, offline/error, print, axe and layout: ${viewport.width}px`);
  }
  await browser.close(); browser = null;
  if (!process.env.RECIPE_SKIP_WORKFLOW) {
    for (const script of ["recipeWorkflowBrowserSmoke.mjs", "recipeInstructionsBrowserSmoke.mjs", "recipeManualBrowserSmoke.mjs"]) {
      const regression = spawn(process.execPath, [`tests/${script}`], { cwd: frontend, windowsHide: true, env: { ...process.env, RECIPE_SMOKE_URL: origin }, stdio: "inherit" });
      const exitCode = await new Promise(resolve => regression.once("exit", resolve)); assert.equal(exitCode, 0, `Existing browser regression ${script}`);
    }
  }
  console.log(`Recipe redesign artifacts: ${output}`);
} catch (error) {
  for (const context of browser?.contexts() || []) for (const page of context.pages()) { await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }); console.error("Browser failure", page.url(), await page.locator("body").innerText()); }
  console.error(`Failure artifacts: ${output}`); throw error;
} finally {
  await browser?.close(); child.kill(); await new Promise(resolve => child.exitCode != null ? resolve() : child.once("exit", resolve)); await new Promise(resolve => sessionFixture.close(resolve));
}
