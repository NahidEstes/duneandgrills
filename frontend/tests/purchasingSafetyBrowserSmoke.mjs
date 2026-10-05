import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

// Every API request is mocked: no database, inventory, invoices or payments are touched.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const origin = process.env.PURCHASING_SMOKE_URL || "http://localhost:3008";
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }); const page = await context.newPage(); const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const actor = { _id: "111111111111111111111111", name: "Mock Manager", role: "manager" };
    const supplier = { _id: "222222222222222222222222", name: "Test Supplier" };
    const milk = { _id: "333333333333333333333333", name: "Milk", sku: "MILK", unit: "L", tracksExpiry: true };
    const bread = { _id: "444444444444444444444444", name: "Bread", sku: "BREAD", unit: "pcs", tracksExpiry: false };
    const po = { _id: "555555555555555555555555", orderNumber: "PO-TEST-0001", supplier, status: "ordered", revision: 1, total: 80, createdAt: "2026-10-05", items: [
      { _id: "666666666666666666666666", item: milk, itemName: "Milk", sku: "MILK", quantity: 5, receivedQuantity: 0, purchaseUnit: "carton", baseUnit: "L", conversionFactor: 12, unitCost: 10, requestedBrand: "Requested Milk" },
      { _id: "777777777777777777777777", item: bread, itemName: "Bread", sku: "BREAD", quantity: 3, receivedQuantity: 0, purchaseUnit: "pack", baseUnit: "pcs", conversionFactor: 10, unitCost: 10 },
    ] };
    const pagination = { page: 1, pages: 1, total: 1 }; let receiptPayload; let receiptRequests = 0; let savedInvoice = null; const transitionRequests = [];
    await context.route("**/api/**", async route => {
      const request = route.request(); const url = new URL(request.url()); const resource = url.pathname.replace(/^\/api/, ""); let payload = { success: true, data: [] }; let status = 200;
      if (resource === "/auth/me") payload = { user: actor };
      else if (resource === "/cart") payload.data = { items: [], coupon: null };
      else if (resource === "/settings/public") payload.data = { procurement: { overReceiveTolerancePercent: 10 } };
      else if (resource === "/inventory/suppliers") payload.data = [supplier];
      else if (resource === "/inventory/items") payload = { success: true, data: [milk, bread], pagination };
      else if (resource === "/inventory/purchase-orders") payload = { success: true, data: [po], pagination };
      else if (resource.endsWith("/receive")) {
        receiptRequests += 1; const body = request.postDataJSON();
        assert.equal(body.items.length, 1); assert.equal(body.items[0].lineId, po.items[0]._id); assert.equal(body.items[0].quantity, 2); assert.equal(body.items[0].brand, "Actual Milk"); assert.equal(body.items[0].lotNumber, "ACTUAL-LOT");
        if (receiptRequests === 1) { receiptPayload = body; po.items[0].receivedQuantity = 2; po.status = "partially_received"; status = 503; payload = { message: "Simulated response lost after commit" }; }
        else { assert.deepEqual(body, receiptPayload); payload.data = { order: po, duplicate: true, movements: [] }; }
      } else if (resource === "/inventory/supplier-invoices/billable-quantities") {
        if (url.searchParams.get("excludeInvoiceId")) assert.equal(url.searchParams.get("excludeInvoiceId"), savedInvoice._id);
        payload.data = po.items.map((row, index) => ({ purchaseOrder: po._id, purchaseOrderLine: row._id, itemName: row.itemName, receivedQuantity: row.quantity, committedQuantity: index === 0 ? 2 : 1, remainingBillableQuantity: index === 0 ? 3 : 2, maximumBillableQuantity: index === 0 ? 3.5 : 2.3 }));
      } else if (resource === "/inventory/supplier-invoices" && request.method() === "POST") {
        const body = request.postDataJSON(); assert.equal(body.items.length, 1); assert.equal(body.items[0].purchaseOrderLine, po.items[0]._id); assert.equal(body.items[0].quantity, 1);
        savedInvoice = { ...body, _id: "888888888888888888888888", supplier, internalReference: "SIN-TEST-0001", purchaseOrders: [po], items: body.items.map(row => ({ ...row, _id: "999999999999999999999999", item: milk, unit: "carton", lineTotal: 10 })), total: 10, outstandingAmount: 10, status: "draft", paymentStatus: "unpaid", displayPaymentStatus: "unpaid", matchSummary: { mismatches: 1, messages: ["Review exception"] } }; payload.data = savedInvoice;
      } else if (resource.endsWith("/status") && resource.includes("supplier-invoices")) {
        const body = request.postDataJSON(); assert.ok(body.reason.trim()); transitionRequests.push(body.status);
        savedInvoice.status = body.status === "submitted" ? "review_required" : body.status; payload.data = savedInvoice;
      } else if (resource === "/inventory/supplier-invoices") payload = { success: true, data: savedInvoice ? [savedInvoice] : [], pagination, aging: {} };
      else if (resource === `/inventory/supplier-invoices/${savedInvoice?._id}` && request.method() === "PATCH") {
        const body = request.postDataJSON(); assert.equal(body.items[0].quantity, 1); savedInvoice.status = "draft"; payload.data = savedInvoice;
      }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
    });
    await page.goto(`${origin}/inventory/purchase-orders`);
    await page.getByRole("button", { name: "Receive", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^MilkOrdered/).check();
    await dialog.getByLabel(/^Receive quantity/).fill("2");
    await dialog.getByLabel(/^Actual Brand/).fill("Actual Milk");
    await dialog.getByLabel(/^Batch \/ Lot number/).fill("actual-lot");
    await dialog.getByRole("button", { name: "Receive selected items" }).click();
    await dialog.getByRole("alert").filter({ hasText: "Simulated response lost" }).waitFor();
    assert.equal(await dialog.getByLabel(/^Receive quantity/).isDisabled(), true);
    await page.reload(); await page.getByRole("button", { name: "Receive", exact: true }).click();
    dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: "Retry original receipt" }).click();
    await dialog.waitFor({ state: "hidden" }); assert.equal(receiptRequests, 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

    po.status = "received"; po.items[0].receivedQuantity = 5; po.items[1].receivedQuantity = 3;
    await page.goto(`${origin}/inventory/supplier-invoices`);
    await page.getByRole("button", { name: "Add invoice", exact: true }).click(); dialog = page.getByRole("dialog");
    await dialog.getByLabel("Supplier invoice number", { exact: true }).fill("PARTIAL-001");
    await dialog.getByRole("combobox").nth(0).click(); await page.getByRole("option", { name: "Test Supplier", exact: true }).click();
    await dialog.getByRole("combobox").nth(1).click(); await page.getByRole("option", { name: /PO-TEST-0001/ }).click();
    await dialog.getByText(/Received 5 · Other invoices 2 · Remaining billable 3/).waitFor();
    await dialog.getByRole("button", { name: "Remove Bread from invoice" }).click(); await dialog.getByLabel("Invoice qty", { exact: true }).fill("1");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await dialog.getByRole("button", { name: "Create invoice", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
    await page.getByTitle("Edit draft", { exact: true }).click(); dialog = page.getByRole("dialog");
    await dialog.getByText(/Remaining billable 3/).waitFor(); assert.equal(await dialog.getByLabel("Invoice qty", { exact: true }).inputValue(), "1");
    await dialog.getByRole("button", { name: "Save invoice draft" }).click(); await dialog.waitFor({ state: "hidden" });
    page.on("dialog", async prompt => prompt.accept("Manager reviewed exception"));
    for (const title of ["Submit", "Approve", "Post"]) { await page.getByTitle(title, { exact: true }).click(); }
    await page.getByTitle("Void and release billable reservation", { exact: true }).waitFor();
    assert.deepEqual(transitionRequests, ["submitted", "approved", "posted"]);
    assert.deepEqual(errors, []);
    console.log(`PASS partial receiving / ambiguous retry + refresh / invoice partial lines + self-exclusion / review reasons (${viewport.width}px)`);
    await context.close();
  }
} finally { await browser.close(); }
