import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { serializeDelivery } from "../../backend/services/deliveryContractService.js";
import { resolveOrderTransition } from "../../backend/config/orderContract.js";

// Owned loopback fixtures only. Real serializer/transition rules; no .env,
// Mongo connection, production settings, real accounts or external delivery API.
const rider = "111111111111111111111111", other = "999999999999999999999999";
const user = { _id: rider, name: "Local pickup rider", role: "rider" };
const make = (deliveryStatus = "assigned", restaurantStatus = "ready", extra = {}) => ({
  delivery: { _id: "local-pickup", rider, status: deliveryStatus, revision: 2, pickupInstructions: "Fixture pickup counter · ask staff for the order number", deliveryNote: "Fixture door note", cashReport: { status: "none" }, ...extra.delivery },
  order: { _id: "222222222222222222222222", orderNumber: "TEST-PICKUP-042", __v: 4, source: "website", deliveryMode: "restaurant", orderType: "delivery", inventoryStatus: "not_required", status: restaurantStatus, paymentStatus: "pending", totalAmount: 42,
    customer: { name: "Fixture customer", phone: "+0000000000", address: "Fixture delivery address" },
    items: [{ name: "Fixture burger", quantity: 2, price: 15, selectedAddOns: [{ name: "Fixture cheese", quantity: 1 }], spiceLevel: "Medium", itemNote: "Fixture item note" }, { name: "Fixture fries", quantity: 1, price: 12 }], ...extra.order }, mode: extra.mode || "operational",
});
let model = make(), failRead = false, failNext = 0, hold = false, release, conflict = false, readDelay = 0, loseCashResponse = false;
const requests = [], committed = new Map();
const waitForPosts = async count => {
  for (let n = 0; n < 120 && requests.filter(row => row.method === "POST").length < count; n++) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(requests.filter(row => row.method === "POST").length, count);
};
const fixture = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1"), role = /dg_session=([^;]+)/.exec(req.headers.cookie || "")?.[1];
  const request = { method: req.method, path: url.pathname }; requests.push(request);
  let status = 200, body;
  if (!role) { status = 401; body = { success: false }; }
  else if (url.pathname === "/api/auth/session") body = { success: true, user: { ...user, role } };
  else if (url.pathname === "/api/rider/workflow/deliveries/local-pickup" || url.pathname === "/api/rider/preview/deliveries/local-pickup") {
    if (failRead) { status = 503; body = { success: false, message: "Isolated details read failure" }; }
    else {
      const mode = url.pathname.includes("/preview/") ? "preview" : model.mode;
      body = { success: true, mode, operationalEnabled: mode === "operational", data: { ...serializeDelivery(model.delivery, model.order, null, { detail: true }), restaurantContact: { phone: "+0000000001" } } };
    }
  } else if (req.method === "POST" && url.pathname.startsWith("/api/rider/workflow/deliveries/local-pickup/")) {
    let raw = ""; for await (const chunk of req) raw += chunk;
    request.body = JSON.parse(raw); const action = url.pathname.split("/").at(-1), payload = request.body;
    if (hold) await new Promise(resolve => { release = resolve; });
    try {
      assert.equal(role, "rider"); assert.equal(model.delivery.rider, rider); assert.ok(payload.idempotencyKey.length >= 16);
      if (committed.has(payload.idempotencyKey)) body = { ...committed.get(payload.idempotencyKey), duplicate: true };
      else if (failNext) { status = failNext; failNext = 0; body = { success: false, message: "Isolated pickup server failure" }; }
      else if (conflict || payload.expectedRevision !== model.delivery.revision || payload.expectedOrderRevision !== model.order.__v) {
        conflict = false; model.order.__v++; status = 409; body = { success: false, message: "Order changed; review current delivery before acting" };
      } else {
        if (action === "pickup" || action === "deliver") {
          assert.equal(model.delivery.status, action === "pickup" ? "assigned" : "picked_up");
          const next = action === "pickup" ? "out-for-delivery" : "delivered";
          resolveOrderTransition(model.order, next, "rider"); model.order.status = next; model.order.__v++;
          model.delivery.status = action === "pickup" ? "picked_up" : "delivered";
          model.delivery[action === "pickup" ? "pickedUpAt" : "deliveredAt"] = new Date().toISOString();
        } else if (action === "issue") {
          model.delivery.issue = { reason: payload.reason, previousStatus: model.delivery.status }; model.delivery.status = "issue"; model.order.__v++;
        } else if (action === "report_cash") {
          assert.equal(model.delivery.status, "delivered"); assert.equal(model.delivery.cashReport.status, "none");
          assert.match(payload.amount, /^\d+(\.\d{1,2})?$/);
          const amountHalala = Math.round(Number(payload.amount) * 100), balance = Math.round(model.order.totalAmount * 100);
          assert.ok(amountHalala <= balance); if (amountHalala < balance) assert.ok(payload.reason.trim());
          model.delivery.cashReport = { status: amountHalala < balance ? "discrepancy" : "unconfirmed", amountHalala, reportedAt: new Date().toISOString() }; model.order.__v++;
        } else throw new Error("Unexpected action");
        model.delivery.revision++;
        body = { success: true, id: "local-pickup", revision: model.delivery.revision, status: model.delivery.status };
        committed.set(payload.idempotencyKey, body);
        if (action === "report_cash" && loseCashResponse) { loseCashResponse = false; status = 503; body = { success: false, message: "Isolated cash response lost after commit" }; }
      }
    } catch (error) { status = 409; body = { success: false, message: error.message }; }
  } else { status = 404; body = { success: false, message: "Unexpected fixture endpoint" }; }
  if (readDelay && req.method === "GET" && url.pathname.includes("/deliveries/")) await new Promise(resolve => setTimeout(resolve, readDelay));
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "private, no-store" }); res.end(JSON.stringify(body));
});
await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
const probe = createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: path.resolve(import.meta.dirname, ".."), windowsHide: true, env: { ...process.env, NODE_ENV: "production", SITE_URL: origin, BACKEND_API_URL: `http://127.0.0.1:${fixture.address().port}/api` }, stdio: ["ignore", "pipe", "pipe"],
});
let output = "", browser; next.stdout.on("data", data => { output += data; }); next.stderr.on("data", data => { output += data; });
try {
  for (let n = 0; n < 120; n++) { try { await fetch(origin + "/rider", { redirect: "manual" }); break; } catch { if (next.exitCode != null || n === 119) throw new Error(output.slice(-2000)); await new Promise(resolve => setTimeout(resolve, 250)); } }
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const screenshots = await mkdtemp(path.join(tmpdir(), "dg-rider-flow-phase3-"));
  for (const viewport of [{ width: 320, height: 760 }, { width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 1000 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block" });
    await context.addCookies([{ name: "dg_session", value: "rider", url: origin }, { name: "dg_csrf", value: "local-csrf", url: origin }]);
    await context.addInitScript({ path: path.resolve(import.meta.dirname, "../node_modules/axe-core/axe.min.js") });
    const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
    const load = async (value, suffix = "", delayMs = 0) => { model = value; failRead = false; readDelay = delayMs; conflict = false; failNext = 0; hold = false; loseCashResponse = false; committed.clear(); await page.goto(origin + "/rider/deliveries/local-pickup" + suffix); await page.getByRole("heading", { name: value.delivery.rider === rider ? model.order.orderNumber : "Delivery unavailable", exact: true }).waitFor(); readDelay = 0; };
    const pickup = () => page.getByRole("button", { name: "Confirm Pickup", exact: true });
    const dialog = () => page.getByRole("dialog", { name: "Confirm pickup", exact: true });
    const yes = () => dialog().getByRole("button", { name: "Yes, confirm pickup", exact: true });
    const stage = label => page.getByRole("list", { name: "Delivery progress" }).getByText(label, { exact: true });
    const layout = async () => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.evaluate(() => [...document.querySelectorAll("dialog[open]")].every(node => { const r = node.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; })), true);
      const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(row => ({ id: row.id, nodes: row.nodes.map(node => node.target) }))); assert.deepEqual(violations, []);
      if (!await page.locator("dialog[open]").count()) {
        await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
        assert.equal(await page.getByRole("button", { name: "Refresh details", exact: true }).evaluate(node => node.getBoundingClientRect().bottom <= document.querySelector('nav[aria-label="Rider navigation"]').getBoundingClientRect().top), true);
        await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      }
    };
    const loading = load(make(), "", 650);
    await page.getByRole("status").filter({ hasText: "Loading delivery details" }).waitFor();
    assert.equal(await pickup().count(), 0); await loading;
    await page.getByRole("heading", { name: "Food ready for pickup", exact: true }).waitFor();
    assert.equal(await pickup().isDisabled(), false);
    assert.equal(await page.getByRole("link", { name: "Call Customer", exact: true }).getAttribute("href"), "tel:+0000000000");
    assert.match(await page.getByRole("link", { name: "Open Map", exact: true }).getAttribute("href"), /^https:\/\/www\.google\.com\/maps\/search\//);
    await page.getByText("1 × Fixture cheese", { exact: true }).waitFor(); await page.getByText("Spice: Medium", { exact: true }).waitFor(); await page.getByText("Note: Fixture item note", { exact: true }).waitFor();
    await layout(); await page.screenshot({ path: path.join(screenshots, `details-ready-${viewport.width}.png`), fullPage: true });
    await pickup().click(); await dialog().waitFor();
    await dialog().getByRole("heading", { name: "Have you received this order from the restaurant?", exact: true }).waitFor();
    await dialog().getByText("Confirm only after collecting the food.", { exact: true }).waitFor();
    for (let n = 0; n < 10; n++) { await page.keyboard.press("Tab"); assert.equal(await page.evaluate(() => document.querySelector("dialog[open]").contains(document.activeElement)), true); }
    await layout(); await page.screenshot({ path: path.join(screenshots, `pickup-dialog-${viewport.width}.png`), fullPage: false });
    await page.keyboard.press("Escape"); assert.equal(await pickup().evaluate(node => node === document.activeElement), true);
    await context.setOffline(true); await page.getByRole("alert").filter({ hasText: "Offline — no actions" }).waitFor(); assert.equal(await pickup().isDisabled(), true);
    await context.setOffline(false); await page.getByRole("alert").filter({ hasText: "Offline — no actions" }).waitFor({ state: "detached" });
    await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(node => node.textContent === "Confirm Pickup")?.disabled);
    failRead = true; await page.getByRole("button", { name: "Refresh details", exact: true }).click(); await page.getByRole("alert").filter({ hasText: "Retained details" }).waitFor(); assert.equal(await pickup().isDisabled(), true);
    failRead = false; await page.getByRole("button", { name: "Refresh details", exact: true }).click(); await page.getByRole("alert").filter({ hasText: "Retained details" }).waitFor({ state: "detached" });
    for (const restaurantStatus of ["pending", "confirmed", "preparing", "out-for-delivery"]) { await load(make("assigned", restaurantStatus)); assert.equal(await pickup().isDisabled(), true); }
    model.order.status = "ready"; model.order.__v++;
    await page.getByRole("button", { name: "Refresh details", exact: true }).click(); await page.getByRole("heading", { name: "Food ready for pickup", exact: true }).waitFor(); assert.equal(await pickup().isDisabled(), false);
    // Poll updates the open dialog. A kitchen change without a legacy revision
    // change must still invalidate the reviewed fingerprint, never auto-retry.
    await page.clock.install(); await pickup().click(); await dialog().waitFor();
    const before = requests.filter(row => row.method === "POST").length;
    model.order.status = "preparing";
    const poll = page.waitForResponse(response => response.url().includes("/api/rider/workflow/deliveries/local-pickup") && response.request().method() === "GET");
    await page.clock.fastForward(31_000); await poll;
    await dialog().getByRole("alert").filter({ hasText: "Delivery/payment state changed" }).waitFor(); assert.equal(await yes().isDisabled(), true); assert.equal(requests.filter(row => row.method === "POST").length, before);
    await dialog().getByRole("button", { name: "Go back", exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement.hasAttribute("data-rider-return-focus")), true); await page.clock.resume();
    await load(make()); await pickup().click(); conflict = true; await yes().click();
    await dialog().getByRole("alert").filter({ hasText: "Delivery/payment state changed" }).waitFor(); assert.equal(await yes().isDisabled(), true);
    await dialog().getByRole("button", { name: "Go back", exact: true }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(node => node.textContent === "Confirm Pickup")?.disabled);
    await pickup().click(); failNext = 500; await yes().click();
    await dialog().getByRole("alert").filter({ hasText: "Isolated pickup server failure" }).waitFor();
    const original = requests.filter(row => row.method === "POST").at(-1).body;
    hold = true; const pickupBefore = requests.filter(row => row.method === "POST").length; await yes().evaluate(node => { node.click(); node.click(); });
    await dialog().getByRole("status").filter({ hasText: "Waiting for server confirmation" }).waitFor();
    await waitForPosts(pickupBefore + 1);
    assert.equal(await stage("Assigned").evaluate(node => node.getAttribute("aria-current")), "step");
    assert.equal(await dialog().getByRole("button", { name: "Go back", exact: true }).isDisabled(), true);
    assert.deepEqual(requests.filter(row => row.method === "POST").at(-1).body, original);
    hold = false; release(); await page.getByRole("button", { name: "Confirm Delivery", exact: true }).waitFor();
    assert.equal(await pickup().count(), 0); assert.equal(await stage("Picked up").evaluate(node => node.getAttribute("aria-current")), "step");
    assert.equal(model.order.status, "out-for-delivery"); assert.equal(model.order.paymentStatus, "pending");
    assert.equal(requests.filter(row => row.method === "POST" && row.body.idempotencyKey === original.idempotencyKey).length, 2, "one failed request plus one bounded explicit retry");
    await layout();
    await load(make("picked_up", "out-for-delivery")); assert.equal(await pickup().count(), 0); await page.getByRole("button", { name: "Confirm Delivery", exact: true }).waitFor();
    await page.getByLabel("Delivery issue reason", { exact: false }).fill("Fixture road issue"); await page.getByRole("button", { name: "Report Delivery Issue", exact: true }).click();
    const issueDialog = page.getByRole("dialog", { name: "Report delivery issue", exact: true });
    await issueDialog.getByText("Explanation: Fixture road issue", { exact: true }).waitFor();
    await issueDialog.getByRole("button", { name: "Yes, report delivery issue", exact: true }).click();
    await page.getByRole("heading", { name: /Delivery Issue · Awaiting manager review/ }).waitFor(); assert.equal(model.delivery.status, "issue"); assert.equal(await page.getByRole("button", { name: "Confirm Delivery", exact: true }).count(), 0);
    await load(make("picked_up", "out-for-delivery", { order: { inventoryStatus: "restored" } }));
    assert.equal(await page.getByRole("button", { name: "Confirm Delivery", exact: true }).isDisabled(), true);
    await page.getByText("Order stock has been restored", { exact: false }).first().waitFor();
    await load(make("picked_up", "out-for-delivery")); await page.getByRole("button", { name: "Confirm Delivery", exact: true }).click();
    const completeDialog = page.getByRole("dialog", { name: "Confirm delivery", exact: true });
    await completeDialog.getByRole("heading", { name: "Has the customer received this order?", exact: true }).waitFor();
    await layout(); await page.screenshot({ path: path.join(screenshots, `delivery-dialog-${viewport.width}.png`) });
    await completeDialog.getByRole("button", { name: "Yes, confirm delivery", exact: true }).click();
    await page.getByLabel("Cash actually collected (SAR)").waitFor();
    assert.equal(await page.getByText("Fixture customer", { exact: true }).count(), 0); assert.equal(await page.getByText("Fixture delivery address", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Note: Fixture item note", { exact: true }).count(), 0); assert.equal(await page.getByRole("link", { name: "Call Customer", exact: true }).count(), 0);
    await page.getByRole("heading", { name: "Delivery completed", exact: true }).waitFor();
    await page.getByText("Completed at", { exact: false }).waitFor();
    await layout(); await page.screenshot({ path: path.join(screenshots, `cash-pending-${viewport.width}.png`), fullPage: true });
    const cashInput = page.getByLabel("Cash actually collected (SAR)"), cashButton = page.getByRole("button", { name: "Report cash collected", exact: true });
    for (const amount of ["", "-1", "42.001", "43", "1e1"]) { await cashInput.fill(amount); assert.equal(await cashButton.isDisabled(), true); }
    await cashInput.fill("0"); assert.equal(await cashButton.isDisabled(), true);
    await page.getByLabel("Shortage / discrepancy explanation", { exact: false }).fill("Fixture zero collection"); assert.equal(await cashButton.isDisabled(), false);
    await page.getByLabel("Shortage / discrepancy explanation", { exact: false }).fill("");
    await cashInput.fill("42.00"); await cashButton.click();
    const cashDialog = page.getByRole("dialog", { name: "Confirm cash report", exact: true }), cashYes = cashDialog.getByRole("button", { name: "Yes, report cash collected", exact: true });
    await cashDialog.getByRole("heading", { name: "Report 42.00 SAR collected?", exact: true }).waitFor();
    await layout(); await page.screenshot({ path: path.join(screenshots, `cash-dialog-${viewport.width}.png`) });
    loseCashResponse = true; await cashYes.click(); await cashDialog.getByRole("alert").filter({ hasText: "Isolated cash response lost after commit" }).waitFor();
    assert.equal(model.delivery.cashReport.status, "unconfirmed");
    assert.equal(await page.getByRole("heading", { name: "Reported · Awaiting cashier confirmation", exact: true }).count(), 0);
    const cashOriginal = requests.filter(row => row.method === "POST").at(-1).body;
    hold = true; const cashBefore = requests.filter(row => row.method === "POST").length; await cashYes.evaluate(node => { node.click(); node.click(); });
    await cashDialog.getByRole("status").waitFor();
    await waitForPosts(cashBefore + 1);
    assert.equal(await page.getByRole("heading", { name: "Reported · Awaiting cashier confirmation", exact: true }).count(), 0);
    assert.deepEqual(requests.filter(row => row.method === "POST").at(-1).body, cashOriginal);
    hold = false; release(); await page.getByRole("heading", { name: "Reported · Awaiting cashier confirmation", exact: true }).waitFor();
    assert.equal(await cashInput.count(), 0); assert.equal(model.order.paymentStatus, "pending");
    assert.equal(requests.filter(row => row.method === "POST" && row.body.idempotencyKey === cashOriginal.idempotencyKey).length, 2);
    await layout(); await page.screenshot({ path: path.join(screenshots, `cash-reported-${viewport.width}.png`), fullPage: true });
    // A cashier's subsequent server record changes the receipt and payment on refresh.
    // This fixture is not a real cashier transaction or Mongo payment integration.
    model.delivery.cashReport.status = "confirmed"; model.delivery.cashReport.confirmedAt = new Date().toISOString(); model.delivery.revision++; model.order.__v++; model.order.paymentStatus = "paid";
    await page.getByRole("button", { name: "Refresh details", exact: true }).click(); await page.getByRole("heading", { name: "Cashier confirmed", exact: true }).waitFor();
    await page.getByText("Payment: Paid", { exact: true }).first().waitFor(); assert.equal(await cashInput.count(), 0);
    await layout(); await page.screenshot({ path: path.join(screenshots, `cash-confirmed-${viewport.width}.png`), fullPage: true });
    for (const paymentStatus of ["paid", "partially_refunded", "refunded"]) {
      await load(make("delivered", "delivered", { order: { paymentStatus } })); assert.equal(await cashInput.count(), 0);
    }
    await load(make("delivered", "delivered", { order: { totalAmount: null } })); assert.equal(await cashInput.count(), 0); assert.equal(await page.getByText("0.00 SAR", { exact: true }).count(), 0);
    await load(make("delivered", "delivered", { order: { paymentRecords: [{ amount: 42 }] } })); assert.equal(await cashInput.count(), 0); assert.equal(await page.getByText("Payment: Paid", { exact: true }).count(), 0);
    await load(make("delivered", "delivered")); await cashInput.fill("32.10");
    await page.getByLabel("Shortage / discrepancy explanation", { exact: false }).fill("Fixture short collection"); await cashButton.click(); await cashYes.click();
    await page.getByRole("heading", { name: "Discrepancy · Requires review", exact: true }).waitFor(); assert.equal(await cashInput.count(), 0); assert.equal(model.order.paymentStatus, "pending");
    await page.getByText("A manager must review the shortage", { exact: false }).waitFor(); await layout();
    await page.screenshot({ path: path.join(screenshots, `cash-discrepancy-${viewport.width}.png`), fullPage: true });
    await load(make("delivered", "delivered")); await cashInput.fill("0"); await page.getByLabel("Shortage / discrepancy explanation", { exact: false }).fill("Fixture no cash received"); await cashButton.click(); await cashYes.click();
    await page.getByRole("heading", { name: "Discrepancy · Requires review", exact: true }).waitFor(); assert.equal(model.delivery.cashReport.amountHalala, 0); assert.equal(model.order.paymentStatus, "pending");
    await load(make("picked_up", "ready")); assert.equal(await page.getByRole("button", { name: "Confirm Delivery", exact: true }).isDisabled(), true);
    await load(make("picked_up", "out-for-delivery"));
    const deliveryButton = page.getByRole("button", { name: "Confirm Delivery", exact: true }), deliveryYes = completeDialog.getByRole("button", { name: "Yes, confirm delivery", exact: true });
    await layout(); await page.screenshot({ path: path.join(screenshots, `on-way-${viewport.width}.png`), fullPage: true });
    await context.setOffline(true); await page.getByRole("alert").filter({ hasText: "Offline — no actions" }).waitFor(); assert.equal(await deliveryButton.isDisabled(), true);
    await context.setOffline(false); await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(node => node.textContent === "Confirm Delivery")?.disabled);
    await deliveryButton.click(); conflict = true; await deliveryYes.click();
    await completeDialog.getByRole("alert").filter({ hasText: "Delivery/payment state changed" }).waitFor(); assert.equal(await deliveryYes.isDisabled(), true);
    await completeDialog.getByRole("button", { name: "Go back", exact: true }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(node => node.textContent === "Confirm Delivery")?.disabled);
    await deliveryButton.click(); hold = true; const deliverBefore = requests.filter(row => row.method === "POST").length;
    await deliveryYes.evaluate(node => { node.click(); node.click(); }); await completeDialog.getByRole("status").waitFor();
    assert.equal(model.delivery.status, "picked_up"); assert.equal(await page.getByRole("heading", { name: "Delivery completed", exact: true }).count(), 0);
    await waitForPosts(deliverBefore + 1);
    hold = false; release(); await page.getByRole("heading", { name: "Delivery completed", exact: true }).waitFor(); assert.equal(model.order.paymentStatus, "pending");
    await load(make("delivered", "delivered")); await cashInput.fill("42"); await cashButton.click(); conflict = true; await cashYes.click();
    await cashDialog.getByRole("alert").filter({ hasText: "Delivery/payment state changed" }).waitFor(); assert.equal(await cashYes.isDisabled(), true);
    await cashDialog.getByRole("button", { name: "Go back", exact: true }).click();
    await context.setOffline(true); await page.getByRole("alert").filter({ hasText: "Offline — no actions" }).waitFor(); assert.equal(await cashButton.isDisabled(), true);
    await context.setOffline(false); await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(node => node.textContent === "Report cash collected")?.disabled);
    failRead = true; await page.getByRole("button", { name: "Refresh details", exact: true }).click(); await page.getByRole("alert").filter({ hasText: "Retained details" }).waitFor(); assert.equal(await cashButton.isDisabled(), true);
    failRead = false; await page.getByRole("button", { name: "Refresh details", exact: true }).click(); await page.getByRole("alert").filter({ hasText: "Retained details" }).waitFor({ state: "detached" });
    assert.equal(await cashInput.inputValue(), "42");
    await load(make("delivered", "delivered"), "?preview=1"); await cashInput.fill("42"); assert.equal(await cashButton.isDisabled(), true);
    await load(make("assigned", "ready", { order: { totalAmount: null, customer: { phone: "+------", address: " " } } }));
    assert.equal(await page.getByRole("button", { name: "Call unavailable", exact: true }).isDisabled(), true); assert.equal(await page.getByRole("button", { name: "Map unavailable", exact: true }).isDisabled(), true);
    assert.equal(await page.getByText("0.00 SAR", { exact: true }).count(), 0); assert.equal(await page.getByText("Payment: Paid", { exact: true }).count(), 0);
    await load(make("assigned", "ready", { mode: "rehearsal" }), "?rehearsal=1"); assert.equal(await pickup().isDisabled(), false);
    await load(make(), "?preview=1"); assert.equal(await page.getByRole("button", { name: "Confirm Pickup · Preview Only", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("link", { name: "Open Map", exact: true }).count(), 0);
    await load(make("assigned", "ready", { delivery: { rider: other } })); await page.getByRole("heading", { name: "Delivery unavailable", exact: true }).waitFor(); assert.equal(await page.getByText("Fixture customer", { exact: true }).count(), 0);
    assert.deepEqual(errors, []); console.log(`PASS ${viewport.width}px: all three phases, owner/privacy, dialogs/focus/axe, offline/stale/polling, revisions/duplicate protection, delivery, cash/discrepancy and cashier receipt refresh`);
    await context.close();
  }
  assert.ok(requests.every(row => row.path === "/api/auth/session" || row.path.startsWith("/api/rider/workflow/deliveries/local-pickup") || row.path === "/api/rider/preview/deliveries/local-pickup"));
  console.log(`Screenshots: ${screenshots}`);
} finally {
  hold = false; release?.();
  await browser?.close();
  if (next.exitCode == null) { const stopped = new Promise(resolve => next.once("exit", resolve)); next.kill(); await stopped; }
  await new Promise(resolve => fixture.close(resolve));
}
