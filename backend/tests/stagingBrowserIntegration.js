import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { pathToFileURL, fileURLToPath } from "node:url";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import User from "../models/User.js";
import MenuItem from "../models/MenuItem.js";
import InventoryRecipe from "../models/InventoryRecipe.js";
import RestaurantSettings from "../models/RestaurantSettings.js";
import PosTerminal from "../models/PosTerminal.js";
import Order from "../models/Order.js";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const port = async () => { const server = net.createServer(); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value; };

test("staging browser acceptance on real local API + isolated MongoDB", { timeout: 240000 }, async t => {
  if (!process.env.PLAYWRIGHT_MODULE) throw new Error("Set PLAYWRIGHT_MODULE to the Playwright package directory; this test never uses a remote database or website.");
  const { chromium } = await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href);
  const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend");
  const axe = await readFile(path.join(frontend, "node_modules/axe-core/axe.min.js"), "utf8");
  const evidence = path.join(tmpdir(), "dg-pwa-phase-b-browser"); await mkdir(evidence, { recursive: true });
  const original = { ...process.env };
  await withIsolatedMongo(async ({ uri }) => {
    const frontendPort = await port(); const origin = `http://127.0.0.1:${frontendPort}`;
    Object.assign(process.env, { NODE_ENV: "test", VERCEL: "1", MONGO_URI: uri, JWT_SECRET: "owned-browser-secret-123456789012345", CLIENT_ORIGINS: origin, TRUST_PROXY_HOPS: "0" });
    const { default: app } = await import("../server.js");
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    const actors = {};
    for (const role of ["customer", "cashier", "kitchen", "admin"]) actors[role] = await User.create({ name: `Owned ${role}`, email: `${role}@pwa-owned.test`, password: "TestPassword123!", role, phone: "0500000000", address: "Owned test address", pointsBalance: 0, ...(role === "cashier" ? { posPinHash: bcrypt.hashSync("654321", 10) } : {}) });
    await RestaurantSettings.create({ key: "default", orders: { deliveryFee: 10, minimumDeliveryOrder: 0 }, posShifts: { enabled: false, requireOpenShift: false } });
    const dish = await MenuItem.create({ name: "Owned PWA Burger", description: "Isolated browser fixture", image: "/pwa/icon-192.png", category: "Food", price: 20, kitchenStation: "Grill", customization: { enabled: true, spice: { enabled: true, options: ["medium", "hot"], default: "medium" } } });
    const quick = await MenuItem.create({ name: "Owned Quick Dish", description: "Isolated POS fixture", image: "/pwa/icon-192.png", category: "Food", price: 15 });
    for (const menuItem of [dish, quick]) await InventoryRecipe.create({ menuItem: menuItem._id, doNotTrack: true, updatedBy: actors.admin._id });
    await PosTerminal.create({ code: "PWA-TEST", name: "Owned Counter", createdBy: actors.admin._id });
    const backend = await new Promise(resolve => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
    // Backend CORS allows exactly this newly owned local frontend origin.
    const env = { ...process.env, NODE_ENV: "production", BACKEND_API_URL: `http://127.0.0.1:${backend.address().port}/api`, SITE_URL: origin, SITE_ENV: "staging", NEXT_TELEMETRY_DISABLED: "1" };
    for (const key of Object.keys(env)) if (/MONGO|DATABASE|JWT_SECRET|API_PROXY_SECRET|TOKEN/i.test(key)) delete env[key];
    const next = spawn(process.execPath, [path.join(frontend, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(frontendPort)], { cwd: frontend, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let startupError; next.on("error", error => { startupError = error; }); next.stdout.on("data", () => {}); next.stderr.on("data", () => {});
    let browser;
    const pages = {}; const errors = []; const violations = []; const accessibility = []; const performance = [];
    try {
      for (let i = 0; i < 60; i++) { if (startupError) throw startupError; if (next.exitCode != null) throw new Error(`Owned frontend exited with ${next.exitCode}`); try { if ((await fetch(origin + "/login")).ok) break; } catch {} await delay(500); }
      browser = await chromium.launch({ channel: "chrome", headless: true });
      const makePage = async (role, viewport = { width: 1440, height: 1000 }) => {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => dialog.accept());
        await page.addInitScript(() => { window.__cspViolations = []; document.addEventListener("securitypolicyviolation", event => window.__cspViolations.push({ directive: event.violatedDirective, blocked: event.blockedURI })); });
        if (role) {
          // Authenticate through the real API. The proxy's Origin check is separately tested; this same-origin request goes through the production Next route.
          const login = await context.request.post(origin + "/api/auth/login", { data: { email: actors[role].email, password: "TestPassword123!" } }); assert.equal(login.status(), 200, await login.text());
        }
        pages[role || "guest"] = { context, page }; return page;
      };
      const api = (page, resource, body, method = body === undefined ? "GET" : "POST") => page.evaluate(async ({ resource, body, method }) => {
        const csrf = document.cookie.split("; ").find(value => value.startsWith("dg_csrf="))?.slice(8);
        const session = sessionStorage.getItem("dg_pos_session");
        const response = await fetch("/api" + resource, { method, headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": decodeURIComponent(csrf) } : {}), ...(session && resource.startsWith("/pos/") ? { "X-POS-Session": session } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: response.status, body: await response.json() };
      }, { resource, body, method });
      const audit = async (page, label) => {
        await page.evaluate(axe); const result = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }));
        accessibility.push({ label, violations: result.violations.map(value => ({ id: value.id, impact: value.impact, nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })) });
        performance.push({ label, ...await page.evaluate(() => {
          const navigation = window.performance.getEntriesByType("navigation")[0];
          const scripts = window.performance.getEntriesByType("resource").filter(resource => resource.initiatorType === "script");
          return { ttfbMs: Math.round(navigation.responseStart - navigation.startTime), domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd), scriptRequests: scripts.length, transferredScriptBytes: scripts.reduce((sum, script) => sum + script.transferSize, 0), note: "Owned loopback production server; viewport changes reuse their navigation, not an Internet/load benchmark" };
        }) });
        violations.push(...await page.evaluate(() => window.__cspViolations));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), `${label} fits viewport`);
        await page.screenshot({ path: path.join(evidence, `${label}.png`), fullPage: true });
      };
      const customer = await makePage("customer", { width: 390, height: 844 });
      const kitchen = await makePage("kitchen", { width: 768, height: 1024 });
      const admin = await makePage("admin"); const cashier = await makePage("cashier");
      await t.test("direct routes protect guests, fake sessions, customer and cashier roles", async () => {
        for (const route of ["/pos", "/kitchen", "/admin"]) { const response = await fetch(origin + route, { redirect: "manual" }); assert.equal(response.status, 307); assert.match(response.headers.get("location"), /\/login/); }
        const fake = await fetch(origin + "/admin", { headers: { Cookie: "dg_session=fake-token", "x-dg-path": "/" }, redirect: "manual" }); assert.equal(fake.status, 307);
        const unusual = await fetch(origin + "/admin/staff/attendance.txt", { headers: { Cookie: "dg_session=fake-token", "x-dg-path": "/pos/customer-display" }, redirect: "manual" }); assert.equal(unusual.status, 307);
        await customer.goto(origin + "/admin"); await customer.waitForURL(/access=denied/);
        await cashier.goto(origin + "/admin"); await cashier.waitForURL(/access=denied/);
        assert.equal((await fetch(origin + "/pos/customer-display")).status, 200);
      });
      let onlineOrder; let posOrder;
      await t.test("customer UI checkout -> real kitchen transitions -> COD collection -> points/report", async () => {
        await customer.goto(origin + "/menu"); await customer.getByLabel("Search menu").fill(dish.name);
        await customer.getByRole("button", { name: "Customize & Add" }).click(); const modal = customer.getByRole("dialog");
        await modal.getByRole("button", { name: "Hot", exact: true }).click(); await modal.getByPlaceholder("E.g. no onions, extra sauce, well done…").fill("No onion"); await modal.getByRole("button", { name: /Add to Cart/ }).click();
        await customer.getByRole("button", { name: "Open cart, 1 items" }).click(); await customer.getByRole("button", { name: "Proceed to Checkout" }).click();
        assert.equal(await customer.getByLabel("Customer name").inputValue(), "Owned customer");
        if (await customer.getByLabel("Customer phone").isEditable()) await customer.getByLabel("Customer phone").fill("0500000000");
        if (await customer.getByLabel("Delivery address").isEditable()) await customer.getByLabel("Delivery address").fill("Owned fixture address");
        await customer.getByLabel("Kitchen notes").fill("Separate sauces");
        const created = customer.waitForResponse(response => response.url().endsWith("/api/orders") && response.request().method() === "POST");
        await customer.getByRole("button", { name: "Place Order", exact: true }).click(); onlineOrder = (await (await created).json()).data; assert.ok(onlineOrder?._id);
        await customer.getByRole("button", { name: "Track this order" }).waitFor();
        assert.equal((await Order.findById(onlineOrder._id)).paymentStatus, "pending");
        await kitchen.goto(origin + "/kitchen"); await kitchen.getByText(onlineOrder.orderNumber, { exact: false }).waitFor();
        for (const action of ["Accept Order", "Start Preparing", "Mark Ready", "Dispatch order", "Confirm delivered"]) await kitchen.getByRole("button", { name: action, exact: true }).click();
        await kitchen.getByRole("heading", { name: "Completed", exact: true }).waitFor();
        assert.equal((await User.findById(actors.customer._id)).pointsBalance, 0);
        await admin.goto(origin + "/admin?tab=orders");
        const paid = await api(admin, `/orders/${onlineOrder._id}/payment`, { method: "cash", amount: onlineOrder.totalAmount, idempotencyKey: randomUUID() }); assert.equal(paid.status, 200, paid.body.message);
        assert.equal((await Order.findById(onlineOrder._id)).status, "delivered"); assert.equal((await User.findById(actors.customer._id)).pointsBalance, 200);
        const report = await api(admin, "/admin/dashboard"); assert.equal(report.status, 200); assert.ok(JSON.stringify(report.body).includes("totalOrders"));
        await admin.getByText(onlineOrder.orderNumber, { exact: true }).waitFor();
        await audit(kitchen, "kitchen-tablet"); await audit(admin, "admin-desktop");
        await kitchen.setViewportSize({ width: 1440, height: 1000 }); await audit(kitchen, "kitchen-desktop");
        await admin.setViewportSize({ width: 390, height: 844 });
        assert.ok((await admin.getByText(onlineOrder.orderNumber, { exact: true }).boundingBox()).height < 60, "Mobile order number remains legible instead of wrapping every character");
        await audit(admin, "admin-mobile");
      });
      await t.test("cashier UI sale appears in shared kitchen queue and browser receipt opens", async () => {
        await cashier.goto(origin + "/pos");
        if (await cashier.getByLabel("POS PIN", { exact: true }).count()) { await cashier.getByLabel("POS PIN", { exact: true }).fill("654321"); await cashier.getByRole("button", { name: "Unlock POS", exact: true }).click(); }
        await cashier.getByRole("combobox").filter({ hasText: "Select terminal" }).click(); await cashier.getByRole("option", { name: "Owned Counter · PWA-TEST" }).click();
        await cashier.getByText(quick.name, { exact: true }).first().click();
        await cashier.getByRole("button", { name: "Cash", exact: true }).click(); await cashier.getByLabel("Received amount").fill("20");
        const captured = cashier.waitForResponse(response => response.url().endsWith("/api/pos/sales") && response.request().method() === "POST");
        await cashier.getByRole("button", { name: "Complete Sale", exact: true }).click(); const sale = (await (await captured).json()).data; posOrder = sale; assert.ok(sale?._id);
        await cashier.getByRole("dialog", { name: "POS receipt" }).waitFor();
        await cashier.evaluate(() => { const open = window.open.bind(window); window.__printed = false; window.open = (...args) => { const popup = open(...args); if (popup) popup.print = () => { window.__printed = true; }; return popup; }; });
        await cashier.getByRole("button", { name: "Print Receipt", exact: true }).click();
        await cashier.waitForFunction(() => window.__printed === true);
        const queue = await api(kitchen, "/kitchen/orders"); assert.ok(queue.body.data.some(row => row._id === sale._id && row.sourceChannel === "pos"));
        await cashier.getByRole("button", { name: "Close receipt" }).click(); await audit(cashier, "pos-desktop");
        await cashier.setViewportSize({ width: 768, height: 1024 }); await audit(cashier, "pos-tablet");
      });
      await t.test("manifest/icon/CSP worker and safe offline recovery", async () => {
        for (const [page, manifestPath] of [[customer, "/manifest.webmanifest"], [cashier, "/pos/manifest.webmanifest"], [kitchen, "/kitchen/manifest.webmanifest"]]) assert.equal(await page.locator('link[rel="manifest"]').getAttribute("href"), manifestPath);
        for (const route of ["/manifest.webmanifest", "/pos/manifest.webmanifest", "/kitchen/manifest.webmanifest"]) { const response = await fetch(origin + route); assert.equal(response.status, 200); assert.match(response.headers.get("content-type"), /manifest\+json/); const manifest = await response.json(); assert.ok(manifest.start_url.startsWith(manifest.scope)); }
        for (const [filename, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["maskable-512.png", 512], ["apple-180.png", 180]]) {
          const icon = await fetch(origin + "/pwa/" + filename); assert.equal(icon.status, 200);
          const bytes = Buffer.from(await icon.arrayBuffer()); assert.equal(bytes.subarray(1, 4).toString(), "PNG"); assert.equal(bytes.readUInt32BE(16), size); assert.equal(bytes.readUInt32BE(20), size);
        }
        const html = await fetch(origin + "/menu"); assert.match(html.headers.get("content-security-policy"), /nonce-/); assert.equal(html.headers.get("x-frame-options"), "DENY"); assert.match(html.headers.get("x-robots-tag"), /noindex/);
        const sw = await fetch(origin + "/sw.js"); assert.match(sw.headers.get("cache-control"), /no-store/); assert.ok(!(await sw.text()).includes("__DG_BUILD_VERSION__"));
        await customer.goto(origin + "/menu"); await customer.evaluate(async () => { await navigator.serviceWorker.ready; await fetch("/api/menu"); });
        await customer.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
        const keys = await customer.evaluate(async () => (await caches.keys()).filter(key => key.endsWith("-menu"))); assert.equal(keys.length, 1);
        const cachedUrls = await customer.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(request => new URL(request.url).pathname)))).flat());
        assert.ok(cachedUrls.filter(url => url.startsWith("/api/")).every(url => ["/api/menu", "/api/categories", "/api/combos"].includes(url)), "Only public catalog APIs appear in browser Cache Storage");
        await pages.customer.context.setOffline(true); await customer.getByText("Offline. Reconnect", { exact: false }).waitFor();
        const rejected = await customer.evaluate(async () => { try { await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); return false; } catch { return true; } }); assert.equal(rejected, true);
        const count = await Order.countDocuments(); await customer.reload(); await customer.getByRole("heading", { name: "Connection unavailable" }).waitFor(); await customer.getByRole("button", { name: "Show saved menu" }).click(); await customer.getByText("Owned PWA Burger", { exact: false }).waitFor();
        assert.equal(await Order.countDocuments(), count);
        await pages.customer.context.setOffline(false); await customer.goto(origin + "/menu"); await customer.getByLabel("Search menu").waitFor(); await audit(customer, "customer-mobile");
        await customer.setViewportSize({ width: 1440, height: 1000 }); await audit(customer, "customer-desktop");
        const crossOrigin = await pages.customer.context.request.post(origin + "/api/auth/logout", { headers: { Origin: "https://evil.test" }, data: {} }); assert.equal(crossOrigin.status(), 403);
        await pages.kitchen.context.setOffline(true); await kitchen.getByText("Offline. Reconnect to order", { exact: false }).waitFor();
        assert.equal((await Order.findById(posOrder._id)).status, "pending");
        await pages.kitchen.context.setOffline(false); await kitchen.getByText(posOrder.orderNumber, { exact: false }).waitFor(); await kitchen.getByText("Live", { exact: true }).waitFor();
      });
      assert.deepEqual(errors, [], "No uncaught client errors"); assert.deepEqual(violations, [], "No CSP violations");
      await writeFile(path.join(evidence, "accessibility.json"), JSON.stringify(accessibility, null, 2));
      console.log("Browser evidence:", evidence);
      const serious = accessibility.flatMap(result => result.violations.filter(value => ["critical", "serious"].includes(value.impact)).map(value => ({ label: result.label, ...value })));
      assert.deepEqual(serious, [], "No serious/critical WCAG violations in acceptance screens");
    } finally {
      await writeFile(path.join(evidence, "accessibility.json"), JSON.stringify(accessibility, null, 2));
      await writeFile(path.join(evidence, "performance.json"), JSON.stringify(performance, null, 2));
      await browser?.close(); if (next.exitCode == null && !startupError) { const stopped = new Promise(resolve => next.once("exit", resolve)); next.kill(); await stopped; }
      await new Promise(resolve => backend.close(resolve));
      for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key]; Object.assign(process.env, original);
    }
  });
});
