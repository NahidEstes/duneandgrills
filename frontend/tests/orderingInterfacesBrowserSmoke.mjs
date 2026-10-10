import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setFixtureSession } from "./helpers/fixtureSession.mjs";

// Every browser API is intercepted. Run only against an owned local Next server.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
const origin = process.env.ORDERING_SMOKE_URL || "http://127.0.0.1:3018";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error("Local smoke server required");
const product = { _id: "222222222222222222222222", name: "Test Burger", description: "Owned browser fixture", price: 20, image: "/logo.jpeg", category: "Food", isAvailable: true, customization: { enabled: true, spice: { enabled: true, options: ["medium", "hot"], default: "medium" } }, addOns: [] };
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block" }); const page = await context.newPage(); const errors = [];
    page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => dialog.accept());
    let actor = null; let submitted; let status = "pending"; const changes = [];
    const order = () => ({ _id: "444444444444444444444444", orderNumber: "SMOKE-ORDER", status, fulfillmentType: "delivery", sourceChannel: "customer", source: "website", orderType: "delivery", createdAt: new Date(Date.now() - 120000).toISOString(), updatedAt: new Date().toISOString(), customerName: "Guest Fixture", kitchenNotes: "Separate sauces", notes: "Separate sauces", totalAmount: 30, paymentStatus: "pending", items: [{ name: product.name, quantity: 1, price: 20, productType: "menuItem", itemNote: "No onion", spiceLevel: "hot", selectedAddOns: [], category: "Food", kitchenStation: "Grill" }] });
    await context.route("**/api/**", async route => {
      const request = route.request(); const url = new URL(request.url()); const resource = url.pathname.replace(/^\/api/, ""); const body = request.postDataJSON();
      let payload = { success: true, data: [] }; let code = 200;
      if (resource === "/auth/me") { payload = actor ? { user: actor } : { success: false, message: "Guest" }; if (!actor) code = 401; }
      if (resource === "/menu" || resource === "/menu/manage") payload.data = [product];
      if (resource === "/categories") payload.data = [{ _id: "333333333333333333333333", name: "Food", type: "menu", isActive: true }];
      if (resource === "/cart") payload.data = { items: [], coupon: null };
      if (resource === "/settings/public") payload.data = { orders: { channels: { website: true, pos: true }, deliveryFee: 10, minimumDeliveryOrder: 0 }, receipt: {} };
      if (resource === "/orders/config") payload.data = { websiteOrderingEnabled: true, minimumDeliveryOrder: 0, defaultOrderType: "delivery", orderTypes: [{ value: "delivery", label: "Delivery", deliveryFee: 10 }, { value: "pickup", label: "Pickup", deliveryFee: 0 }] };
      if (resource === "/orders" && body) { submitted = body; payload = { success: true, data: order(), trackingToken: "private-browser-code" }; code = 201; }
      if (resource.startsWith("/orders/track/")) { assert.equal(request.headers()["x-order-tracking-token"], "private-browser-code"); payload.data = { ...order(), status: "ready" }; }
      if (resource === "/kitchen/events") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false }) });
      if (resource === "/kitchen/orders") payload = { success: true, data: [order()], serverNow: new Date().toISOString(), config: { notifications: { pollingIntervalSeconds: 5, soundEnabled: true } } };
      if (/^\/kitchen\/orders\/.+\/(status|handoff)$/.test(resource)) { assert.equal(body.expectedStatus, status); status = body.status; changes.push(status); payload = { success: true, data: order(), serverNow: new Date().toISOString() }; }
      if (resource === "/profile/dashboard") payload.data = { user: actor, stats: { orders: 1, favorites: 0, points: 400, reviews: 0 }, orders: [order()], recentOrders: [order()], favorites: [], addresses: [], paymentMethods: [], reviews: [] };
      if (resource === "/rewards/me") payload.data = { pointsBalance: 400, pointsPerSAR: 10, history: [], activeRedemption: null, membership: { tier: "Silver", lifetimePoints: 1400, nextTier: { name: "Gold", minimumPoints: 5000 } }, policy: { reservationMinutes: 30 } };
      await route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(payload) });
    });
    await page.goto(origin + "/menu");
    await page.getByLabel("Search menu").fill("missing fixture"); await page.getByText("No items match this category and your filters.").waitFor();
    await page.getByLabel("Search menu").fill("Test Burger"); await page.getByRole("button", { name: "Customize & Add" }).click();
    const modal = page.getByRole("dialog"); await modal.getByRole("button", { name: "Hot", exact: true }).click(); await modal.getByPlaceholder("E.g. no onions, extra sauce, well done…").fill("No onion"); await modal.getByRole("button", { name: /Add to Cart/ }).click();
    await page.reload(); await page.getByRole("button", { name: "Open cart, 1 items" }).click(); await page.getByRole("button", { name: "Proceed to Checkout" }).click();
    await page.getByLabel("Customer name").fill("Guest Fixture"); await page.getByLabel("Customer phone").fill("0500000000"); await page.getByLabel("Delivery address").fill("Owned browser delivery address"); await page.getByLabel("Kitchen notes").fill("Separate sauces");
    await page.getByRole("button", { name: "Place Order", exact: true }).click(); await page.getByRole("button", { name: "Track this order" }).waitFor();
    assert.equal(submitted.paymentOption, "cod"); assert.equal(submitted.kitchenNotes, "Separate sauces"); assert.equal(submitted.items[0].customization.note, "No onion"); assert.equal(submitted.items[0].customization.spiceLevel, "hot");
    await page.getByRole("button", { name: "Track this order" }).click(); await page.getByText("Last synchronized", { exact: false }).waitFor(); assert.ok(!page.url().includes("private-browser-code"));
    actor = { _id: "111111111111111111111111", name: "Kitchen Fixture", role: "kitchen" }; await setFixtureSession(context, origin, actor.role); await page.goto(origin + "/kitchen");
    await page.getByText("Polling fallback", { exact: false }).waitFor(); await page.getByRole("combobox", { name: "Kitchen station" }).click(); await page.getByRole("option", { name: "Grill", exact: true }).click();
    for (const action of ["Accept Order", "Start Preparing", "Mark Ready", "Dispatch order", "Confirm delivered"]) await page.getByRole("button", { name: action, exact: true }).click();
    assert.deepEqual(changes, ["confirmed", "preparing", "ready", "out-for-delivery", "delivered"]); await page.getByRole("heading", { name: "Completed", exact: true }).waitFor();
    actor = { ...actor, name: "Customer Fixture", role: "customer", email: "fixture@example.test", phone: "0500000000", pointsBalance: 400 }; await page.goto(origin + "/profile/rewards");
    await page.getByText("Silver membership", { exact: false }).waitFor();
    assert.deepEqual(errors, [], "No client runtime failures");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), "Profile rewards must fit the viewport");
    await context.close(); console.log(`Ordering, guest tracking, kitchen handover and profile smoke passed ${viewport.width}px`);
  }
} finally { await browser.close(); }
