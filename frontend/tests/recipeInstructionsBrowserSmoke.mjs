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
      else if (resource.startsWith("/kitchen/recipes/") && request.method() === "PUT") {
        mutationPaths.push(resource);
        if (saveConflict) { status = 409; payload.message = "This draft changed. Reload before saving."; }
        else {
          const body = request.postDataJSON(), code = resource.split("/").at(-1), index = recipes.findIndex(row => row.code === code);
          assert.deepEqual(Object.keys(body).sort(), ["inventoryRecipe", "reviewNotes", "revision", "status"]);
          recipes[index] = { ...recipes[index], ...body, revision: body.revision + 1, persisted: true }; payload.data = recipes[index];
        }
      } else if (!request.method().match(/GET|HEAD/)) mutationPaths.push(resource);
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
    });
    await page.goto(`${origin}/kitchen/recipes`);
    const heading = name => page.getByRole("heading", { level: 2, name, exact: true });
    await heading("Double Beef Cheeseburger").waitFor();
    assert.equal(await page.getByText(/TRIAL REQUIRED — NOT APPROVED/).count(), 1);
    await page.getByText("Private manual storage is not configured.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "View manual", exact: true }).isDisabled(), true);
    await page.getByText("Owner-provided trial/plating photo required.", { exact: false }).waitFor();
    await page.getByRole("cell", { name: "0.3 g", exact: true }).waitFor();
    await page.getByRole("button", { name: "10 servings", exact: true }).click();
    await page.getByRole("cell", { name: "1,600 g", exact: true }).waitFor();
    await page.getByRole("button", { name: "Cooking & Assembly", exact: true }).click();
    await page.getByText(/EVERY patty reaches at least 72°C/).waitFor();
    assert.equal(await page.getByText(/TRIAL REQUIRED — NOT APPROVED/).isVisible(), true);
    await page.screenshot({ path: path.join(output, `recipe-${viewport.width}.png`), fullPage: true });
    await page.getByRole("button", { name: "S1 / HB01 · House Burger Sauce →", exact: true }).click();
    await heading("Classic House Burger Sauce").waitFor();
    await page.getByRole("button", { name: "1 kg batch", exact: true }).click();
    await page.getByRole("cell", { name: "600 g", exact: true }).waitFor();
    await page.getByRole("button", { name: "Storage & Allergens", exact: true }).click();
    await page.getByText(/Use within 48 hours of mixing/).waitFor();
    await page.getByRole("button", { name: "Return to B01", exact: true }).click();
    await heading("Double Beef Cheeseburger").waitFor();
    await page.getByRole("button", { name: "T1 · Caramelized Onion →", exact: true }).click();
    await heading("Caramelized Onion").waitFor();
    await page.getByText(/250–300 g, NOT guaranteed or measured/).waitFor();
    assert.equal(await page.getByRole("button", { name: "Original preparation batch", exact: true }).count(), 1);
    await page.goBack(); await heading("Double Beef Cheeseburger").waitFor();
    await page.goForward(); await heading("Caramelized Onion").waitFor();
    await page.reload(); await heading("Caramelized Onion").waitFor();
    await page.getByRole("button", { name: "Return to B01", exact: true }).click();
    await page.getByRole("textbox", { name: "Search recipes", exact: true }).fill("s1");
    assert.equal(await page.locator(".recipe-list-item").count(), 1);
    await page.getByRole("textbox", { name: "Search recipes", exact: true }).fill("");
    await page.getByRole("button", { name: "Kitchen Guides", exact: true }).click();
    await page.getByText(/No matching pilot recipes/).waitFor();
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.getByText("Manage pilot draft · Admin / Manager", { exact: true }).click();
    await page.getByRole("combobox", { name: "Inventory recipe link", exact: true }).click();
    await page.getByRole("option", { name: "Explicit Test Burger · Active", exact: true }).click();
    await page.getByRole("textbox", { name: "Owner / chef review notes", exact: true }).fill("Dummy owner review only");
    await page.getByRole("button", { name: "Save pilot draft to database", exact: true }).click();
    await page.getByText("Saved draft · revision 1", { exact: true }).waitFor();
    await page.getByText("Manage pilot draft · Admin / Manager", { exact: true }).click();
    saveConflict = true;
    await page.getByRole("button", { name: "Save draft review", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "This draft changed. Reload before saving." }).waitFor();
    assert.deepEqual(mutationPaths, ["/kitchen/recipes/B01", "/kitchen/recipes/B01"]);
    await page.getByRole("button", { name: "Preparation Recipes", exact: true }).focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.getByRole("button", { name: "Preparation Recipes", exact: true }).getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => document.activeElement?.tagName !== "BODY"));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.emulateMedia({ media: "print" });
    for (const title of ["Ingredients", "Preparation", "Cooking", "Assembly", "Serving", "Delivery", "Storage controls", "Allergens"]) assert.equal(await page.getByRole("heading", { name: title, exact: true }).isVisible(), true);
    assert.equal(await page.getByText("Manage pilot draft · Admin / Manager", { exact: true }).isVisible(), false);
    if (viewport.width === 1536) {
      await page.pdf({ path: path.join(output, "B01-print.pdf"), format: "A4", printBackground: true });
      await page.screenshot({ path: path.join(output, "recipe-print.png"), fullPage: true });
    }
    await page.emulateMedia({ media: "screen" });
    failure = true; await page.reload();
    await page.getByRole("alert").filter({ hasText: "Isolated simulated API failure" }).waitFor();
    failure = false; await page.getByRole("button", { name: "Retry / reload drafts", exact: true }).click();
    await heading("Double Beef Cheeseburger").waitFor();
    role = "kitchen"; await page.reload();
    await page.getByRole("heading", { name: "Approved recipe instructions are not yet available", exact: true }).waitFor();
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
