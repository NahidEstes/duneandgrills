import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import express from "../../backend/node_modules/express/index.js";
import jwt from "../../backend/node_modules/jsonwebtoken/index.js";
import { withIsolatedMongo } from "../../backend/tests/helpers/isolatedMongo.js";
import User from "../../backend/models/User.js";
import InventoryItem from "../../backend/models/InventoryItem.js";
import InventoryCategory from "../../backend/models/InventoryCategory.js";
import {
  StockAlertRule as Rule,
  StockAlertNotification as Note,
} from "../../backend/models/StockAlert.js";
import {
  evaluateAlertRule,
  saveAlertRule,
} from "../../backend/services/stockAlertService.js";
import inventoryRoutes from "../../backend/routes/inventoryRoutes.js";
import { protect } from "../../backend/middleware/auth.js";
import { csrfProtection } from "../../backend/middleware/security.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "owned-stock-alert-browser-fixture";
const root = path.resolve(import.meta.dirname, ".."),
  output = path.resolve(root, "../output/stock-alerts-qa");
await mkdir(output, { recursive: true });
let browser,
  next,
  backend,
  logs = "",
  failCurrent = false;
await withIsolatedMongo(async () => {
  try {
    const admin = await User.create({
      name: "Stock QA Admin",
      email: "stock-browser@fixture.invalid",
      password: "OwnedStockPassword123!",
      role: "admin",
    });
    const reader = await User.create({
      name: "Stock QA Reader",
      email: "stock-reader@fixture.invalid",
      password: "OwnedStockPassword123!",
      role: "accountant",
    });
    const category = await InventoryCategory.create({
      name: "Sauces",
      skuPrefix: "SQ",
    });
    const sauce = await InventoryItem.create({
      name: "Burger Sauce",
      sku: "SQ-SAUCE",
      category: category._id,
      unit: "kg",
      currentStock: 0.8,
      reorderLevel: 1,
    });
    await InventoryItem.create({
      name: "Garlic Mayo",
      sku: "SQ-MAYO",
      category: category._id,
      unit: "kg",
      currentStock: 3,
      reorderLevel: 1,
    });
    const out = await InventoryItem.create({
      name: "Caramelized Onion",
      sku: "SQ-ONION",
      category: category._id,
      unit: "kg",
      currentStock: 0,
      reorderLevel: 0.5,
    });
    const app = express();
    app.use(express.json());
    app.use(csrfProtection);
    app.get(["/api/auth/me", "/api/auth/session"], protect, (req, res) =>
      res.json({
        success: true,
        user: { _id: req.user._id, name: req.user.name, role: req.user.role },
      }),
    );
    app.use(
      "/api/inventory",
      (req, res, done) =>
        failCurrent && req.path === "/stock-alerts/current"
          ? res.status(503).json({
              success: false,
              message: "Owned current alerts unavailable",
            })
          : done(),
      inventoryRoutes,
    );
    app.get("/api/settings/public", (_req, res) =>
      res.json({ success: true, data: { location: {}, openingHours: [] } }),
    );
    app.get("/api/cart", (_req, res) =>
      res.json({ success: true, data: { items: [] } }),
    );
    app.get("/api/orders/config", (_req, res) =>
      res.json({ success: true, data: {} }),
    );
    app.use((error, _req, res, _next) =>
      res
        .status(error.status || 400)
        .json({ success: false, message: error.message }),
    );
    backend = await new Promise((resolve) => {
      const handle = app.listen(0, "127.0.0.1", () => resolve(handle));
    });
    const probe = createServer();
    await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    const origin = `http://127.0.0.1:${port}`,
      env = {
        ...process.env,
        NODE_ENV: "production",
        BACKEND_API_URL: `http://127.0.0.1:${backend.address().port}/api`,
        SITE_URL: origin,
        SITE_ENV: "staging",
      };
    for (const key of Object.keys(env))
      if (
        /MONGO|DATABASE|JWT_SECRET|API_PROXY_SECRET|RESEND|CUSTOMER_EMAIL|STOCK_ALERT/i.test(
          key,
        )
      )
        delete env[key];
    next = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "-H",
        "127.0.0.1",
        "-p",
        String(port),
      ],
      { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    next.stdout.on("data", (value) => (logs += value));
    next.stderr.on("data", (value) => (logs += value));
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(origin + "/login")).ok) {
          ready = true;
          break;
        }
      } catch {}
      if (next.exitCode != null) throw Error(logs);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, "Owned Next server ready");
    const { chromium } = await import(
      process.env.PLAYWRIGHT_MODULE
        ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs"))
            .href
        : "playwright"
    );
    browser = await chromium.launch({ channel: "chrome", headless: true });
    for (const width of [1440, 390, 320]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        serviceWorkers: "block",
      });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("dialog", (dialog) => dialog.accept());
      const cookie = jwt.sign({ id: admin._id, sv: 0 }, process.env.JWT_SECRET);
      await context.addCookies([
        { name: "dg_session", value: cookie, url: origin, httpOnly: true },
        { name: "dg_csrf", value: "owned-stock-csrf", url: origin },
      ]);
      await page.goto(origin + "/inventory/low-stock-alerts");
      await page.getByRole("heading", { name: "Current shortages" }).waitFor();
      await page
        .getByRole("heading", { name: "Burger Sauce", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("heading", { name: "Garlic Mayo", exact: true })
          .count(),
        0,
      );
      if (width === 1440) {
        await page.screenshot({
          path: path.join(output, "desktop-current.png"),
          fullPage: true,
        });
        await page
          .getByRole("button", { name: "Alert rule", exact: true })
          .click();
        await page.getByRole("heading", { name: "New alert rule" }).waitFor();
        await page
          .getByRole("combobox", { name: "Stock item", exact: true })
          .click();
        await page
          .getByRole("textbox", { name: "Search stock item", exact: true })
          .fill("Burger Sauce");
        await page.getByRole("option", { name: /Burger Sauce/ }).click();
        await page.getByRole("combobox", { name: "Threshold unit" }).click();
        await page.getByRole("option", { name: "g", exact: true }).click();
        await page
          .getByLabel("Low-stock threshold", { exact: false })
          .fill("1000");
        await page.getByRole("checkbox", { name: /Stock QA Admin/ }).check();
        await page.setViewportSize({ width, height: 1700 });
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: path.join(output, "desktop-rule-editor.png"),
        });
        await page.setViewportSize({ width, height: 1000 });
        await page
          .getByRole("button", { name: "Save rule", exact: true })
          .click();
        await page
          .getByText(
            "Alert rule saved. Stock and purchasing settings are unchanged.",
          )
          .waitFor();
        const saved = await Rule.findOne({ item: sauce._id }).lean();
        assert.equal(saved.threshold, 1);
        await page.getByRole("button", { name: "Check due rules now" }).click();
        await page
          .getByText("Due rules checked. No inventory was changed.")
          .waitFor();
        assert.equal(await Note.countDocuments({ rule: saved._id }), 1);
        await page
          .getByRole("button", {
            name: "Stock alert notifications",
            exact: true,
          })
          .click();
        const panel = page.getByRole("region", {
          name: "Stock notifications",
          exact: true,
        });
        await panel
          .getByRole("heading", { name: "Low stock: Burger Sauce" })
          .waitFor();
        await page.screenshot({ path: path.join(output, "desktop-bell.png") });
        await panel
          .getByRole("button", { name: "Snooze 30 min", exact: true })
          .click();
        await panel.getByText("Snoozed", { exact: true }).waitFor();
        await page
          .getByRole("button", { name: "Close stock notifications" })
          .click();
        await page
          .getByRole("tab", { name: "Current Alerts", exact: true })
          .click();
        await page.waitForURL(/tab=current/);
        await page.reload();
        assert.match(page.url(), /tab=current/);
        await page
          .getByRole("heading", { name: "Current shortages" })
          .waitFor();
        await page
          .getByRole("tab", { name: "Alert Rules", exact: true })
          .click();
        await page.waitForURL(/tab=rules/);
        await page.goBack();
        await page
          .getByRole("heading", { name: "Current shortages" })
          .waitFor();
      }
      await page.goto(origin + "/inventory/low-stock-alerts?tab=rules");
      await page.getByRole("heading", { name: "Item alert rules" }).waitFor();
      await page
        .getByRole("button", { name: "Edit rule", exact: true })
        .first()
        .click();
      await page.getByRole("heading", { name: "Edit alert rule" }).waitFor();
      await page
        .getByLabel("Low-stock threshold", { exact: false })
        .fill("1100");
      await page
        .getByRole("button", { name: "Save rule", exact: true })
        .click();
      await page
        .getByText(
          "Alert rule saved. Stock and purchasing settings are unchanged.",
        )
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `No overflow at ${width}px`,
      );
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: path.join(output, `rules-${width}.png`),
        fullPage: true,
      });
      if (width === 390) {
        await page.getByRole("switch", { name: "Light mode" }).click();
        await page.screenshot({
          path: path.join(output, "rules-light-390.png"),
          fullPage: true,
        });
        await page.getByRole("switch", { name: "Light mode" }).click();
      }
      await page.goto(origin + "/inventory/expiry-tracking");
      await page
        .getByRole("heading", { name: "Expiry Tracking", exact: true })
        .waitFor();
      assert.equal(
        await page.getByRole("tab", { name: "Alert Rules" }).count(),
        0,
      );
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        `PASS stock alerts browser ${width}px: tabs, save/edit, no overflow, expiry unchanged`,
      );
    }
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    await context.addCookies([
      {
        name: "dg_session",
        value: jwt.sign({ id: reader._id, sv: 0 }, process.env.JWT_SECRET),
        url: origin,
        httpOnly: true,
      },
      { name: "dg_csrf", value: "owned-stock-csrf", url: origin },
    ]);
    const page = await context.newPage();
    await page.goto(origin + "/inventory/low-stock-alerts?tab=rules");
    await page.getByRole("heading", { name: "Item alert rules" }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Edit rule", exact: true })
        .count(),
      0,
    );
    const response = await context.request.post(
      `${origin}/api/inventory/stock-alerts/rules`,
      { headers: { "x-csrf-token": "owned-stock-csrf" }, data: {} },
    );
    assert.equal(response.status(), 403);
    failCurrent = true;
    await page.goto(origin + "/inventory/low-stock-alerts?tab=current");
    await page.getByRole("button", { name: /Retry/ }).first().waitFor();
    assert.equal(
      await page.getByText("No matching shortages", { exact: true }).count(),
      0,
    );
    await context.close();
    console.log(
      "PASS read-only UI/API and failed reads never imply healthy inventory",
    );
    assert.equal((await InventoryItem.findById(sauce._id)).currentStock, 0.8);
    assert.equal((await InventoryItem.findById(out._id)).currentStock, 0);
  } catch (error) {
    console.error(logs.slice(-4000));
    throw error;
  } finally {
    await browser?.close();
    if (next && next.exitCode == null) {
      const stopped = new Promise((resolve) => next.once("exit", resolve));
      next.kill();
      await stopped;
    }
    if (backend) {
      backend.closeAllConnections();
      await new Promise((resolve) => backend.close(resolve));
    }
  }
});
console.log(`Screenshots: ${output}`);
