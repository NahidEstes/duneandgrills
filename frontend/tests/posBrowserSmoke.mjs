import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { setFixtureSession } from "./helpers/fixtureSession.mjs";

// Run against a local production/dev server. Every API is intercepted with fixtures.
// No order, payment or production database request leaves this browser context.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block" }); const page = await context.newPage();
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    const actor = { _id: "111111111111111111111111", name: "Smoke Cashier", role: "manager" };
    const product = { _id: "222222222222222222222222", name: "Test Burger", description: "Fixture", price: 20, image: "/logo.jpeg", category: "Food", isAvailable: true, customization: { enabled: false } };
    const terminal = { _id: "333333333333333333333333", code: "COUNTER-1", name: "Counter One", isActive: true };
    let locked = false; let draft; let captured; let lostCaptureResponse = false; const queries = []; const cashKeys = [];
    let shift; let expectedCash = 50;
    const saleId = "555555555555555555555555";
    let fixtureSale = { _id: saleId, orderNumber: "SMOKE-1001", createdBy: actor, items: [{ ...product, quantity: 2, selectedAddOns: [] }], subtotal: 40, totalAmount: 40, status: "pending", paymentStatus: "paid", paymentMethod: "cash", orderType: "dine-in", terminal: terminal.code, createdAt: new Date().toISOString(), customer: { name: "Walk-in" }, cashReceived: 50, changeDue: 10 };
    const refundRows = [];
    const shiftSummary = () => ({ shift, totals: { openingCash: 50, cashSales: 0, cardSales: 0, cashAdded: expectedCash - 50, cashPayouts: 0, cashRefunds: 0, cashVoids: 0, expectedCash } });
    page.on("dialog", dialog => dialog.accept());
    await context.route("**/api/**", async route => {
      const url = new URL(route.request().url()); const body = route.request().postDataJSON(); const resource = url.pathname.replace(/^\/api/, "");
      let payload = { success: true, data: [] };
      if (resource === "/auth/me") payload = { user: actor };
      if (resource === "/cart") payload.data = { items: [], coupon: null };
      if (resource === "/menu/manage" || resource === "/menu") payload.data = [product];
      if (resource === "/pos/session") payload.data = { actor, token: "synthetic-pos-session", locked, autoLockMinutes: 1 };
      if (resource === "/pos/session/lock") locked = true;
      if (resource === "/pos/session/unlock") { locked = false; payload.data = { actor, locked }; }
      if (resource === "/pos/session/cashiers") payload.data = [actor];
      if (resource === "/pos/terminals") payload.data = [terminal];
      if (resource === "/pos/quick-menu") payload.data = { favourites: [{ productId: product._id, productType: "menuItem", position: 0 }], popular: [{ productId: product._id, productType: "menuItem" }] };
      if (resource === "/pos/shifts/current") payload = { success: true, data: shift?.isOpen ? shiftSummary() : null, config: { enabled: true } };
      if (resource === "/pos/shifts/open") { shift = { _id: "666666666666666666666666", cashier: actor, terminal: terminal.code, openedAt: new Date().toISOString(), openingCashHalala: 5000, isOpen: true, status: "open" }; payload.data = shiftSummary(); }
      if (resource.endsWith("/cash-movements")) { cashKeys.push(body.idempotencyKey); expectedCash += body.amount; }
      if (resource.endsWith("/close")) { shift = { ...shift, isOpen: false, status: "closed", closedAt: new Date().toISOString(), countedCashHalala: 6000, differenceHalala: 0 }; payload.data = shift; }
      if (/^\/pos\/shifts\/[0-9a-f]{24}$/.test(resource)) payload.data = shiftSummary();
      if (resource === "/settings/public") payload.data = { orders: { channels: { pos: true }, deliveryFee: 10 }, posCheckout: { discountsEnabled: true, cashierMaxAmount: 50, cashierMaxPercentage: 10, managerApprovalThreshold: 50 }, receipt: {} };
      if (resource === "/pos/coupons/validate") payload.data = { discountAmount: 5, code: "SMOKE5" };
      if (resource === "/pos/held-sales" && body) {
        draft = { ...body, _id: "444444444444444444444444", revision: 0, status: "working", items: body.items.map(line => ({ ...line, name: product.name, image: product.image, price: product.price })) };
        payload.data = draft;
      }
      if (resource.startsWith("/pos/held-sales/")) {
        if (body) draft = { ...draft, ...body, items: (body.items || draft.items).map(line => ({ ...line, name: product.name, image: product.image, price: product.price })), revision: draft.revision + 1 };
        payload.data = draft;
      }
      if (resource === "/pos/sales" && body) {
        if (captured) assert.deepEqual(body, captured, "Recovery must retry exact saved sale details");
        captured = body; fixtureSale = { ...fixtureSale, orderType: body.orderType, orderOrigin: body.orderOrigin, totalAmount: 45, subtotal: 40, discountAmount: 5, deliveryFee: 10, couponCode: body.couponCode, customer: body.customer };
        if (!lostCaptureResponse) { lostCaptureResponse = true; return route.abort("failed"); }
        payload = { success: true, data: fixtureSale, duplicate: true };
      }
      if (resource === "/pos/sales" && !body) { queries.push(url.searchParams); const empty = url.searchParams.get("search") === "TEST-ORDER"; payload = { success: true, data: empty ? [] : [fixtureSale], pagination: { total: empty ? 0 : 1, page: Number(url.searchParams.get("page") || 1), pages: empty ? 0 : 1 } }; }
      if (resource === `/pos/sales/${saleId}`) payload = { success: true, data: fixtureSale, refunds: { completedRefundAmount: refundRows.some(row => row.status === "completed") ? 20 : 0, remainingRefundableAmount: refundRows.length ? 20 : 40, refunds: refundRows } };
      if (resource === `/pos/sales/${saleId}/reprint`) payload.data = { ...fixtureSale, isReprint: true };
      if (resource === `/pos/sales/${saleId}/refunds`) { assert.equal(body.restock, false); refundRows.push({ ...body, _id: "777777777777777777777777", status: "requested", createdAt: new Date().toISOString() }); }
      if (resource.endsWith("/approve")) refundRows[0].status = "approved";
      if (resource.endsWith("/complete")) { refundRows[0].status = "completed"; fixtureSale = { ...fixtureSale, paymentStatus: "partially_refunded", refundedAmount: 20 }; }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
    });
    const destination = process.env.POS_SMOKE_URL || "http://localhost:3008/pos";
    await setFixtureSession(context, new URL(destination).origin, actor.role);
    await page.goto(destination);
    await page.getByRole("combobox").filter({ hasText: "Select terminal" }).click();
    await page.getByRole("option", { name: "Counter One · COUNTER-1" }).click();
    await page.getByRole("button", { name: "Open Shift", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "POS shift management" });
    await drawer.getByLabel("Opening cash (SAR)").fill("50");
    await drawer.getByRole("button", { name: "Open Shift", exact: true }).click();
    for (let index = 0; index < 2; index++) {
      await drawer.getByLabel("Cash movement amount").fill("5"); await drawer.getByLabel("Cash movement reason").fill("Float");
      await drawer.getByRole("button", { name: "Record Movement" }).click();
      await drawer.getByLabel("Cash movement amount").waitFor();
      await page.waitForFunction(() => document.querySelector('[aria-label="Cash movement amount"]').value === "");
    }
    assert.equal(cashKeys.length, 2); assert.notEqual(cashKeys[0], cashKeys[1], "Separate identical cash entries need distinct request keys");
    await drawer.getByPlaceholder("Counted cash SAR").fill("60"); await drawer.getByRole("button", { name: "Close Shift", exact: true }).click();
    await drawer.getByText("Shift closing summary", { exact: true }).waitFor();
    await drawer.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: /Test Burger/ }).filter({ has: page.getByRole("heading", { name: "Test Burger" }) }).click();
    const quantitySaved = page.waitForResponse(response => response.url().includes("/pos/held-sales") && ["POST", "PATCH"].includes(response.request().method()) && response.request().postDataJSON()?.items?.[0]?.quantity === 2);
    await page.getByRole("button", { name: "Increase Test Burger", exact: true }).click();
    await quantitySaved;
    await page.waitForFunction(() => Boolean(localStorage.getItem("dg_pos_working_sale:111111111111111111111111:COUNTER-1")));
    assert.equal(draft.items[0].quantity, 2);
    await page.clock.install(); await page.clock.fastForward(61_000);
    await page.getByRole("heading", { name: "POS locked" }).waitFor();
    assert.equal(draft.items[0].quantity, 2, "Auto-lock must preserve the saved sale");
    await page.getByLabel("POS PIN", { exact: true }).fill("654321"); await page.getByRole("button", { name: "Unlock POS", exact: true }).click();
    await page.getByText("2 items", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: "Favourites", exact: true }).click(); assert.equal(await page.getByRole("heading", { name: "Test Burger" }).count(), 1);
    await page.getByRole("button", { name: "Shortcuts · F1" }).click(); await page.getByRole("dialog", { name: "Keyboard Shortcuts" }).waitFor();
    await page.getByRole("button", { name: "Close shortcut help" }).click();
    await page.getByRole("button", { name: "Recent POS Sales", exact: true }).click();
    const searchResponse = page.waitForResponse(response => response.url().includes("/pos/sales?") && response.url().includes("TEST-ORDER"));
    await page.getByPlaceholder("Search sale…").fill("TEST-ORDER");
    await page.clock.runFor(400);
    await searchResponse;
    assert.ok(queries.some(query => query.get("search") === "TEST-ORDER"), "History search must be sent to the server");
    const clearSearchResponse = page.waitForResponse(response => response.url().includes("/pos/sales?") && !response.url().includes("TEST-ORDER"));
    await page.getByPlaceholder("Search sale…").fill(""); await page.clock.runFor(400); await clearSearchResponse;
    await page.getByRole("button", { name: "Details", exact: true }).click();
    const details = page.getByRole("dialog", { name: "Sale #SMOKE-1001" });
    await details.getByRole("button", { name: "Receipt reprint" }).click();
    const receipt = page.getByRole("dialog", { name: "POS receipt" }); await receipt.getByText("REPRINT / DUPLICATE", { exact: true }).waitFor();
    assert.ok(Number(await receipt.evaluate(node => getComputedStyle(node.parentElement).zIndex)) > Number(await details.evaluate(node => getComputedStyle(node.parentElement).zIndex)), "Reprint must appear above sale details");
    await receipt.getByRole("button", { name: "Close receipt" }).click();
    assert.equal(await details.getByRole("checkbox", { name: /For void only/ }).isChecked(), false);
    await details.getByLabel("Reason", { exact: true }).fill("Returned item"); await details.getByLabel("Refund amount (SAR)").fill("20");
    await details.getByRole("button", { name: "Request refund", exact: true }).click();
    await details.getByRole("button", { name: "Approve", exact: true }).click();
    await details.getByRole("button", { name: "Record completed payment", exact: true }).click();
    await details.getByText(/cash · completed/).waitFor();
    await details.getByRole("button", { name: "Close sale details" }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Workspace must not overflow horizontally");
    await page.getByRole("button", { name: "Lock", exact: true }).click(); await page.reload();
    await page.getByRole("heading", { name: "POS locked" }).waitFor();
    await page.getByLabel("POS PIN", { exact: true }).fill("654321"); await page.getByRole("button", { name: "Unlock POS", exact: true }).click();
    await page.getByText("2 items", { exact: true }).first().waitFor();
    const display = await context.newPage(); const displayHref = await page.getByRole("link", { name: /Customer Display/ }).getAttribute("href");
    await page.clock.resume();
    await display.goto(new URL(displayHref, page.url()).href);
    try { await display.getByText("Test Burger", { exact: true }).waitFor(); }
    catch (error) { console.error("Display diagnostics", await display.locator("body").innerText()); throw error; }
    await page.getByLabel("Order origin").selectOption("phone"); await page.getByLabel("Phone", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Delivery", exact: true }).click();
    await page.getByLabel("Pickup name").fill("Phone Fixture"); await page.getByLabel("Phone", { exact: true }).fill("0500000000"); await page.getByLabel("Delivery address").fill("Owned fixture address");
    await page.getByLabel("POS coupon").fill("SMOKE5"); await page.getByRole("button", { name: "Validate coupon", exact: true }).click();
    await page.getByText("Coupon validated for this cart", { exact: true }).waitFor();
    await display.getByText("Delivery charge", { exact: true }).waitFor();
    await page.getByLabel("Received amount").fill("50"); await page.getByRole("button", { name: "Complete Sale", exact: true }).click();
    await page.getByRole("button", { name: "Retry original sale / recover receipt", exact: true }).click();
    const recoveredReceipt = page.getByRole("dialog", { name: "POS receipt" }); await recoveredReceipt.waitFor();
    assert.equal(captured.orderOrigin, "phone"); assert.equal(captured.orderType, "delivery"); assert.equal(captured.couponCode, "SMOKE5"); assert.equal(captured.customer.address, "Owned fixture address");
    await recoveredReceipt.getByRole("button", { name: "Close receipt", exact: true }).click(); await display.close();
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log(`PASS ${viewport.width}×${viewport.height}: terminal, shift/cash/close, cart, auto-lock, PIN, refresh recovery, favourites, shortcuts, server history, receipt layering, manual refund, safe restock defaults, responsive overflow`);
    await context.close();
  }
} finally { await browser.close(); }
