import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

// All API requests are mocked. No real orders, inventory, accounts or database are touched.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const origin = process.env.STOCK_RECIPE_SMOKE_URL || "http://localhost:3008";
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block" }), page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const ingredient = { _id: "111111111111111111111111", name: "Milk", sku: "INV-DAIRY-001", unit: "L", unitCost: 5, currentStock: 6, saleableStock: 2, isActive: true };
    const dish = { _id: "222222222222222222222222", name: "Test Drink", price: 20, category: "Drinks", recipeStatus: "not_configured", recipeIssue: "Recipe is inactive", recipeRevision: "menu:0", recipe: { isActive: false, doNotTrack: false, ingredients: [{ inventoryItem: ingredient, quantityPerSale: .2, unit: "L", isActive: true }] } };
    const addon = { _id: "333333333333333333333333", name: "Extra Milk", price: 2, recipeStatus: "not_configured", recipeIssue: "Missing recipe", recipeRevision: null, recipe: null, inventoryRecipe: null };
    const pagination = { page: 1, pages: 1, total: 1, limit: 20 };
    await context.route("**/api/**", async route => {
      const resource = new URL(route.request().url()).pathname.replace(/^\/api/, ""); let payload = { success: true, data: [] };
      if (resource === "/auth/me") payload = { user: { _id: "444444444444444444444444", name: "Test Admin", role: "admin" } };
      else if (resource === "/cart") payload.data = { items: [], coupon: null };
      else if (resource === "/inventory/items/" + ingredient._id) payload.data = ingredient;
      else if (resource === "/inventory/recipes" || resource === "/inventory/add-on-recipes") payload = { success: true, data: [resource.endsWith("add-on-recipes") ? addon : dish], pagination, summary: { configured: 0, notConfigured: 1, doNotTrack: 0, costCoverage: 0 } };
      else if (resource === "/inventory/recipe-review") {
        const body = route.request().postDataJSON(), target = body.kind === "menu" ? dish : addon, line = body.ingredients[0];
        const tracked = !body.doNotTrack && body.isActive && !!line, quantity = Number(line?.quantity || 0);
        payload.data = { recipeRevision: target.recipeRevision, readiness: body.doNotTrack ? "do_not_track" : tracked ? "configured" : "not_configured", issue: tracked || body.doNotTrack ? "" : target.recipeIssue, scope: body.kind + "_only", portionsAvailable: tracked ? Math.floor(2 / quantity) : null, limitingIngredients: tracked ? [ingredient.name] : [], ingredients: tracked ? [{ inventoryItem: ingredient._id, name: ingredient.name, unit: "L", physicalStock: 6, usable: 2, required: quantity, shortage: 0, preparation: null }] : [], normalizedIngredients: body.doNotTrack ? [] : body.ingredients.map(row => ({ ...row, [body.kind === "menu" ? "quantityPerSale" : "quantityPerAddOn"]: Number(row.quantity), unit: "L" })), metrics: { lines: tracked ? [{ ingredientCostPerDish: quantity * 5 }] : [], totalEstimatedIngredientCost: tracked ? quantity * 5 : null, estimatedProfit: tracked ? target.price - quantity * 5 : null, profitMargin: tracked ? (target.price - quantity * 5) / target.price * 100 : null, costConfidence: body.doNotTrack ? "not_tracked" : tracked ? "reference_complete" : "incomplete" } };
      } else if (resource === "/inventory/recipes/" + dish._id || resource === "/inventory/add-on-recipes/" + addon._id) {
        const target = resource.includes("add-on-recipes") ? addon : dish;
        if (route.request().method() === "PUT") {
          const posted = route.request().postDataJSON(); assert.equal(posted.expectedRevision, target.recipeRevision); assert.equal(posted.doNotTrack, true); assert.equal(posted.confirmDoNotTrack, true); assert.ok(posted.reason.length >= 5);
          target.recipeStatus = "do_not_track"; target.recipeIssue = ""; target.recipeRevision = String(target.recipeRevision) + ":saved"; target.recipe = { isActive: true, doNotTrack: true, ingredients: [] }; target.inventoryRecipe = target.recipe;
        }
        payload.data = target;
      } else if (resource === "/inventory/batches") payload = { success: true, pagination, summary: { active: 1 }, data: [{ _id: "555555555555555555555555", item: ingredient, lotNumber: "LOT-EXPIRED", remainingQuantity: 6, saleableQuantity: 0, receivedQuantity: 6, unitCost: 5, expiryDate: "2000-01-01", usability: "expired", conversionFactor: 1, purchaseUnit: "L", purchaseQuantity: 6 }] };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) });
    });
    const exclude = async () => {
      await page.getByLabel("Do not track inventory", { exact: true }).check();
      await page.getByRole("button", { name: "Update Recipe", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Confirm Do Not Track", exact: true }); await dialog.waitFor();
      await dialog.getByLabel("I confirm clearing this mapping and disabling tracking", { exact: true }).check();
      await dialog.getByLabel("Reason for disabling tracking", { exact: true }).fill("Owned explicit smoke exclusion");
      await dialog.getByRole("button", { name: "Confirm and save exclusion", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
    };
    await page.goto(origin + "/inventory/recipes");
    await page.getByRole("status").filter({ hasText: "Sales blocked: Recipe is inactive" }).waitFor();
    await page.getByLabel("Recipe active", { exact: true }).check();
    await page.getByRole("region", { name: "Stock planner", exact: true }).getByText("2 L", { exact: true }).waitFor();
    await exclude(); await page.getByText("Saved version", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Add-on Recipes", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Sales blocked: Missing recipe" }).waitFor();
    await exclude(); assert.equal(addon.recipeStatus, "do_not_track");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.goto(origin + "/inventory/batches"); await page.getByText("LOT-EXPIRED", { exact: true }).waitFor();
    await page.getByText("Saleable: 0 L", { exact: true }).waitFor(); await page.getByRole("cell", { name: "Expired", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); assert.deepEqual(errors, []);
    console.log("PASS recipe warnings / revisioned explicit DNT / add-on readiness / usable stock / expired batch (" + viewport.width + "px)");
    await context.close();
  }
} finally { await browser.close(); }
