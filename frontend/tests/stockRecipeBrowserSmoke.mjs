import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

// All API requests are mocked. No real orders, inventory, accounts or database are touched.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const origin = process.env.STOCK_RECIPE_SMOKE_URL || "http://localhost:3008";
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }); const page = await context.newPage(); const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const ingredient = { _id: "111111111111111111111111", name: "Milk", sku: "INV-DAIRY-001", unit: "L", unitCost: 5, currentStock: 6, saleableStock: 2, isActive: true };
    const dish = { _id: "222222222222222222222222", name: "Test Drink", price: 20, category: "Drinks", recipeStatus: "not_configured", recipeIssue: "Recipe is inactive", recipe: { isActive: false, doNotTrack: false, ingredients: [{ inventoryItem: ingredient, quantityPerSale: 0.2, unit: "L", isActive: true }] } };
    const addon = { _id: "333333333333333333333333", name: "Extra Milk", price: 2, recipeStatus: "not_configured", recipeIssue: "Missing recipe", inventoryRecipe: null };
    const pagination = { page: 1, pages: 1, total: 1 };
    await context.route("**/api/**", async route => {
      const resource = new URL(route.request().url()).pathname.replace(/^\/api/, ""); let data = []; let payload = { success: true, data };
      if (resource === "/auth/me") payload = { user: { _id: "444444444444444444444444", name: "Test Admin", role: "admin" } };
      else if (resource === "/cart") payload.data = { items: [], coupon: null };
      else if (resource === "/inventory/items") payload = { success: true, data: [ingredient], pagination };
      else if (resource === "/inventory/recipes") payload = { success: true, data: [dish], pagination, summary: { notConfigured: 1, total: 1 } };
      else if (resource.startsWith("/inventory/recipes/")) {
        const posted = route.request().postDataJSON(); assert.equal(typeof posted.doNotTrack, "boolean"); assert.equal(posted.doNotTrack, true);
        dish.recipeStatus = "do_not_track"; dish.recipeIssue = ""; dish.recipe = { ...dish.recipe, doNotTrack: true, ingredients: [] }; payload.data = dish;
      } else if (resource === "/inventory/add-on-recipes") payload = { success: true, data: [addon] };
      else if (resource.startsWith("/inventory/add-on-recipes/")) {
        const posted = route.request().postDataJSON(); assert.equal(posted.doNotTrack, true);
        addon.recipeStatus = "do_not_track"; addon.recipeIssue = ""; addon.inventoryRecipe = { doNotTrack: true, ingredients: [] }; payload.data = addon;
      } else if (resource === "/inventory/batches") payload = { success: true, pagination, summary: { active: 1 }, data: [{ _id: "555555555555555555555555", item: ingredient, lotNumber: "LOT-EXPIRED", remainingQuantity: 6, saleableQuantity: 0, receivedQuantity: 6, unitCost: 5, expiryDate: "2000-01-01", usability: "expired", conversionFactor: 1, purchaseUnit: "L", purchaseQuantity: 6 }] };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) });
    });
    await page.goto(`${origin}/inventory/recipes`);
    await page.getByRole("status").filter({ hasText: "Sales blocked: Recipe is inactive" }).waitFor();
    await page.getByText("Physical Stock", { exact: true }).waitFor();
    await page.getByText("Saleable: 2 L", { exact: true }).waitFor();
    await page.getByLabel("Do not track inventory", { exact: true }).check();
    await page.getByRole("button", { name: "Update Recipe", exact: true }).click();
    await page.getByText("Inventory tracking is disabled for this menu item").waitFor();
    await page.getByRole("button", { name: "Add-on Recipes", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Sales blocked: Missing recipe" }).waitFor();
    await page.getByLabel("Do Not Track", { exact: true }).check();
    await page.getByRole("button", { name: "Save Add-on Recipe", exact: true }).click();
    await page.getByText("This add-on is explicitly excluded from inventory tracking.").waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.goto(`${origin}/inventory/batches`);
    await page.getByText("LOT-EXPIRED", { exact: true }).waitFor();
    await page.getByText("Saleable: 0 L", { exact: true }).waitFor();
    await page.getByRole("cell", { name: "Expired", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.deepEqual(errors, []);
    console.log(`PASS recipe warnings / explicit DNT / add-on readiness / physical vs saleable / batch status (${viewport.width}px)`);
    await context.close();
  }
} finally { await browser.close(); }
