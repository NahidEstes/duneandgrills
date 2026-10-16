import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RECIPE_PILOT } from "../../backend/data/recipeInstructionPilot.js";

// Dummy fixtures only. ALL /api calls intercepted; no database/server mutations.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const origin = process.env.RECIPE_SMOKE_URL || "http://localhost:3008";
const output = await mkdtemp(path.join(tmpdir(), "dg-recipe-visual-"));
let checks = 0;
try {
  for (const viewport of [{ width: 1536, height: 1024 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }); const page = await context.newPage(); const errors = [];
    await context.addCookies([{ name: "dg_session", value: "isolated-recipe-fixture", url: origin }]);
    page.on("pageerror", error => errors.push(error.message));
    const recipes = structuredClone(RECIPE_PILOT);
    let role = "admin", failure = false, saveConflict = false;
    const mutationPaths = [];
    await context.route("**/api/**", async route => {
      const request = route.request(), resource = new URL(request.url()).pathname.replace(/^\/api/, "");
      let payload = { success: true, data: [] }, status = 200;
      if (resource === "/auth/me") payload = { user: { _id: "444444444444444444444444", name: "Preview Admin", role } };
      else if (resource === "/cart") payload.data = { items: [], coupon: null };
      else if (resource === "/kitchen/recipes") { if (failure) { status = 503; payload.message = "Isolated simulated API failure"; } else payload.data = role === "kitchen" ? [] : recipes; }
      else if (resource === "/kitchen/recipes/manual") payload.data = { available: false, version: "1.3", message: "Private manual storage is not configured." };
      else if (resource === "/kitchen/recipes/inventory-options") payload.data = [{ _id: "555555555555555555555555", name: "Explicit Test Burger", isActive: true, doNotTrack: false }];
      else if (/\/kitchen\/recipes\/[^/]+\/(history|trials)$/.test(resource)) payload.data = { rows: [], nextBefore: null };
      else if (resource.endsWith("/readiness")) { const row = recipes.find(r => resource.includes(`/${r.code}/`)); payload.data = { revision: row.revision, workflowVersion: row.workflowVersion || 0, publishedRevision: null, qualifyingTrialIds: [], submit: { allowed: false, reasons: [] }, approve: { allowed: false, reasons: ["Qualifying trial required."] }, publish: { allowed: false, reasons: ["Approval required."] } }; }
      else if (resource.startsWith("/kitchen/recipes/") && request.method() === "PUT") {
        mutationPaths.push(resource);
        if (saveConflict) { status = 409; payload.message = "This draft changed. Reload before saving."; }
        else {
          const body = request.postDataJSON(), code = resource.split("/").at(-1), index = recipes.findIndex(row => row.code === code);
          assert.deepEqual(Object.keys(body).sort(), ["content", "inventoryRecipe", "reason", "requestKey", "reviewNotes", "revision", "status", "workflowVersion"]);
          recipes[index] = { ...recipes[index], ...body.content, status: body.status, reviewNotes: body.reviewNotes, inventoryRecipe: body.inventoryRecipe, revision: body.revision + 1, persisted: true }; payload.data = recipes[index];
        }
      } else if (!request.method().match(/GET|HEAD/)) mutationPaths.push(resource);
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
    });
    await page.goto(`${origin}/kitchen/recipes?view=manage&recipe=B01`);
    const heading = name => page.getByRole("heading", { level: 2, name, exact: true });
    await heading("Double Beef Cheeseburger").waitFor();
    assert.equal(await page.getByText(/TRIAL REQUIRED — NOT PUBLISHED/).count(), 1);
    await page.getByText("Read recipe instructions", { exact: true }).click();
    await page.getByText("Source & Version Details", { exact: true }).click();
    await page.getByText("Private manual view and download are unavailable.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "View manual", exact: true }).count(), 0);
    await page.getByText("Serving photo unavailable", { exact: false }).waitFor();
    await page.getByRole("cell", { name: "0.3 g", exact: true }).waitFor();
    await page.getByRole("button", { name: "10 servings", exact: true }).click();
    await page.getByRole("cell", { name: "1,600 g", exact: true }).waitFor();
    await page.getByRole("button", { name: "Cooking", exact: true }).first().click();
    await page.locator("p").filter({ hasText: /EVERY patty reaches at least 72°C/ }).waitFor();
    assert.equal(await page.getByText(/TRIAL REQUIRED — NOT PUBLISHED/).isVisible(), true);
    await page.screenshot({ path: path.join(output, `recipe-${viewport.width}.png`), fullPage: true });
    await page.getByRole("button", { name: "S1 / HB01 · House Burger Sauce →", exact: true }).click();
    await heading("Classic House Burger Sauce").waitFor();
    await page.getByText("Read recipe instructions", { exact: true }).click();
    await page.getByRole("button", { name: "1 kg batch", exact: true }).click();
    await page.getByRole("cell", { name: "600 g", exact: true }).waitFor();
    await page.getByText("Storage, allergens & essential notes", { exact: true }).click();
    await page.locator("p").filter({ hasText: /Use within 48 hours of mixing/ }).waitFor();
    await page.goBack(); await page.getByText("Read recipe instructions", { exact: true }).click();
    await heading("Double Beef Cheeseburger").waitFor();
    await page.getByRole("button", { name: "T1 · Caramelized Onion →", exact: true }).click();
    await heading("Caramelized Onion").waitFor();
    await page.getByText("Read recipe instructions", { exact: true }).click();
    await page.getByText("Storage, allergens & essential notes", { exact: true }).click();
    await page.locator("p").filter({ hasText: /250–300 g, NOT guaranteed or measured/ }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Original preparation batch", exact: true }).count(), 1);
    await page.goBack(); await heading("Double Beef Cheeseburger").waitFor();
    await page.goForward(); await heading("Caramelized Onion").waitFor();
    await page.reload(); await heading("Caramelized Onion").waitFor();
    await page.goto(`${origin}/kitchen/recipes?view=manage&recipe=B01`);
    if (viewport.width < 768) await page.getByRole("button", { name: "All Recipes", exact: true }).click();
    await page.getByRole("textbox", { name: "Search recipes", exact: true }).fill("s1");
    assert.equal(await page.locator(".recipe-list-item").count(), 1);
    await page.getByRole("textbox", { name: "Search recipes", exact: true }).fill("");
    await page.getByRole("button", { name: "Guides", exact: true }).click();
    await page.getByText(/No matching recipes or guides/).waitFor();
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.locator(".recipe-list-item").filter({ hasText: "Double Beef Cheeseburger" }).click();
    await page.getByText("Edit recipe content · create a new revision", { exact: true }).click();
    await page.getByText("Edit instructions / create new revision", { exact: true }).click();
    const preparation = page.locator("label").filter({ hasText: /^preparation · one instruction per line/i }).locator("textarea");
    const originalPreparation = await preparation.inputValue(); await preparation.focus(); await preparation.press("Control+End"); await preparation.press("Enter");
    await preparation.pressSequentially("Dummy additional trial instruction");
    assert.equal(await preparation.inputValue(), `${originalPreparation}\nDummy additional trial instruction`);
    await page.getByRole("combobox", { name: "Inventory recipe link", exact: true }).click();
    await page.getByRole("option", { name: "Explicit Test Burger · Active", exact: true }).click();
    await page.getByRole("textbox", { name: "Owner / chef review notes", exact: true }).fill("Dummy owner review only");
    await page.getByRole("textbox", { name: "Change reason", exact: true }).fill("Isolated first review");
    await page.getByRole("button", { name: "Save instruction draft to database", exact: true }).click();
    await page.getByText("Exact revision 1", { exact: true }).waitFor();
    await page.getByText("Edit recipe content · create a new revision", { exact: true }).click();
    saveConflict = true;
    await page.getByRole("textbox", { name: "Change reason", exact: true }).fill("Isolated second review");
    await page.getByRole("button", { name: "Save draft review", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "This draft changed. Reload before saving." }).waitFor();
    assert.deepEqual(mutationPaths, ["/kitchen/recipes/B01", "/kitchen/recipes/B01"]);
    if (viewport.width < 768) await page.getByRole("button", { name: "All Recipes", exact: true }).click();
    await page.getByRole("button", { name: "Preparations", exact: true }).focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.getByRole("button", { name: "Preparations", exact: true }).getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => document.activeElement?.tagName !== "BODY"));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.goto(`${origin}/kitchen/recipes?view=manage&recipe=B01`); await heading("Double Beef Cheeseburger").waitFor();
    await page.emulateMedia({ media: "print" });
    for (const title of ["Ingredients", "Preparation", "Cooking", "Assembly", "Serving", "Delivery", "Storage controls", "Allergens"]) assert.equal(await page.getByRole("heading", { name: title, exact: true }).isVisible(), true);
    assert.equal(await page.getByText("Edit recipe content · create a new revision", { exact: true }).isVisible(), false);
    if (viewport.width === 1536) {
      await page.pdf({ path: path.join(output, "B01-print.pdf"), format: "A4", printBackground: true });
      await page.screenshot({ path: path.join(output, "recipe-print.png"), fullPage: true });
    }
    await page.emulateMedia({ media: "screen" });
    failure = true; await page.reload();
    await page.getByRole("alert").filter({ hasText: "Isolated simulated API failure" }).waitFor();
    failure = false; await page.getByRole("button", { name: "Retry / reload recipes", exact: true }).click();
    await heading("Double Beef Cheeseburger").waitFor();
    role = "kitchen"; await page.reload();
    await page.getByRole("heading", { name: "No published recipe instructions available", exact: true }).waitFor();
    assert.equal(await heading("Double Beef Cheeseburger").count(), 0);
    assert.equal(await page.getByRole("button", { name: "View manual", exact: true }).count(), 0);
    role = "customer"; await page.reload(); await page.waitForURL(`${origin}/`);
    assert.equal(await heading("Double Beef Cheeseburger").count(), 0);
    assert.deepEqual(errors, []);
    checks++; console.log(`PASS recipe content / presets / navigation / drafts / auth / errors / keyboard / print / layout (${viewport.width}px)`);
    await context.close();
  }
  console.log(`Visual outputs: ${output}; ${checks} viewports passed. All APIs mocked.`);
} finally { await browser.close(); }
