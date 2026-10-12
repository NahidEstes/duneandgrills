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
import { enrollDelivery } from "../services/deliveryWorkflowService.js";

// No dotenv, real server.js, supplied database URI or external API. --manual holds
// this disposable replica set/API/UI open for a human rehearsal, until Ctrl+C.
const frontend = path.resolve(import.meta.dirname, "../../frontend");
const manual = process.argv.includes("--manual");
const keys = ["NODE_ENV", "MONGO_URI", "JWT_SECRET", "RIDER_WORKFLOW_ENABLED", "RIDER_PREVIEW_ENABLED"];
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
try {
  await withIsolatedMongo(async ({ uri }) => {
    Object.assign(process.env, { NODE_ENV: "test", MONGO_URI: uri, JWT_SECRET: "local-disposable-browser-rehearsal-only", RIDER_WORKFLOW_ENABLED: "true", RIDER_PREVIEW_ENABLED: "true" });
    const actors = {};
    for (const role of ["manager", "cashier", "rider"]) actors[role] = await User.create({ role, name: `Local ${role}`, email: `${role}@rehearsal.invalid`, password: "LocalDummy123!", riderAvailable: role === "rider" });
    actors.other = await User.create({ role: "rider", name: "Other local rider", email: "other@rehearsal.invalid", password: "LocalDummy123!", riderAvailable: false });
    const order = await Order.create({ orderNumber: "TEST-REHEARSAL-CASH", source: "website", orderType: "delivery", status: "ready", paymentStatus: "pending", totalAmount: 40, subtotal: 40,
      customer: { name: "Synthetic recipient", phone: "+0000000000", address: "Synthetic test address, not a real destination" },
      items: [{ menuItem: new mongoose.Types.ObjectId(), name: "Dummy dish", quantity: 2, price: 20 }], inventoryStatus: "not_required" });
    const enrolled = await enrollDelivery({ actor: actors.manager, orderId: order._id, payload: { reason: "Isolated browser rehearsal", expectedRevision: 0, idempotencyKey: "isolated-browser-enrollment" } });
    await PosShift.create({ cashier: actors.cashier._id, terminal: "LOCAL", openingCashHalala: 0, openedBy: actors.cashier._id, isOpen: true, status: "open" });
    const requests = [];
    let failReads = false;
    const app = express();
    app.use(express.json(), requestCorrelation, validateRequestStructure, csrfProtection);
    app.use((req, res, next) => {
      requests.push({ method: req.method, path: req.path });
      if (failReads && req.method === "GET" && req.path.startsWith("/api/deliveries") && !req.path.endsWith("/config")) return res.status(503).json({ success: false, message: "Isolated injected API failure" });
      next();
    });
    app.use("/api/auth", authRoutes); app.use("/api/deliveries", deliveryRoutes); app.use("/api/rider", riderRoutes);
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
        console.log(`Disposable rehearsal: ${origin}/admin/deliveries?rehearsal=1 and ${origin}/rider?rehearsal=1`);
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
        const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(row => ({ id: row.id, nodes: row.nodes.map(node => node.target) })));
        assert.deepEqual(violations, []);
      };
      const manager = await session(actors.manager, { width: 1536, height: 1024 });
      await manager.page.goto(`${origin}/admin/deliveries?rehearsal=1`);
      const row = manager.page.getByRole("row").filter({ hasText: order.orderNumber }); await row.waitFor();
      await row.getByRole("button", { name: "Assign", exact: true }).focus(); await manager.page.keyboard.press("Enter");
      await manager.page.getByRole("radio").first().check();
      await manager.page.screenshot({ path: path.join(screenshots, "admin-assignment-desktop.png"), fullPage: true });
      await assertLayout(manager.page);
      await manager.page.getByRole("button", { name: "Assign · Isolated Test", exact: true }).click();
      await manager.page.getByRole("status").filter({ hasText: "Confirmed by the server" }).waitFor();
      assert.equal(String((await Delivery.findById(enrolled.id)).rider), String(actors.rider._id));
      // Wait for the post-mutation reload before injecting the next failure. Otherwise
      // the old reload's error can be observed just before the manual refresh clears it.
      await row.getByText("Assigned", { exact: true }).waitFor();
      failReads = true;
      await manager.page.getByRole("button", { name: "Refresh deliveries", exact: true }).click();
      await manager.page.getByRole("alert").filter({ hasText: "Isolated injected API failure" }).waitFor();
      assert.equal(await manager.page.locator("time").count(), 0);
      failReads = false; await manager.page.getByRole("button", { name: "Retry deliveries" }).click(); await row.waitFor();
      const rider = await session(actors.rider, { width: 390, height: 844 });
      await rider.page.goto(`${origin}/rider?rehearsal=1`);
      await rider.page.getByRole("link", { name: "View Delivery" }).click();
      await rider.page.getByRole("button", { name: "Confirm Pickup", exact: true }).waitFor();
      assert.equal(await rider.page.getByRole("link", { name: "Call Customer" }).getAttribute("href"), "tel:+0000000000");
      await rider.page.screenshot({ path: path.join(screenshots, "rider-assigned-mobile.png"), fullPage: true });
      await assertLayout(rider.page);
      await rider.page.setViewportSize({ width: 820, height: 1180 });
      await rider.page.screenshot({ path: path.join(screenshots, "rider-assigned-tablet.png"), fullPage: true }); await assertLayout(rider.page);
      await rider.page.setViewportSize({ width: 390, height: 844 });
      const beforeOffline = requests.filter(req => req.method === "POST").length;
      await rider.context.setOffline(true); await rider.page.getByRole("button", { name: "Confirm Pickup", exact: true }).click();
      await rider.page.getByRole("alert").filter({ hasText: "No delivery action has been queued" }).waitFor();
      assert.equal(requests.filter(req => req.method === "POST").length, beforeOffline);
      await rider.context.setOffline(false);
      await rider.page.getByRole("button", { name: "Confirm Pickup", exact: true }).click();
      await rider.page.getByRole("button", { name: "Confirm Delivery", exact: true }).waitFor();
      await rider.page.getByRole("button", { name: "Confirm Delivery", exact: true }).click();
      await rider.page.getByLabel("Cash actually collected (SAR)").waitFor();
      assert.equal((await Order.findById(order._id)).paymentStatus, "pending");
      assert.equal(await rider.page.getByRole("link", { name: "Call Customer" }).count(), 0);
      await rider.page.getByLabel("Cash actually collected (SAR)").fill("40");
      await rider.page.getByRole("button", { name: "Report Cash · Not a Payment" }).click();
      await rider.page.getByText("Payment: pending · Cash report: unconfirmed", { exact: true }).waitFor();
      assert.equal(await CashMovement.countDocuments(), 0);
      const cashier = await session(actors.cashier, { width: 1536, height: 1024 });
      await cashier.page.goto(`${origin}/admin/deliveries?rehearsal=1`);
      await cashier.page.getByRole("row").filter({ hasText: order.orderNumber }).getByRole("button", { name: "Details", exact: true }).click();
      await cashier.page.getByLabel("Your open cashier terminal").fill("LOCAL");
      await cashier.page.getByRole("button", { name: "Confirm Cashier Receipt · Isolated Test" }).click();
      await cashier.page.getByRole("status").filter({ hasText: "Confirmed by the server" }).waitFor();
      assert.equal((await Order.findById(order._id)).paymentStatus, "paid");
      assert.equal(await CashMovement.countDocuments({ order: order._id }), 1);
      assert.equal((await CashMovement.findOne({ order: order._id })).amountHalala, 4000);
      assert.equal(await Order.countDocuments(), 1); assert.equal(await StockTransaction.countDocuments(), 0);
      await rider.page.getByRole("button", { name: "Refresh details", exact: true }).click();
      await rider.page.getByText("Payment: paid · Cash report: confirmed", { exact: true }).waitFor();
      await rider.page.getByRole("link", { name: "History", exact: true }).click();
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
      await manager.page.getByRole("status").filter({ hasText: "No record was assigned" }).waitFor();
      assert.equal(requests.filter(req => req.method !== "GET").length, writesBeforePreview);
      await rider.page.goto(`${origin}/rider?preview=1&rehearsal=1`);
      await rider.page.getByRole("heading", { name: "PREVIEW-A", exact: true }).waitFor();
      await rider.page.getByRole("switch").click();
      assert.equal(requests.filter(req => req.method !== "GET").length, writesBeforePreview, "Preview wins over conflicting rehearsal parameter; no availability mutation");
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
