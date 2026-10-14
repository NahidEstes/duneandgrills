import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { serializeDelivery } from "../../backend/services/deliveryContractService.js";
import { buildRiderPortal } from "../../backend/services/riderPortalService.js";
import { startOfRiyadhDay, ADMIN_DAY_MS } from "../../backend/utils/adminDate.js";

// Only an owned loopback HTTP fixture. Never load .env, connect MongoDB, start
// server.js or enable restaurant delivery. Monetary/action details are unchanged.
const riderId = "111111111111111111111111", otherId = "999999999999999999999999";
const user = { _id: riderId, employeeId: "EMP-LOCAL", name: "Nadia Test", role: "rider", avatar: "/missing-avatar-fixture.png" };
const today = startOfRiyadhDay();
const sourceRows = [];
const rows = Array.from({ length: 35 }, (_, index) => {
  const completed = index >= 27, status = completed ? "delivered" : index === 26 ? "issue" : index >= 24 ? "picked_up" : "assigned";
  const restaurantStatus = completed ? "delivered" : index >= 24 ? "out-for-delivery" : index % 2 ? "preparing" : "ready";
  const delivery = { _id: String(1000 + index), rider: riderId, status, revision: 0, assignedAt: new Date(today.getTime() + 3600000),
    ...(completed ? { deliveredAt: new Date(today.getTime() + (index < 32 ? 2 * 3600000 : -ADMIN_DAY_MS)) } : {}),
    ...(status === "issue" ? { issue: { reason: "Fixture road obstruction", previousStatus: "picked_up" } } : {}), cashReport: { status: completed ? "unconfirmed" : "none", amountHalala: completed ? 4200 : null } };
  const order = { _id: String(2000 + index), orderNumber: `TEST-${String(index + 1).padStart(3, "0")}`, source: "website", orderType: "delivery", deliveryMode: "restaurant",
    status: restaurantStatus, inventoryStatus: "not_required", totalAmount: 42, paymentStatus: "pending", customer: { name: "Fixture recipient", address: "Fixture district · saved order address", phone: "PRIVATE-HISTORICAL-PHONE" }, items: [] };
  sourceRows.push({ delivery, order });
  return serializeDelivery(delivery, order);
});
const counts = { active: 27, assigned: 24, picked_up: 2, issue: 1, delivered: 8,
  deliveredToday: rows.filter(row => row.deliveryStatus === "delivered" && row.deliveredAt >= today && row.deliveredAt < new Date(today.getTime() + ADMIN_DAY_MS)).length };
