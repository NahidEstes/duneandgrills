import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import User from "../models/User.js";
import Order from "../models/Order.js";
import Delivery from "../models/Delivery.js";
import PosShift from "../models/PosShift.js";
import CashMovement from "../models/CashMovement.js";
import StockTransaction from "../models/StockTransaction.js";
import deliveryRoutes from "../routes/deliveryRoutes.js";
import riderRoutes from "../routes/riderRoutes.js";
import authRoutes from "../routes/authRoutes.js";
import { csrfProtection, requestCorrelation, validateRequestStructure } from "../middleware/security.js";
import { enrollDelivery, actOnDelivery } from "../services/deliveryWorkflowService.js";
import settingsRoutes from "../routes/restaurantSettingsRoutes.js";
import { setRiderDeliverySetting } from "../services/riderAccessService.js";

// No dotenv, real server.js, supplied database URI or external API. --manual holds
// this disposable replica set/API/UI open for a human rehearsal, until Ctrl+C.
const frontend = path.resolve(import.meta.dirname, "../../frontend");
const manual = process.argv.includes("--manual");
const operational = process.argv.includes("--operational");
const management = process.argv.includes("--management");
const modeQuery = operational ? "" : "?rehearsal=1";
const keys = ["NODE_ENV", "MONGO_URI", "JWT_SECRET", "RIDER_WORKFLOW_ENABLED", "RIDER_PREVIEW_ENABLED"];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
try {
  await withIsolatedMongo(async ({ uri }) => {
    Object.assign(process.env, { NODE_ENV: "test", MONGO_URI: uri, JWT_SECRET: "local-disposable-browser-rehearsal-only", RIDER_WORKFLOW_ENABLED: operational ? "false" : "true", RIDER_PREVIEW_ENABLED: "true" });
    const actors = {};
    for (const role of ["admin", "manager", "cashier", "rider"]) actors[role] = await User.create({ role, name: `Local ${role}`, email: `${role}@rehearsal.invalid`, password: "LocalDummy123!", riderAvailable: role === "rider" });
    actors.other = await User.create({ role: "rider", name: "Other local rider", email: "other@rehearsal.invalid", password: "LocalDummy123!", riderAvailable: false });
    const order = await Order.create({ orderNumber: "TEST-REHEARSAL-CASH", source: "website", orderType: "delivery", status: "ready", paymentStatus: "pending", totalAmount: 40, subtotal: 40,
      customer: { name: "Synthetic recipient", phone: "+0000000000", address: "Synthetic test address, not a real destination" },
      items: [{ menuItem: new mongoose.Types.ObjectId(), name: "Dummy dish", quantity: 2, price: 20 }], inventoryStatus: "not_required" });
    if (operational) await setRiderDeliverySetting(actors.admin, { enabled: true, expectedRevision: 0 });
    const enrolled = await enrollDelivery({ actor: actors.manager, orderId: order._id, payload: { reason: "Isolated browser rehearsal", expectedRevision: 0, idempotencyKey: "isolated-browser-enrollment" } });
    if (operational && !manual) await setRiderDeliverySetting(actors.admin, { enabled: false, expectedRevision: 1 });
    await PosShift.create({ cashier: actors.cashier._id, terminal: "LOCAL", openingCashHalala: 0, openedBy: actors.cashier._id, isOpen: true, status: "open" });
    const requests = [];
    let releaseRead, holdReads = false, releaseWrite, holdWrites = false;
    let second;
    if (management) {
      const secondOrder = await Order.create({ orderNumber: "TEST-SECOND-DELIVERY", source: "website", orderType: "delivery", deliveryMode: "restaurant", status: "ready", readyAt: new Date(), paymentStatus: "pending", totalAmount: 10, subtotal: 10,
        customer: { name: "Second synthetic recipient", phone: "+0000000000" }, items: [{ menuItem: new mongoose.Types.ObjectId(), name: "Dummy dish", quantity: 1, price: 10 }], inventoryStatus: "not_required" });
      second = await Delivery.create({ order: secondOrder._id });
    }
    let failReads = false;
    let holdRiderReads = false, releaseRiderRead, failRiderReads = false;
    const app = express();
    app.use(express.json(), requestCorrelation, validateRequestStructure, csrfProtection);
    app.use(async (req, res, next) => {
      requests.push({ method: req.method, path: req.path, query: { ...req.query } });
      if (holdRiderReads && req.method === "GET" && req.path.startsWith("/api/rider/")) await new Promise(resolve => { releaseRiderRead = resolve; });
      if (failRiderReads && req.method === "GET" && req.path.startsWith("/api/rider/")) return res.status(503).json({ success: false, message: "Isolated rider read failure" });
      if (holdReads && req.method === "GET" && req.path === "/api/deliveries") await new Promise(resolve => { releaseRead = resolve; });
      if (holdWrites && req.method === "POST" && req.path.endsWith("/assign")) await new Promise(resolve => { releaseWrite = resolve; });
      if (failReads && req.method === "GET" && req.path.startsWith("/api/deliveries") && !req.path.endsWith("/config")) return res.status(503).json({ success: false, message: "Isolated injected API failure" });
      next();
    });
    app.use("/api/auth", authRoutes); app.use("/api/deliveries", deliveryRoutes); app.use("/api/rider", riderRoutes); app.use("/api/settings", settingsRoutes);
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ success: false, message: error.message }));
    app.use((_req, res) => res.status(404).json({ success: false, message: "No unrelated API is available in this isolated rehearsal" }));
    const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
    const probe = createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
    const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
      cwd: frontend, windowsHide: true, env: { ...process.env, NODE_ENV: "production", SITE_URL: origin, BACKEND_API_URL: `http://127.0.0.1:${server.address().port}/api` }, stdio: ["ignore", "pipe", "pipe"],
    });
    let serverOutput = "", browser, screenshots;
    next.stdout.on("data", data => { serverOutput += data; }); next.stderr.on("data", data => { serverOutput += data; });
    try {
      for (let i = 0; i < 120; i++) {
        try { await fetch(`${origin}/rider`, { redirect: "manual" }); break; }
        catch { if (next.exitCode != null || i === 119) throw new Error(`Local Next failed: ${serverOutput.slice(-1500)}`); await new Promise(resolve => setTimeout(resolve, 250)); }
      }
      if (manual) {
        console.log(`Disposable rehearsal: ${origin}/admin/deliveries${modeQuery} and ${origin}/rider${modeQuery}`);
        console.log("Log in on separate browser profiles as manager@rehearsal.invalid / rider@rehearsal.invalid / cashier@rehearsal.invalid; dummy password LocalDummy123!; cashier terminal LOCAL.");
        console.log("Only one synthetic TEST-REHEARSAL-CASH order. Ctrl+C stops this owned sandbox and removes its temporary database; no persistent/production records.");
        await new Promise(resolve => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
        return;
      }
      const playwright = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright";
      const { chromium } = await import(playwright);
      browser = await chromium.launch({ channel: "chrome", headless: true });
      screenshots = await mkdtemp(path.join(tmpdir(), "dg-rider-phase2-visual-"));
      const errors = [];
      const session = async (actor, viewport) => {
        const context = await browser.newContext({ viewport, serviceWorkers: "block" });
        await context.addInitScript({ path: path.join(frontend, "node_modules/axe-core/axe.min.js") });
        await context.addCookies([{ name: "dg_session", value: jwt.sign({ id: String(actor._id), sv: 0 }, process.env.JWT_SECRET), url: origin, httpOnly: true }, { name: "dg_csrf", value: "local-browser-csrf-token", url: origin }]);
        const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
        page.on("response", async response => { if (response.request().method() === "POST" && response.url().includes("/api/")) console.log(`Local action response: ${response.status()} ${await response.text()}`); });
        return { context, page };
      };
      const assertLayout = async page => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "No document-level horizontal overflow");
        assert.equal(await page.evaluate(() => [...document.querySelectorAll("dialog[open]")].every(node => {
          const box = node.getBoundingClientRect(); return box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight + 1 && box.right <= innerWidth + 1;
        })), true, "Open drawer/confirmation is fully within the viewport");
        const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(row => ({ id: row.id, nodes: row.nodes.map(node => node.target) })));
        assert.deepEqual(violations, []);
      };
      let admin;
      if (operational) {
        admin = await session(actors.admin, { width: 1536, height: 1024 });
        await admin.page.goto(`${origin}/admin?tab=settings`);
        const toggle = admin.page.getByRole("checkbox", { name: /^Enable delivery rider/ });
        await toggle.waitFor(); assert.equal(await toggle.isChecked(), false);
        // Shared switch uses a visually hidden native checkbox. Test its real
        // keyboard interaction, not a pointer click on the hidden input box.
        await toggle.focus(); await admin.page.keyboard.press("Space"); assert.equal(await toggle.isChecked(), true);
        await admin.page.getByRole("button", { name: "Save Rider Setting", exact: true }).click();
        await admin.page.getByRole("status").filter({ hasText: "Delivery riders enabled." }).waitFor();
        await admin.page.screenshot({ path: path.join(screenshots, "admin-rider-setting.png"), fullPage: true });
        // No unrelated dashboard endpoints are mounted in this sandbox. Their
        // expected errors are honest, not synthesized report data.
        await admin.page.goto(`${origin}/admin/deliveries`);
      }
      const manager = await session(actors.manager, { width: 1536, height: 1024 });
      await manager.page.goto(`${origin}/admin/deliveries${modeQuery}`);
      const row = manager.page.getByRole("row").filter({ hasText: order.orderNumber }); await row.waitFor();
      await row.getByRole("button", { name: "Assign", exact: true }).focus(); await manager.page.keyboard.press("Enter");
      await manager.page.getByRole("radio").first().waitFor();
      if (management) {
        const page = manager.page, count = () => requests.filter(req => req.method === "GET" && req.path === "/api/deliveries").length;
        await page.getByRole("radio").first().check();
        const reason = page.getByLabel("Authorization reason / resolution", { exact: false }), terminal = page.getByLabel("Your open cashier terminal");
        await reason.fill("Keep my unsaved authorization draft"); await terminal.fill("DRAFT-TERMINAL");
        await page.getByText("View delivery details", { exact: true }).click();
        await page.getByRole("heading", { name: "Order Summary", exact: true }).waitFor();
        await page.getByText("Delivery timeline · recorded history", { exact: true }).click();
        await page.getByRole("heading", { name: "Enrolled", exact: true }).waitFor();
        const details = page.locator("details").filter({ has: page.getByText("View delivery details", { exact: true }) });
        const timeline = page.locator("details").filter({ has: page.getByText("Delivery timeline · recorded history", { exact: true }) });
        // Modal focus cannot escape into background search/assignment controls.
        for (let index = 0; index < 24; index++) {
          await page.keyboard.press("Tab");
          assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('dialog[open]'))), true);
        }
        await page.keyboard.press("Escape");
        assert.equal(await row.getByRole("button", { name: "Assign", exact: true }).evaluate(node => node === document.activeElement), true, "Escape restores focus to the selected row action");
        const before = count();
        await page.getByLabel("Search order number", { exact: true }).pressSequentially("NO-MATCH", { delay: 25 });
        await page.getByRole("combobox", { name: "Delivery status", exact: true }).click(); await page.getByRole("option", { name: "Assigned", exact: true }).click();
        for (const [label, option] of [["Date period", "Today"], ["Date basis", "Delivered date · Riyadh"], ["Sort deliveries", "Assigned longest · assigned only"]]) {
          await page.getByRole("combobox", { name: label, exact: true }).click(); await page.getByRole("option", { name: option, exact: true }).click();
        }
        await page.clock.install();
        await page.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
        await page.clock.fastForward(65_000); await new Promise(resolve => setTimeout(resolve, 250));
        assert.equal(count(), before, "Typing, unapplied filter, focus, visibility and two polling intervals cause zero list requests");
        await page.getByLabel("Search order number", { exact: true }).press("Enter");
        await page.getByText("No matching deliveries. This is a successful empty result.", { exact: true }).waitFor();
        assert.equal(count(), before + 1); assert.equal(requests.filter(req => req.path === "/api/deliveries").at(-1).query.search, "NO-MATCH");
        assert.equal(await reason.inputValue(), "Keep my unsaved authorization draft"); assert.equal(await terminal.inputValue(), "DRAFT-TERMINAL");
        assert.equal(await details.evaluate(element => element.open), true); assert.equal(await timeline.evaluate(element => element.open), true);
        await page.getByRole("button", { name: "Reset filters", exact: true }).click(); await row.waitFor();
        const attentionResponse = page.waitForResponse(response => response.url().includes("/api/deliveries?") && response.url().includes("attention=ready_unassigned"));
        await page.getByRole("button", { name: /Food ready · no rider/ }).click(); await attentionResponse;
        await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent.trim() === "Refresh deliveries" && !button.disabled));
        assert.equal(requests.filter(req => req.path === "/api/deliveries").at(-1).query.attention, "ready_unassigned");
        const appliedResponse = page.waitForResponse(response => response.url().includes("/api/deliveries?") && response.url().includes("attention=ready_unassigned"));
        const beforeApply = count(); await page.getByRole("button", { name: "Search / Apply", exact: true }).click(); await appliedResponse;
        await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent.trim() === "Refresh deliveries" && !button.disabled));
        assert.equal(count(), beforeApply + 1, "Search button produces one deliberate list request");
        holdReads = true; await page.getByRole("button", { name: "Refresh deliveries", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "Refreshing…" }).waitFor();
        assert.equal(await row.isVisible(), true); assert.equal(await reason.inputValue(), "Keep my unsaved authorization draft");
        for (let index = 0; !releaseRead && index < 100; index++) await new Promise(resolve => setTimeout(resolve, 25));
        holdReads = false; releaseRead();
        await page.getByRole("button", { name: "Refresh deliveries", exact: true }).waitFor({ state: "visible" });
        // Isolated fixture simulates another authorized worker advancing the revision.
        await Delivery.updateOne({ _id: enrolled.id }, { $inc: { revision: 1 } });
        await page.getByRole("button", { name: "Refresh deliveries", exact: true }).click();
        await page.getByRole("button", { name: "Open selected delivery", exact: true }).click();
        await page.getByRole("button", { name: "I reviewed the latest delivery", exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: operational ? "Assign Rider" : "Assign · Isolated Test", exact: true }).isDisabled(), true);
        assert.equal(await reason.inputValue(), "Keep my unsaved authorization draft");
        await page.getByRole("button", { name: "I reviewed the latest delivery", exact: true }).click();
        await page.setViewportSize({ width: 390, height: 844 }); await assertLayout(page);
        await page.screenshot({ path: path.join(screenshots, "management-mobile-details.png"), fullPage: false });
        await page.getByRole("button", { name: "Close Delivery details & actions", exact: true }).click();
        assert.equal(await page.locator("table").isVisible(), false);
        await page.getByRole("region", { name: "Delivery orders" }).getByRole("heading", { name: order.orderNumber, exact: true }).waitFor();
        await page.screenshot({ path: path.join(screenshots, "management-mobile-cards.png"), fullPage: true });
        await page.setViewportSize({ width: 820, height: 1180 }); await assertLayout(page);
        await page.setViewportSize({ width: 1536, height: 1024 });
        await page.getByRole("button", { name: "Open selected delivery", exact: true }).click();
        console.log("PASS explicit management search/Enter/reset, zero typing/focus/timer requests, retained rows/details/drafts, revision review and mobile/tablet accessibility");
      }
      await manager.page.getByRole("radio").first().check();
      await manager.page.screenshot({ path: path.join(screenshots, "admin-assignment-desktop.png"), fullPage: false });
      await assertLayout(manager.page);
      if (management) holdWrites = true;
      await manager.page.getByRole("button", { name: operational ? "Assign Rider" : "Assign · Isolated Test", exact: true }).click();
      const confirmation = manager.page.getByRole("dialog", { name: "Confirm rider assignment", exact: true });
      await confirmation.waitFor();
      await confirmation.getByText(order.orderNumber, { exact: true }).waitFor();
      await confirmation.getByText("Local rider", { exact: true }).waitFor();
      await assertLayout(manager.page);
      await manager.page.screenshot({ path: path.join(screenshots, "management-assignment-confirmation.png"), fullPage: false });
      await confirmation.getByRole("button", { name: "Confirm assignment", exact: true }).click();
      if (management) {
        const otherRow = manager.page.locator("table tbody tr").filter({ hasText: "TEST-SECOND-DELIVERY" });
        assert.equal(await otherRow.locator("button").isDisabled(), true, "Cannot change selection during a pending mutation");
        await manager.page.keyboard.press("Escape"); assert.equal(await confirmation.isVisible(), true, "Pending confirmation cannot be dismissed");
        for (let index = 0; !releaseWrite && index < 100; index++) await new Promise(resolve => setTimeout(resolve, 25));
        holdWrites = false; releaseWrite();
      }
      await manager.page.getByRole("status").filter({ hasText: "Confirmed by the server" }).waitFor();
      assert.equal(String((await Delivery.findById(enrolled.id)).rider), String(actors.rider._id));
      // Wait for the post-mutation reload before injecting the next failure. Otherwise
      // the old reload's error can be observed just before the manual refresh clears it.
      if (management) {
        await manager.page.getByText("Delivery: Assigned", { exact: true }).waitFor();
        await manager.page.getByText("Selected delivery is outside the applied results. Its authorized detail and your drafts are retained.", { exact: true }).waitFor();
        assert.equal(await manager.page.getByRole("button", { name: operational ? "Reassign Rider" : "Reassign · Isolated Test", exact: true }).isDisabled(), true, "No-op reassignment stays blocked");
        await manager.page.getByRole("button", { name: "Close Delivery details & actions", exact: true }).click();
        await manager.page.getByRole("button", { name: "Reset filters", exact: true }).click();
      }
      else await manager.page.getByRole("button", { name: "Close Delivery details & actions", exact: true }).click();
      await row.getByText("Assigned", { exact: true }).waitFor();
      failReads = true;
      await manager.page.getByRole("button", { name: "Refresh deliveries", exact: true }).click();
      await manager.page.getByRole("alert").filter({ hasText: "Isolated injected API failure" }).waitFor();
      assert.ok(await manager.page.locator("time").count() > 0, "Failed refresh retains the last successful timestamp");
      assert.equal(await row.isVisible(), true);
      await manager.page.getByText(/Retained results may be outdated/).waitFor();
      failReads = false; await manager.page.getByRole("button", { name: "Retry deliveries" }).click(); await row.waitFor();
      const rider = await session(actors.rider, { width: 390, height: 844 });
      await rider.page.clock.install();
      await rider.page.goto(`${origin}/rider${modeQuery}`);
      await rider.page.getByRole("heading", { name: order.orderNumber, exact: true }).waitFor();
      const riderCard = rider.page.locator("article").filter({ hasText: order.orderNumber });
      await rider.page.waitForTimeout(150);
      const beforeRiderPoll = requests.filter(req => req.path === "/api/rider/portal" || req.path === "/api/rider/workflow").length;
      const pollResponse = rider.page.waitForResponse(response => /\/api\/rider\/(portal|workflow)\?/.test(response.url()));
      await rider.page.clock.fastForward(31_000);
      await pollResponse;
      assert.ok(requests.filter(req => req.path === "/api/rider/portal" || req.path === "/api/rider/workflow").length > beforeRiderPoll);
      await rider.page.clock.resume();
      holdRiderReads = true;
      await rider.page.getByRole("button", { name: "Refresh rider workspace" }).click();
      await rider.page.getByRole("status").filter({ hasText: "Updating" }).waitFor();
      assert.equal(await riderCard.isVisible(), true);
      holdRiderReads = false; releaseRiderRead();
      await rider.page.getByRole("button", { name: "Refresh rider workspace" }).waitFor({ state: "visible" });
      failRiderReads = true;
      await rider.page.getByRole("button", { name: "Refresh rider workspace" }).click();
      await rider.page.getByRole("heading", { name: "Retained data may be outdated" }).waitFor();
      assert.equal(await riderCard.isVisible(), true); assert.equal(await rider.page.locator("time").count(), 1);
      failRiderReads = false; await rider.page.getByRole("button", { name: "Retry", exact: true }).click();
      if (second) {
        await actOnDelivery({ actor: actors.manager, id: String(second._id), action: "assign", payload: { expectedRevision: second.revision, riderId: String(actors.rider._id), idempotencyKey: "rider-browser-new-assignment" } });
        await rider.page.getByRole("button", { name: "Refresh rider workspace" }).click();
        await rider.page.getByRole("status").filter({ hasText: "New delivery available" }).waitFor();
        await rider.page.getByRole("button", { name: "Dismiss", exact: true }).click();
      }
      await rider.page.screenshot({ path: path.join(screenshots, "rider-dashboard-pending-mobile.png"), fullPage: true }); await assertLayout(rider.page);
      await riderCard.getByRole("link", { name: /^View Delivery/ }).click();
      await rider.page.getByRole("button", { name: "Confirm Pickup", exact: true }).waitFor();
      assert.equal(await rider.page.getByRole("link", { name: "Call Customer" }).getAttribute("href"), "tel:+0000000000");
      await rider.page.screenshot({ path: path.join(screenshots, "rider-assigned-mobile.png"), fullPage: true });
      await assertLayout(rider.page);
      await rider.page.setViewportSize({ width: 820, height: 1180 });
      await rider.page.screenshot({ path: path.join(screenshots, "rider-assigned-tablet.png"), fullPage: true }); await assertLayout(rider.page);
      await rider.page.setViewportSize({ width: 390, height: 844 });
      const beforeOffline = requests.filter(req => req.method === "POST").length;
      await rider.context.setOffline(true);
      await rider.page.getByRole("alert").filter({ hasText: "no actions are queued" }).waitFor();
      assert.equal(await rider.page.getByRole("button", { name: "Confirm Pickup", exact: true }).isDisabled(), true);
      assert.equal(requests.filter(req => req.method === "POST").length, beforeOffline);
      await rider.context.setOffline(false);
      await rider.page.getByRole("button", { name: "Confirm Pickup", exact: true }).click();
      let riderDialog = rider.page.getByRole("dialog", { name: "Confirm pickup" });
      await riderDialog.waitFor(); await assertLayout(rider.page);
      for (let index = 0; index < 10; index++) { await rider.page.keyboard.press("Tab"); assert.equal(await rider.page.evaluate(() => document.querySelector("dialog[open]").contains(document.activeElement)), true); }
      await rider.page.keyboard.press("Escape");
      assert.equal(await rider.page.getByRole("button", { name: "Confirm Pickup", exact: true }).evaluate(node => node === document.activeElement), true);
      await rider.page.getByRole("button", { name: "Confirm Pickup", exact: true }).click();
      await rider.page.screenshot({ path: path.join(screenshots, "rider-pickup-confirmation-mobile.png"), fullPage: false });
      // A payment/order change after the dialog opened must not silently adopt a new revision.
      await Order.updateOne({ _id: order._id }, { $inc: { __v: 1 } });
      await riderDialog.getByRole("button", { name: "Yes, confirm pickup", exact: true }).click();
      await riderDialog.getByRole("alert").filter({ hasText: "Delivery/payment state changed" }).waitFor();
      assert.equal(await riderDialog.getByRole("button", { name: "Yes, confirm pickup", exact: true }).isDisabled(), true);
      assert.equal((await Delivery.findById(enrolled.id)).status, "assigned");
      await riderDialog.getByRole("button", { name: "Go back", exact: true }).click();
      await rider.page.getByRole("button", { name: "Confirm Pickup", exact: true }).click();
      await riderDialog.getByRole("button", { name: "Yes, confirm pickup", exact: true }).click();
      await rider.page.getByRole("button", { name: "Confirm Delivery", exact: true }).waitFor();
      await rider.page.getByLabel("Delivery issue reason", { exact: false }).fill("Local road obstruction");
      await rider.page.getByRole("button", { name: "Report Delivery Issue", exact: true }).click();
      await rider.page.getByRole("dialog", { name: "Report delivery issue", exact: true }).getByRole("button", { name: "Yes, report delivery issue", exact: true }).click();
      await rider.page.getByRole("heading", { name: /Delivery Issue · Awaiting manager review/ }).waitFor();
      assert.equal(await rider.page.getByRole("button", { name: "Confirm Delivery", exact: true }).count(), 0);
      const issueRecord = await Delivery.findById(enrolled.id);
      await actOnDelivery({ actor: actors.manager, id: enrolled.id, action: "resolve_issue", payload: { expectedRevision: issueRecord.revision, reason: "PRIVATE authorized road review", idempotencyKey: "rider-browser-issue-resolve" } });
      await rider.page.getByRole("button", { name: "Refresh details", exact: true }).click();
      await rider.page.getByRole("button", { name: "Confirm Delivery", exact: true }).waitFor();
      assert.equal(await rider.page.getByText("PRIVATE authorized road review", { exact: false }).count(), 0);
      await rider.page.getByRole("button", { name: "Confirm Delivery", exact: true }).click();
      riderDialog = rider.page.getByRole("dialog", { name: "Confirm delivery", exact: true });
      await riderDialog.getByRole("button", { name: "Yes, confirm delivery", exact: true }).click();
      await rider.page.getByLabel("Cash actually collected (SAR)").waitFor();
      assert.equal((await Order.findById(order._id)).paymentStatus, "pending");
      assert.equal(await rider.page.getByRole("link", { name: "Call Customer" }).count(), 0);
      await rider.page.getByLabel("Cash actually collected (SAR)").fill("40");
      await rider.page.getByRole("button", { name: "Refresh details", exact: true }).click();
      await rider.page.getByRole("button", { name: "Report cash collected", exact: true }).waitFor();
      assert.equal(await rider.page.getByLabel("Cash actually collected (SAR)").inputValue(), "40");
      await rider.page.getByRole("button", { name: "Report cash collected", exact: true }).click();
      riderDialog = rider.page.getByRole("dialog", { name: "Confirm cash report", exact: true });
      await riderDialog.getByRole("heading", { name: "Report 40.00 SAR collected?", exact: true }).waitFor();
      await riderDialog.getByText("Reporting cash does not confirm payment. Cashier confirmation is separate.", { exact: true }).waitFor();
      await assertLayout(rider.page);
      await riderDialog.getByRole("button", { name: "Yes, report cash collected", exact: true }).click();
      await rider.page.getByRole("heading", { name: "Reported · Awaiting cashier confirmation", exact: true }).waitFor();
      assert.equal(await CashMovement.countDocuments(), 0);
      await rider.page.getByRole("link", { name: "Cash", exact: true }).click();
      await rider.page.getByRole("region", { name: "Pending Cash" }).getByText(order.orderNumber, { exact: false }).waitFor();
      await rider.page.getByRole("region", { name: "Pending Cash" }).getByRole("link", { name: /Reported · Awaiting cashier confirmation/ }).first().click();
      await rider.page.getByRole("heading", { name: order.orderNumber, exact: true }).waitFor();
      const historyRequests = () => requests.filter(req => req.path === "/api/rider/portal" || req.path === "/api/rider/workflow");
      const beforeHistoryTyping = historyRequests().length;
      await rider.page.getByPlaceholder("Search order number").fill("NOT-FOUND");
      assert.equal(historyRequests().length, beforeHistoryTyping);
      await rider.page.getByPlaceholder("Search order number").press("Enter");
      await rider.page.getByRole("heading", { name: "No matching delivery history" }).waitFor();
      assert.equal(historyRequests().at(-1).query.search, "NOT-FOUND");
      await rider.page.getByRole("button", { name: "Reset", exact: true }).click();
      await rider.page.getByRole("heading", { name: order.orderNumber, exact: true }).waitFor();
      await rider.page.screenshot({ path: path.join(screenshots, "rider-history-mobile.png"), fullPage: true }); await assertLayout(rider.page);
      await rider.page.getByRole("link", { name: /^View Delivery/ }).click();
      const cashier = await session(actors.cashier, { width: 1536, height: 1024 });
      await cashier.page.goto(`${origin}/admin/deliveries${modeQuery}`);
      await cashier.page.getByRole("row").filter({ hasText: order.orderNumber }).getByRole("button", { name: "Review Cash", exact: true }).click();
      assert.equal(await cashier.page.getByRole("radio").count(), 0, "Cashier receives no assignment controls");
      await cashier.page.getByLabel("Your open cashier terminal").fill("LOCAL");
      await cashier.page.getByRole("button", { name: operational ? "Confirm Cashier Receipt" : "Confirm Cashier Receipt · Isolated Test", exact: true }).click();
      await cashier.page.getByRole("status").filter({ hasText: "Confirmed by the server" }).waitFor();
      assert.equal((await Order.findById(order._id)).paymentStatus, "paid");
      assert.equal(await CashMovement.countDocuments({ order: order._id }), 1);
      assert.equal((await CashMovement.findOne({ order: order._id })).amountHalala, 4000);
      await cashier.page.getByText("Delivery timeline · recorded history", { exact: true }).click();
      await cashier.page.getByRole("heading", { name: "Cashier receipt confirmed", exact: true }).waitFor();
      await cashier.page.screenshot({ path: path.join(screenshots, "management-confirmed-timeline.png"), fullPage: false });
      await cashier.page.getByRole("button", { name: "Close Delivery details & actions", exact: true }).click();
      if (management) {
        await cashier.page.getByRole("row").filter({ hasText: order.orderNumber }).getByText("Cash confirmed", { exact: true }).waitFor();
        const cashResponse = cashier.page.waitForResponse(response => response.url().includes("/api/deliveries?") && response.url().includes("cashStatus=confirmed_today"));
        await cashier.page.getByRole("button", { name: /Cash confirmed · Today/ }).click(); await cashResponse;
        assert.equal(requests.filter(req => req.path === "/api/deliveries").at(-1).query.cashStatus, "confirmed_today");
        console.log("PASS attention and confirmed-today cards apply matching explicit server filters; no implicit cash settlement");
      }
      assert.equal(await Order.countDocuments(), management ? 2 : 1); assert.equal(await StockTransaction.countDocuments(), 0);
      await rider.page.getByRole("button", { name: "Refresh details", exact: true }).click();
      await rider.page.getByText("Payment: Paid", { exact: true }).first().waitFor();
      await rider.page.getByRole("heading", { name: "Cashier confirmed", exact: true }).waitFor();
      assert.equal(await rider.page.getByLabel("Cash actually collected (SAR)").count(), 0);
      await rider.page.getByRole("link", { name: "Deliveries", exact: true }).click();
      await rider.page.getByRole("link", { name: "Completed", exact: true }).click();
      await rider.page.getByRole("heading", { name: order.orderNumber, exact: true }).waitFor();
      assert.equal(await rider.page.getByText("Synthetic test address", { exact: false }).count(), 0);
      // Default and read-only preview cannot mutate this isolated order either.
      const writesBeforePreview = requests.filter(req => req.method !== "GET").length;
      await rider.page.goto(`${origin}/rider/deliveries/preview-a?preview=1`);
      await rider.page.getByRole("button", { name: "Confirm Pickup · Preview Only" }).waitFor();
      assert.equal(await rider.page.getByRole("button", { name: "Confirm Pickup · Preview Only" }).isDisabled(), true);
      await assertLayout(rider.page);
      await manager.page.goto(`${origin}/admin/deliveries?preview=1`);
      await manager.page.getByRole("row").filter({ hasText: "PREVIEW-A" }).getByRole("button", { name: "Assign", exact: true }).click();
      await manager.page.getByRole("radio").first().check(); await manager.page.getByRole("button", { name: "Preview Assignment" }).click();
      await manager.page.getByRole("button", { name: "Confirm preview selection", exact: true }).click();
      await manager.page.getByRole("status").filter({ hasText: "No record was assigned" }).waitFor();
      assert.equal(requests.filter(req => req.method !== "GET").length, writesBeforePreview);
      await rider.page.goto(`${origin}/rider?preview=1&rehearsal=1`);
      await rider.page.getByRole("heading", { name: "PREVIEW-A", exact: true }).waitFor();
      await rider.page.getByRole("switch").click();
      assert.equal(requests.filter(req => req.method !== "GET").length, writesBeforePreview, "Preview wins over conflicting rehearsal parameter; no availability mutation");
      if (operational) {
        await admin.page.goto(`${origin}/admin?tab=settings`);
        const toggle = admin.page.getByRole("checkbox", { name: /^Enable delivery rider/ });
        await toggle.waitFor(); assert.equal(await toggle.isChecked(), true);
        await toggle.focus(); await admin.page.keyboard.press("Space"); assert.equal(await toggle.isChecked(), false);
        await admin.page.getByRole("button", { name: "Save Rider Setting", exact: true }).click();
        await admin.page.getByRole("status").filter({ hasText: "Delivery riders disabled." }).waitFor();
        await rider.page.goto(`${origin}/rider`);
        await rider.page.getByRole("switch", { name: /Availability disabled/ }).waitFor();
        assert.equal(await rider.page.getByRole("switch").isDisabled(), true);
        assert.equal((await Order.findById(order._id)).paymentStatus, "paid"); assert.equal(await Delivery.countDocuments(), second ? 2 : 1);
        console.log("PASS normal site mode: actual Admin Settings enable/disable persists; no rehearsal URL/flag, no record/payment loss");
      }
      assert.deepEqual(errors, []);
      console.log("PASS real isolated UI rehearsal: manager assignment → rider pickup → delivery (unpaid) → cash report (unconfirmed) → cashier receipt (paid, one shift movement)");
      console.log("PASS 390/820px rider and 1536px admin: keyboard, axe, no overflow, offline/no queue, error/retry, history privacy, read-only preview/no writes");
      console.log(`Screenshots: ${screenshots}`);
    } catch (error) {
      if (screenshots) for (const [index, context] of (browser?.contexts() || []).entries()) for (const page of context.pages()) { await page.screenshot({ path: path.join(screenshots, `failure-${index}.png`), fullPage: true }).catch(() => {}); console.log(`Local failure UI: ${(await page.locator("body").innerText().catch(() => "")).slice(-2200)}`); }
      console.log(`Rehearsal failure screenshots: ${screenshots || "not available"}`);
      throw error;
    } finally {
      await browser?.close();
      if (next.exitCode == null) { const stopped = new Promise(resolve => next.once("exit", resolve)); next.kill(); await stopped; }
      await new Promise(resolve => server.close(resolve));
    }
  });
} finally { for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
