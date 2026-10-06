import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

// All API calls are intercepted; this browser cannot modify orders, finance or production data.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const origin = process.env.REPORTING_SMOKE_URL || "http://localhost:3008";
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }); const page = await context.newPage(); const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const admin = { _id: "111111111111111111111111", name: "Mock Admin", role: "admin" };
    const cashier = { _id: "222222222222222222222222", name: "Mock Cashier", role: "cashier" };
    let actor = admin; const customerRequests = []; const financeActions = [];
    const category = { _id: "333333333333333333333333", name: "Operations", color: "#f59e0b", isActive: true };
    const paidExpense = { _id: "444444444444444444444444", expenseNumber: "EXP-2026-000001", title: "Paid power bill", totalAmount: 100, recognizedAmount: 100, recognizedVat: 0, amountPaid: 100, paymentStatus: "paid", recordStatus: "active", expenseDate: "2026-10-04T21:00:00Z", category };
    const unpaidExpense = { _id: "555555555555555555555555", expenseNumber: "EXP-2026-000002", title: "Duplicate unpaid bill", totalAmount: 100, recognizedAmount: 100, recognizedVat: 0, amountPaid: 0, paymentStatus: "unpaid", recordStatus: "active", expenseDate: "2026-10-04T21:00:00Z", category };
    const summary = { totalOrders: 4, totalRevenue: 75, orderedAmount: 400, grossSales: 200, collectedAmount: 200, completedRefunds: 25, refundTotal: 25, voidAmount: 100, netSales: 75, aggregatorPrepaidAmount: 0, discountTotal: 0 };
    const report = { summary, range: { from: "2026-10-05", to: "2026-10-05" }, filters: { source: "all", orderType: "all" }, series: [{ date: "2026-10-05", orders: 4, revenue: 75, ...summary }], cashActivity: { collectedAmount: 200, completedRefunds: 25, voidAmount: 100, netCollected: 75, cashCollected: 200, cashRefunds: 25, cashVoids: 100, netCash: 75, unknownPaymentDateAmount: 30, unknownRefundDateAmount: 0 }, definitions: { timezone: "Asia/Riyadh", salesAttribution: "Order date, not payment date", netSales: "Gross minus completed refunds and voids; not profit" }, sourceBreakdown: [{ source: "pos", orders: 4, revenue: 75, ...summary }], orderTypeBreakdown: [{ orderType: "takeaway", orders: 4, revenue: 75, ...summary }], bestSelling: [], leastSelling: [], statusBreakdown: [] };
    await context.addInitScript(() => { localStorage.setItem("dg_pos_terminal", "COUNTER-1"); window.print = () => {}; });
    page.on("dialog", dialog => dialog.accept("Duplicate unpaid bill confirmed"));
    await context.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url()), resource = url.pathname.replace(/^\/api/, "");
      let payload = { success: true, data: [] }, status = 200;
      if (resource === "/auth/me") payload = { user: actor };
      else if (resource === "/cart") payload.data = { items: [], coupon: null };
      else if (resource === "/admin/dashboard") payload.data = { stats: summary, recentOrders: [], analytics: { popularItems: [], categoryBreakdown: [], statusBreakdown: [] }, cashActivity: report.cashActivity, reportingDefinitions: report.definitions };
      else if (resource === "/admin/analytics") payload.data = report;
      else if (resource === "/settings/public") payload.data = { orders: { channels: { pos: true } }, posCheckout: {}, receipt: {} };
      else if (resource === "/expenses/categories") payload.data = [category];
      else if (resource.endsWith("/archive") || resource.endsWith("/cancel")) {
        const body = request.postDataJSON(); financeActions.push({ resource, body });
        const row = resource.includes(paidExpense._id) ? paidExpense : unpaidExpense;
        if (resource.endsWith("/cancel")) { assert.ok(body.reason); row.recordStatus = "cancelled"; row.recognizedAmount = 0; }
        else row.recordStatus = "archived";
      } else if (resource === "/expenses/entries" || resource === "/expenses/entries/export") {
        const state = url.searchParams.get("recordStatus") || (resource.endsWith("export") ? "all" : "active");
        const rows = [paidExpense, unpaidExpense].filter(row => state === "all" || row.recordStatus === state);
        payload = { success: true, data: rows, pagination: { page: 1, pages: 1, total: rows.length } };
      } else if (resource === "/expenses/reports") payload.data = { summary: { totalExpenses: 100, paidAmount: 100, outstandingAmount: 0, count: 2, recurringCount: 0, recurringTotal: 0 }, trend: [], categoryBreakdown: [], paymentStatus: [], recurring: [] };
      else if (resource === "/pos/session") payload.data = { actor, token: "mock-only-pos-session", locked: false, autoLockMinutes: 0 };
      else if (resource === "/pos/terminals") payload.data = [{ _id: "666666666666666666666666", code: "COUNTER-1", name: "Counter One", isActive: true }];
      else if (resource === "/pos/quick-menu") payload.data = { favourites: [], popular: [] };
      else if (resource === "/pos/shifts/current") payload = { success: true, data: null, config: { enabled: false } };
      else if (resource === "/pos/sales") payload.pagination = { page: 1, pages: 0, total: 0 };
      else if (resource === "/pos/customers") {
        customerRequests.push({ resource, search: url.searchParams.get("search"), limit: url.searchParams.get("limit"), session: request.headers()["x-pos-session"] });
        if (url.searchParams.get("search") === "Broken") { status = 503; payload = { success: false, message: "Mock search unavailable" }; }
        else if (url.searchParams.get("search") === "Sam") payload.data = [{ _id: "777777777777777777777777", name: "Sam Customer", phone: "0550000000", customerNumber: "CUS-000001" }];
      } else if (actor.role === "cashier" && resource.startsWith("/admin/")) throw new Error(`Cashier requested Admin endpoint: ${resource}`);
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
    });

    await page.goto(`${origin}/admin?tab=analytics`);
    await page.getByRole("heading", { name: "Sales · order-date basis · Asia/Riyadh", exact: true }).waitFor();
    await page.getByRole("heading", { name: "Net Sales by Order Date", exact: true }).waitFor();
    await page.getByText(/captured payments and/).waitFor();
    const downloadEvent = page.waitForEvent("download"); await page.getByRole("button", { name: "CSV", exact: true }).click();
    const stream = await (await downloadEvent).createReadStream(); let csv = ""; for await (const chunk of stream) csv += chunk.toString();
    assert.match(csv, /Event-date activity/); assert.match(csv, /Completed refunds SAR/); assert.match(csv, /75/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Analytics must not overflow viewport");

    await page.goto(`${origin}/admin/expenses/entries`);
    const paidRow = page.getByRole("row").filter({ hasText: "Paid power bill" });
    assert.equal(await paidRow.getByRole("button", { name: "Cancel Paid power bill" }).isDisabled(), true);
    await paidRow.getByRole("button", { name: "Archive Paid power bill" }).click();
    await page.getByRole("row").filter({ hasText: "Paid power bill" }).waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Cancel Duplicate unpaid bill" }).click();
    await page.getByRole("row").filter({ hasText: "Duplicate unpaid bill" }).waitFor({ state: "hidden" });
    await page.getByRole("combobox", { name: "Expense record state" }).click(); await page.getByRole("option", { name: "Archived history", exact: true }).click();
    await page.getByRole("row").filter({ hasText: "Paid power bill" }).waitFor();
    assert.equal(financeActions.filter(row => row.resource.endsWith("/archive")).length, 1); assert.equal(financeActions.filter(row => row.resource.endsWith("/cancel")).length, 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Finance must not overflow viewport");
    await page.goto(`${origin}/admin/expenses/reports`); await page.getByText(/Archived expenses included/).waitFor();
    const popupEvent = page.waitForEvent("popup"); await page.getByRole("button", { name: "Export PDF", exact: true }).click();
    const popup = await popupEvent; await popup.getByText("Recognized expense", { exact: true }).waitFor(); await popup.getByText("Archived · Paid", { exact: true }).waitFor(); await popup.close();

    actor = cashier; await page.goto(`${origin}/pos`);
    const search = page.getByRole("textbox", { name: "Search registered customer" }); await search.waitFor();
    await search.fill("Missing"); await page.getByText("No customers found.", { exact: true }).waitFor();
    await search.fill("Broken"); await page.getByRole("alert").filter({ hasText: "Customer search unavailable" }).waitFor();
    assert.equal(await page.getByText("No customers found.", { exact: true }).count(), 0, "API failures must not look like empty results");
    await search.fill("Sam"); await page.getByRole("option", { name: /Sam Customer/ }).click();
    await page.getByText("Sam Customer · 0550000000", { exact: true }).waitFor();
    assert.equal(customerRequests.length, 3); assert.ok(customerRequests.every(row => row.limit === "8" && row.session === "mock-only-pos-session"));
    assert.deepEqual(errors, []); console.log(`PASS Phase 3 browser: Analytics/CSV, archive/cancel/history/PDF, cashier search ${viewport.width}x${viewport.height}`);
    await context.close();
  }
} finally { await browser.close(); }
