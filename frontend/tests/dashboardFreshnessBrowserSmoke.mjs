import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

// Local frontend only; every API request is intercepted, including authentication.
const origin = process.env.DASHBOARD_FRESHNESS_SMOKE_URL || "http://localhost:3011";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.install();
    let summaryStatus = 503, orderStatus = 503, summaryCalls = 0, orderCalls = 0, totalOrders = 7, pending = [];
    const order = id => ({ _id: id, orderNumber: `MOCK-${id}`, customer: { name: "Dummy" }, totalAmount: 20, items: [{ quantity: 1 }], status: "pending" });
    await context.route("**/api/**", async route => {
      const resource = new URL(route.request().url()).pathname.replace(/^\/api/, "");
      let status = 200, payload = { success: true, data: [] };
      if (resource === "/auth/me") payload = { user: { _id: "111111111111111111111111", role: "admin", name: "Mock Freshness Admin" } };
      else if (resource === "/cart") payload.data = { items: [], coupon: null };
      else if (resource === "/settings") payload.data = { notifications: { adminSoundEnabled: false, pollingIntervalSeconds: 3 } };
      else if (resource === "/settings/public") payload.data = {};
      else if (resource === "/admin/dashboard") { summaryCalls++; status = summaryStatus; payload.data = { stats: { totalOrders, totalRevenue: 0, netSales: 0, orderedAmount: 0, grossSales: 0 }, recentOrders: [], menuPreview: [], recentPosts: [], offers: [], recentReviews: [], activities: [] }; }
      else if (resource === "/orders") { orderCalls++; status = orderStatus; payload.data = pending; }
      if (status !== 200) payload = { success: false, message: status === 401 ? "Fixture session expired" : "Fixture API unavailable" };
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
    });
    await page.goto(`${origin}/admin`);
    const health = page.getByRole("region", { name: "Dashboard connection and freshness" });
    await health.getByText("Summary unavailable", { exact: true }).waitFor();
    await page.getByText("Dashboard summary unavailable. Use Retry summary above.").waitFor();
    assert.equal(await health.locator("time").count(), 0);
    assert.equal(await page.getByText("Total Orders", { exact: true }).count(), 0);
    await health.getByText(/This does not mean there are no pending orders/).waitFor();

    summaryStatus = 200;
    await health.getByRole("button", { name: "Retry summary" }).click();
    await page.getByText("Total Orders", { exact: true }).waitFor();
    const card = page.locator("article").filter({ has: page.getByText("Total Orders", { exact: true }) });
    await card.getByText("7", { exact: true }).waitFor();
    const stamp = await health.locator("time").first().getAttribute("datetime");
    assert.match(await health.locator("time").first().getAttribute("aria-label"), /Asia\/Riyadh/);
    assert.equal(await health.getByText(/Order monitoring failed/).count(), 1);

    summaryStatus = 503;
    await health.getByRole("button", { name: "Refresh summary" }).click();
    await health.getByText(/Last successful data is retained/).waitFor();
    assert.equal(await card.getByText("7", { exact: true }).count(), 1);
    assert.equal(await health.locator("time").first().getAttribute("datetime"), stamp);
    summaryStatus = 200; totalOrders = 8;
    await health.getByRole("button", { name: "Retry summary" }).click();
    await card.getByText("8", { exact: true }).waitFor();
    assert.equal(await health.getByText(/Last successful data is retained/).count(), 0);

    orderStatus = 200; pending = [order("1")];
    await health.getByRole("button", { name: "Retry order monitoring" }).click();
    await page.getByRole("button", { name: /last known pending count 1/ }).waitFor();
    await page.getByText("1 pending order need attention.", { exact: true }).waitFor();
    // Observe notification creation, not just currently visible toasts (which expire).
    await page.evaluate(() => {
      window.__newOrderToasts = 0;
      new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === 1 && node.matches?.("[data-sonner-toast]") && node.textContent.includes("New order #")) window.__newOrderToasts++;
      }))).observe(document.body, { childList: true, subtree: true });
    });
    orderStatus = 503;
    await health.getByText(/Order monitoring failed/).waitFor();
    assert.equal(await page.getByRole("button", { name: /last known pending count 1/ }).count(), 1);
    orderStatus = 200;
    await health.getByRole("button", { name: "Retry order monitoring" }).click();
    await health.getByText(/Order monitoring: last checked/).waitFor();
    await health.getByRole("button", { name: "Refresh summary" }).click();
    await health.getByText("Summary updated", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__newOrderToasts), 0);
    pending = [order("1"), order("2")];
    await page.getByText("New order #MOCK-2", { exact: true }).waitFor();
    await page.getByRole("button", { name: /last known pending count 2/ }).waitFor();

    // Hide the document: summaries pause while the configured urgent order poll continues.
    await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
    // Drain an already queued mutation without allowing a hidden summary request.
    await page.clock.runFor(1000); const beforeHidden = summaryCalls, beforeOrders = orderCalls;
    await page.clock.runFor(65_000);
    assert.equal(summaryCalls, beforeHidden); assert.ok(orderCalls > beforeOrders);
    await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
    await health.getByText("Summary updated", { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('[aria-label="Dashboard connection and freshness"]')?.textContent.includes("Summary updated"));
    assert.equal(summaryCalls, beforeHidden + 1);
    assert.equal(await page.evaluate(() => window.__newOrderToasts), 1);

    await page.evaluate(() => { Object.defineProperty(navigator, "onLine", { configurable: true, value: false }); window.dispatchEvent(new Event("offline")); });
    await health.getByText(/Browser offline/).first().waitFor();
    const offlineCalls = [summaryCalls, orderCalls]; await page.clock.runFor(300_000);
    assert.deepEqual([summaryCalls, orderCalls], offlineCalls);
    await page.evaluate(() => { Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); window.dispatchEvent(new Event("online")); });
    await health.getByText("Summary updated", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log(`PASS Dashboard freshness/retry/stale, independent monitoring/no duplicate alerts, hidden/offline recovery (${viewport.width}px)`);

    summaryStatus = 401;
    await health.getByRole("button", { name: "Refresh summary" }).click();
    await page.waitForURL(`${origin}/login**`);
    const expiredCalls = [summaryCalls, orderCalls]; await page.clock.runFor(120_000);
    assert.deepEqual([summaryCalls, orderCalls], expiredCalls);
    console.log(`PASS Expired session uses existing login flow and stops dashboard retries (${viewport.width}px)`);
    await context.close();
  }
} finally { await browser.close(); }