let failReads = false, delay = 0, enabled = true, foreign = false, available = true, availabilityRevision = 0, assignments = 35;
const requests = [];
const fixture = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1"), role = /dg_session=([^;]+)/.exec(req.headers.cookie || "")?.[1];
  const record = { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams) }; requests.push(record);
  let status = 200, body;
  if (!role) { status = 401; body = { success: false }; }
  else if (url.pathname === "/api/auth/session") body = { success: true, user: { ...user, role } };
  else if (url.pathname === "/api/rider/workflow/availability" && req.method === "POST") {
    let raw = ""; for await (const chunk of req) raw += chunk;
    record.body = JSON.parse(raw); assert.equal(role, "rider");
    assert.deepEqual(Object.keys(record.body).sort(), ["available", "expectedRevision", "idempotencyKey"]);
    assert.equal(record.body.expectedRevision, availabilityRevision); assert.ok(record.body.idempotencyKey.length >= 16);
    available = record.body.available; availabilityRevision++;
    body = { success: true, available, revision: availabilityRevision };
  } else if (url.pathname.startsWith("/api/rider/workflow/deliveries/") && req.method === "GET") {
    const original = sourceRows.find(row => row.delivery._id === url.pathname.split("/").at(-1));
    if (!original) { status = 404; body = { success: false }; }
    else body = { success: true, mode: "operational", operationalEnabled: true, data: serializeDelivery(original.delivery, original.order, null, { detail: true }) };
  } else if (["/api/rider/portal", "/api/rider/preview"].includes(url.pathname)) {
    if (failReads) { status = 503; body = { success: false, message: "Isolated read failure" }; }
    else if (url.pathname.endsWith("preview") || !enabled) body = { success: true, ...buildRiderPortal({ ...user, role }, { preview: url.pathname.endsWith("preview"), config: { previewEnabled: true } }) };
    else {
      const history = url.searchParams.get("history") === "true", filter = url.searchParams.get("status") || "all", page = Number(url.searchParams.get("page") || 1), search = url.searchParams.get("search") || "";
      let list = rows.filter(row => history ? row.deliveryStatus === "delivered" : row.deliveryStatus !== "delivered");
      if (filter !== "all") list = list.filter(row => row.deliveryStatus === filter);
      if (search) list = list.filter(row => row.orderNumber.includes(search));
      const selected = list.slice((page - 1) * 20, page * 20);
      body = { success: true, mode: "operational", operationalEnabled: true, profile: { id: riderId, ...user }, availability: available, availabilityRevision, counts,
        assignmentCount: assignments, deliveries: foreign ? [{ ...rows[0], riderId: otherId, customerName: "FOREIGN RECIPIENT" }] : selected,
        pagination: { total: list.length, page, limit: 20 }, restaurantContact: null,
        pendingCash: { groups: { collection_pending: { count: 0, amountHalala: 0 }, awaiting_confirmation: { count: 8, amountHalala: 33600 }, discrepancy: { count: 0, amountHalala: 0 } }, deliveries: rows.slice(27, 32) } };
    }
  } else { status = 404; body = { success: false, message: "Unexpected fixture endpoint" }; }
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "private, no-store" });
  if (delay && url.pathname.startsWith("/api/rider/")) await new Promise(resolve => setTimeout(resolve, delay));
  res.end(JSON.stringify(body));
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
  for (let attempt = 0; attempt < 120; attempt++) {
    try { await fetch(origin + "/rider", { redirect: "manual" }); break; }
    catch { if (next.exitCode != null || attempt === 119) throw new Error(output.slice(-2000)); await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  for (const route of ["/rider", "/rider/deliveries", "/rider/cash", "/rider/history"]) {
    assert.equal((await fetch(origin + route, { redirect: "manual" })).status, 307);
    const denied = await fetch(origin + route, { headers: { cookie: "dg_session=customer" }, redirect: "manual" });
    assert.match(denied.headers.get("location") || await denied.text(), /access%3Ddenied|access=denied/);
  }
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const screenshots = await mkdtemp(path.join(tmpdir(), "dg-rider-dashboard-phase1-"));
  for (const viewport of [{ width: 320, height: 760 }, { width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 1000 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block" });
    await context.addCookies([{ name: "dg_session", value: "rider", url: origin }]);
    await context.addInitScript({ path: path.resolve(import.meta.dirname, "../node_modules/axe-core/axe.min.js") });
    const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
    const layout = async () => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "No horizontal overflow");
      const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(row => ({ id: row.id, nodes: row.nodes.map(node => node.target) })));
      assert.deepEqual(violations, []);
      const last = page.getByRole("button", { name: "Refresh rider workspace" });
      // A fixed nav can overlap an arbitrary intermediate scroll position. Verify
      // that the final control clears it at the real end of the scrollable page.
      await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      assert.ok(await last.evaluate(node => node.getBoundingClientRect().bottom <= document.querySelector('nav[aria-label="Rider navigation"]').getBoundingClientRect().top), "Bottom navigation does not cover final control");
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    };
    failReads = false; enabled = true; available = true; foreign = false; delay = 0;
    await page.goto(origin + "/rider");
    await page.getByRole("heading", { name: "Hello, Nadia Test" }).waitFor();
    await page.getByText("Active deliveries", { exact: true }).waitFor();
    await page.locator('article').first().waitFor();
    const stats = page.getByLabel("Delivery totals across all pages");
    assert.equal(await stats.locator("strong").first().textContent(), "27");
    assert.equal(await stats.locator("strong").last().textContent(), "5");
    assert.equal(await page.locator("article").count(), 20, "Page size must not determine global totals");
    await page.getByText("NT", { exact: true }).waitFor(); // Broken avatar falls back to actual rider initials.
    const availability = page.getByRole("switch", { name: "Available for deliveries" });
    assert.equal(await availability.getAttribute("aria-checked"), "true");
    if (viewport.width === 390) {
      const refreshed = page.waitForResponse(response => response.url().includes("/api/rider/portal"));
      await availability.click(); await refreshed;
      await page.waitForFunction(() => document.querySelector('[role="switch"]').getAttribute("aria-checked") === "false");
      assert.equal(await availability.getAttribute("aria-checked"), "false");
      await page.getByText("Device online", { exact: true }).waitFor();
    }
    await layout(); await page.screenshot({ path: path.join(screenshots, `home-${viewport.width}.png`), fullPage: false });
    await page.getByRole("link", { name: "Deliveries", exact: true }).click();
    await page.getByRole("button", { name: "Awaiting pickup", exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Deliveries", exact: true }).getAttribute("aria-current"), "page");
    await page.getByRole("button", { name: "Awaiting pickup", exact: true }).click();
    await page.getByText("24 matching records", { exact: false }).waitFor();
    assert.equal(await page.getByText("Preparing", { exact: true }).count() > 0, true);
    if (viewport.width === 390) {
      await page.getByRole("link", { name: "View Delivery TEST-002", exact: true }).click();
      await page.getByRole("heading", { name: "Delivery Details", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Confirm Pickup", exact: true }).isDisabled(), true, "Preparing order cannot be picked up in existing details flow");
      assert.equal(await page.getByRole("link", { name: "Deliveries", exact: true }).getAttribute("aria-current"), "page");
      await page.getByRole("link", { name: "Back to deliveries", exact: true }).click();
      await page.getByRole("button", { name: "Awaiting pickup", exact: true }).click();
      await page.getByText("24 matching records", { exact: false }).waitFor();
    }
    await page.getByRole("status").filter({ hasText: "1 unresolved issue" }).waitFor();
    await page.getByRole("button", { name: "View issues", exact: false }).click();
    await page.getByRole("heading", { name: "TEST-027" }).waitFor(); assert.equal(await page.locator("article").count(), 1);
    await page.getByText("Awaiting manager review", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Picked up", exact: true }).click();
    await page.getByText("2 matching records", { exact: false }).waitFor();
    assert.equal(await page.getByText("On the way", { exact: true }).count(), 2);
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.getByText("27 matching records", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("results page 2", { exact: false }).waitFor(); assert.equal(await page.locator("article").count(), 7);
    await page.getByRole("button", { name: "Previous", exact: true }).click(); await page.getByText("results page 1", { exact: false }).waitFor();
    await layout(); await page.screenshot({ path: path.join(screenshots, `deliveries-${viewport.width}.png`), fullPage: false });
    const stamp = await page.locator("time").getAttribute("datetime");
    failReads = true; await page.getByRole("button", { name: "Refresh rider workspace" }).click();
    await page.getByRole("heading", { name: "Retained data may be outdated" }).waitFor();
    assert.equal(await page.locator("article").count(), 20); assert.equal(await page.locator("time").getAttribute("datetime"), stamp);
    failReads = false; delay = 500; await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Updating…" }).waitFor();
    await page.getByRole("status").filter({ hasText: "Updating…" }).waitFor({ state: "detached" }); delay = 0;
    if (viewport.width === 390) {
      assignments++; await page.getByRole("button", { name: "Refresh rider workspace" }).click();
      await page.getByRole("status").filter({ hasText: "New delivery available" }).waitFor(); await page.getByRole("button", { name: "Dismiss", exact: true }).click();
      await context.setOffline(true); await page.getByText("Device offline", { exact: true }).waitFor();
      assert.equal(await page.locator("article").count(), 20); await context.setOffline(false);
      await page.getByRole("alert").filter({ hasText: "Offline —" }).waitFor({ state: "detached" });
    }
    await page.getByRole("link", { name: "Completed", exact: true }).click();
    await page.getByRole("heading", { name: "TEST-028" }).waitFor(); assert.equal(await page.locator("article").count(), 8);
    assert.equal(await page.getByText("Fixture recipient", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Fixture district", { exact: false }).count(), 0);
    assert.equal(await page.getByRole("link", { name: "Deliveries", exact: true }).getAttribute("aria-current"), "page");
    await layout(); await page.screenshot({ path: path.join(screenshots, `completed-${viewport.width}.png`), fullPage: true });
    if (viewport.width === 390) {
      await page.getByRole("link", { name: "View Delivery TEST-028", exact: true }).click();
      await page.getByRole("heading", { name: "Delivery Details", exact: true }).waitFor();
      assert.equal(await page.getByRole("link", { name: "Call Customer", exact: true }).count(), 0);
      assert.equal(await page.getByText("Fixture district", { exact: false }).count(), 0);
    }
    await page.getByRole("link", { name: "Cash", exact: true }).click();
    await page.getByRole("region", { name: "Pending Cash" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Cash", exact: true }).getAttribute("aria-current"), "page");
    await layout();
    await page.getByRole("link", { name: "Profile", exact: true }).click(); await page.getByRole("region", { name: "Rider profile" }).waitFor();
    await page.getByRole("link", { name: "Home", exact: true }).click(); await page.locator("article").first().waitFor();
    foreign = true; await page.getByRole("button", { name: "Refresh rider workspace" }).click();
    await page.getByRole("heading", { name: "Retained data may be outdated" }).waitFor();
    assert.equal(await page.getByText("FOREIGN RECIPIENT", { exact: true }).count(), 0); foreign = false;
    enabled = false; await page.goto(origin + "/rider"); await page.getByRole("heading", { name: "Live delivery is not enabled" }).waitFor();
    assert.equal(await page.getByRole("switch").isDisabled(), true);
    await page.getByRole("link", { name: "Open isolated demo preview" }).click(); await page.getByRole("heading", { name: "PREVIEW-A" }).waitFor();
    const writes = requests.filter(record => record.method !== "GET").length;
    await page.getByRole("switch").click(); assert.equal(requests.filter(record => record.method !== "GET").length, writes);
    await page.getByRole("link", { name: "Deliveries", exact: true }).click(); await page.getByRole("heading", { name: "PREVIEW-A" }).waitFor();
    assert.match(await page.getByRole("link", { name: /^View Delivery PREVIEW-A$/ }).getAttribute("href"), /\?preview=1$/);
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}px: dashboard/list, server totals, avatar, filters/issues, pagination, history privacy, cash/nav, retained errors, preview isolation, axe/layout`);
    await context.close();
  }
  assert.ok(requests.every(record => ["/api/auth/session", "/api/rider/portal", "/api/rider/preview", "/api/rider/workflow/availability", "/api/rider/workflow/deliveries/1001", "/api/rider/workflow/deliveries/1027"].includes(record.path)), JSON.stringify(requests.filter(record => !record.path.startsWith("/api/rider/") && record.path !== "/api/auth/session")));
  assert.ok(requests.filter(record => record.method === "POST").every(record => record.path === "/api/rider/workflow/availability"));
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser?.close();
  if (next.exitCode == null) { const stopped = new Promise(resolve => next.once("exit", resolve)); next.kill(); await stopped; }
  await new Promise(resolve => fixture.close(resolve));
}
