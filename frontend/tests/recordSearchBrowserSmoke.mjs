import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

// All API calls are intercepted. This test never accesses a real database or creates records.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const origin = process.env.RECORD_SMOKE_URL || "http://localhost:3008";
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage(); const errors = []; const queries = [];
    page.on("pageerror", error => errors.push(error.message));
    const row = { type: "expense", id: "111111111111111111111111", readableId: "EXP-2026-000001", identifiers: { expenseNumber: "EXP-2026-000001" }, title: "Restaurant rent", status: "unpaid", date: "2026-10-05", context: "Vendor", href: "/admin/record-search?type=expense&id=111111111111111111111111" };
    await context.route("**/api/**", async route => {
      const url = new URL(route.request().url()); const resource = url.pathname.replace(/^\/api/, ""); let payload = { success: true, data: [] }; let status = 200;
      if (resource === "/auth/me") payload = { user: { _id: "222222222222222222222222", name: "Test Admin", role: "admin" } };
      if (resource === "/cart") payload.data = { items: [], coupon: null };
      if (resource === "/record-search") {
        queries.push({ q: url.searchParams.get("q"), page: url.searchParams.get("page") });
        if (url.searchParams.get("q") === "error") { status = 503; payload = { message: "Search temporarily unavailable" }; }
        else payload = { success: true, data: url.searchParams.get("q") === "empty" ? [] : [row], pagination: { page: Number(url.searchParams.get("page") || 1), hasMore: url.searchParams.get("page") !== "2" } };
      }
      if (resource.startsWith("/record-search/")) payload.data = row;
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
    });
    await page.goto(`${origin}/admin/record-search`);
    const search = page.getByRole("searchbox", { name: "Search by ID", exact: true });
    await search.fill("EXP-2026-000001");
    await page.getByText("Restaurant rent · View details →").waitFor();
    await page.getByRole("button", { name: "Copy ID EXP-2026-000001", exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), row.readableId);
    const downloading = page.waitForEvent("download"); await page.getByRole("button", { name: "Export displayed records CSV" }).click();
    assert.ok((await readFile(await (await downloading).path(), "utf8")).includes(row.readableId));
    const nextPageResponse = page.waitForResponse(response => response.url().includes("/record-search?") && new URL(response.url()).searchParams.get("page") === "2");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await nextPageResponse;
    await page.getByText("Page 2", { exact: true }).waitFor();
    assert.ok(queries.some(query => query.page === "2"));
    await page.getByText("Restaurant rent · View details →").click();
    await page.getByRole("heading", { name: "Restaurant rent", exact: true }).waitFor();
    await page.reload(); await page.getByRole("heading", { name: "Restaurant rent", exact: true }).waitFor();
    await page.getByRole("searchbox", { name: "Search by ID", exact: true }).fill("empty");
    await page.getByText("No permitted matching records.").waitFor();
    await page.getByRole("searchbox", { name: "Search by ID", exact: true }).fill("error");
    await page.getByRole("alert").filter({ hasText: "Search temporarily unavailable" }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.deepEqual(errors, []);
    console.log(`PASS record search / copy / CSV / pagination / detail reload / empty / error (${viewport.width}px)`);
    await context.close();
  }
} finally { await browser.close(); }
