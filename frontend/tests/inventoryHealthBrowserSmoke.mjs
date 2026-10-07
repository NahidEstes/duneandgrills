import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

// Mock every API request. This rehearsal never modifies real stock or calls a production API.
const origin = process.env.INVENTORY_HEALTH_SMOKE_URL || "http://localhost:3008";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Use an isolated local frontend only");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
const source = readFileSync(new URL("../../backend/services/inventoryHealthService.js", import.meta.url), "utf8");
const destinations = Object.fromEntries([...source.matchAll(/(\w+): "(\/inventory\/[^\"]+)"/g)].map(match => [match[1], match[2]]));
const summary = { destinations, lowStock: 1, outOfStock: 1, expiringItems: 1, blockedItems: 1, expiredItems: 1, quarantinedItems: 1, damagedItems: 1, unknownExpiryItems: 1, unknownQualityItems: 1, unallocatedItems: 1, expiryAlertDays: 7, pendingPurchaseOrders: 1, openPurchasingActions: 1 };
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [], requests = [];
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/api/**", async route => {
      const url = new URL(route.request().url()), resource = url.pathname.replace(/^\/api/, "");
      const status = url.searchParams.get("status"), state = url.searchParams.get("state");
      requests.push({ resource, status, state });
      let payload = { success: true, data: [], pagination: { page: 1, pages: 1, total: 0 } };
      if (resource === "/auth/me") payload = { user: { _id: "111111111111111111111111", name: "Mock Health Admin", role: "admin" } };
      else if (resource === "/cart") payload.data = { items: [], coupon: null };
      else if (resource === "/admin/dashboard") payload.data = { stats: {}, inventorySummary: summary, recentOrders: [] };
      else if (resource === "/settings/public") payload.data = {};
      else if (resource === "/inventory/items") {
        payload.data = [{ _id: "222222222222222222222222", name: `Health fixture ${status || "all"}`, sku: "INV-HEALTH-001", unit: "kg", currentStock: 10, physicalStock: 10, saleableStock: status === "out" ? 0 : 2, reorderLevel: 3, isActive: true, stockHealth: { low: status !== "out", out: status === "out" }, blockedReasons: ["expired"], expiringDates: ["2026-10-07"] }]; payload.pagination.total = 1;
      } else if (resource === "/inventory/purchase-orders") {
        assert.equal(status, "pending"); payload.data = [{ _id: "333333333333333333333333", orderNumber: "PO-HEALTH-001", items: [], status: "ordered", total: 10 }]; payload.pagination.total = 1;
      } else if (resource === "/inventory/purchasing-actions") {
        assert.equal(state, "active"); payload.data = [{ _id: "444444444444444444444444", title: "Active health action", explanation: "Mock only", state: "acknowledged", severity: "high", actionType: "LOW_STOCK", href: "/inventory/stock-items" }]; payload.pagination.total = 1;
      }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) });
    });
    for (const href of Object.values(destinations)) {
      await page.goto(`${origin}/admin`);
      const section = page.getByRole("region", { name: "Inventory Health" });
      await section.getByText("Expired / Blocked Stock · 1 items", { exact: false }).waitFor();
      await section.locator(`a[href="${href}"]`).click();
      await page.waitForURL(`${origin}${href}`);
      if (href.includes("stock-items")) {
        const status = new URL(href, origin).searchParams.get("status");
        await page.getByRole("cell").filter({ hasText: `Health fixture ${status}` }).first().waitFor();
        await page.getByText("Physical: 10 kg", { exact: true }).waitFor();
        await page.getByText(`Saleable: ${status === "out" ? 0 : 2} kg`, { exact: true }).waitFor();
        assert.ok(requests.some(request => request.resource === "/inventory/items" && request.status === status));
      } else if (href.includes("purchase-orders")) await page.getByText("PO-HEALTH-001", { exact: true }).waitFor();
      else await page.getByText("Active health action", { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, href);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS Inventory Health: all ${Object.keys(destinations).length} links, filters, stock detail and responsive layout (${viewport.width}px)`);
    await context.close();
  }
} finally { await browser.close(); }
