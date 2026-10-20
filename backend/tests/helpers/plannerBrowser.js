import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function runPlannerBrowser({ origin, tokens, today }) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../frontend"), url = `http://127.0.0.1:${port}`;
  const artifacts = process.env.PLANNER_ARTIFACT_DIR || path.join(os.tmpdir(), "dg-planner-review");
  await fs.mkdir(artifacts, { recursive: true });
  const env = { ...process.env, NODE_ENV: "production", BACKEND_API_URL: origin + "/api", SITE_URL: url, SITE_ENV: "staging", NEXT_TELEMETRY_DISABLED: "1" };
  for (const key of Object.keys(env)) if (/MONGO|DATABASE|JWT_SECRET|SECRET|TOKEN/i.test(key)) delete env[key];
  const child = spawn(process.execPath, [path.join(frontend, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: frontend, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let startupError, log = "";
  child.on("error", error => { startupError = error; });
  child.stdout.on("data", value => { log = (log + value).slice(-2000); }); child.stderr.on("data", value => { log = (log + value).slice(-2000); });
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      if (startupError) throw startupError;
      if (child.exitCode != null) throw new Error(log);
      try { if ((await fetch(url + "/login")).ok) { ready = true; break; } } catch { /* Owned server warming up. */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready);
    browser = await chromium.launch({ channel: "chrome", headless: true });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: "block" });
      await context.addCookies([{ name: "dg_session", value: tokens.admin, url, httpOnly: true, sameSite: "Lax" }, { name: "dg_csrf", value: "owned-planner-csrf", url, sameSite: "Lax" }]);
      const page = await context.newPage(), errors = [], forbiddenWrites = [], authWrites = [];
      page.setDefaultTimeout(15000); page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => dialog.accept());
      page.on("request", request => {
        const resource = new URL(request.url()).pathname;
        if (resource === "/api/auth/me") authWrites.push(resource);
        if (resource.startsWith("/api/") && !resource.startsWith("/api/planner") && !["GET", "HEAD"].includes(request.method())) forbiddenWrites.push(`${request.method()} ${resource}`);
      });
      try {
        await page.goto(url + "/admin/planner");
        await page.getByRole("heading", { name: "Restaurant Planner", exact: true }).waitFor();
        await page.getByRole("region", { name: "Planner task list", exact: true }).waitFor();
        assert.equal(await page.locator("html").getAttribute("lang"), "en");
        await page.screenshot({ path: path.join(artifacts, `planner-list-${viewport.width}.png`) });
        await page.getByRole("button", { name: "Add task", exact: true }).click();
        let modal = page.getByRole("dialog", { name: "Add planner task", exact: true });
        const saveBox = await modal.getByRole("button", { name: "Save task", exact: true }).boundingBox();
        assert.ok(saveBox.y >= 0 && saveBox.y + saveBox.height <= viewport.height, "Save remains visible before scrolling the form");
        const title = `Browser cleaning reminder ${viewport.width}`;
        await modal.getByLabel("Task title", { exact: true }).pressSequentially(title, { delay: 15 });
        assert.equal(await modal.getByLabel("Task title", { exact: true }).inputValue(), title);
        const choose = async (label, value) => { await modal.getByRole("combobox", { name: label, exact: true }).click(); await page.getByRole("option", { name: value, exact: true }).click(); };
        await choose("Planner category", "Cleaning & Maintenance");
        await choose("Planner priority", "High");
        await modal.getByLabel(/^Time/).fill("16:00");
        await choose("Planner repeat", "Weekly");
        await choose("Planner reference type", "Supplier invoice");
        await modal.getByRole("combobox", { name: "Linked record", exact: true }).click();
        await page.getByRole("option", { name: "INV-PLAN-001 · VENDOR-PLAN-001", exact: true }).click();
        await modal.getByRole("button", { name: "Add checklist item", exact: true }).click();
        await modal.getByRole("textbox", { name: "Checklist item 1", exact: true }).fill("Clean the grill");
        await modal.getByRole("button", { name: "Add checklist item", exact: true }).click();
        await modal.getByRole("textbox", { name: "Checklist item 2", exact: true }).fill("Sanitize preparation area");
        await modal.getByLabel("Notes", { exact: true }).fill("Reminder only: review the SAR 500 invoice, without recording payment.");
        const editorBox = await modal.locator("form > div").first().boundingBox();
        const finalSaveBox = await modal.getByRole("button", { name: "Save task", exact: true }).boundingBox();
        assert.ok(editorBox.y + editorBox.height <= finalSaveBox.y, "Footer does not cover the scrollable fields");
        assert.ok(finalSaveBox.y + finalSaveBox.height <= viewport.height, "Save stays visible after scrolling to Notes");
        assert.ok((await modal.getByRole("heading", { name: "Add planner task", exact: true }).boundingBox()).y >= 0, "The dialog heading stays visible");
        await page.screenshot({ path: path.join(artifacts, `planner-add-task-${viewport.width}.png`) });
        let failOnce = true;
        await page.route("**/api/planner", async route => {
          if (route.request().method() === "POST" && failOnce) { failOnce = false; return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Fixture save unavailable. Retry." }) }); }
          return route.continue();
        });
        await modal.getByRole("button", { name: "Save task", exact: true }).click();
        await modal.getByRole("alert").filter({ hasText: "Fixture save unavailable" }).waitFor();
        assert.equal(await modal.getByLabel("Task title", { exact: true }).inputValue(), title);
        await modal.getByRole("button", { name: "Save task", exact: true }).click();
        await modal.waitFor({ state: "hidden" });
        await page.getByRole("button", { name: `Complete ${title}`, exact: true }).click();
        await page.getByRole("button", { name: `Reopen ${title}`, exact: true }).waitFor();
        await page.getByRole("button", { name: "Completed", exact: true }).click();
        await page.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
        modal = page.getByRole("dialog", { name: "Edit planner task", exact: true });
        await modal.getByRole("checkbox", { name: "Complete checklist item 1", exact: true }).check();
        await modal.getByLabel("Notes", { exact: true }).fill("Updated reminder notes. No financial change.");
        await modal.getByRole("button", { name: "Save changes", exact: true }).click();
        await modal.waitFor({ state: "hidden" });
        await page.getByRole("button", { name: "Calendar", exact: true }).click();
        await page.getByText("Selected day", { exact: true }).waitFor();
        const todayLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${today}T12:00:00+03:00`));
        await page.getByRole("button", { name: new RegExp(`^${todayLabel},`) }).click();
        await page.screenshot({ path: path.join(artifacts, `planner-calendar-${viewport.width}.png`) });
        await page.getByRole("button", { name: "Next month", exact: true }).click();
        await page.getByText("Selected day", { exact: true }).waitFor();
        await page.getByRole("button", { name: "Previous month", exact: true }).click();
        await page.getByRole("button", { name: "List", exact: true }).click();
        await page.getByRole("button", { name: "Today", exact: true }).click();
        await page.getByRole("button", { name: `Delete ${title}`, exact: true }).click();
        await page.getByRole("button", { name: `Delete ${title}`, exact: true }).waitFor({ state: "hidden" });
        await page.getByRole("button", { name: "Add task", exact: true }).click();
        await page.getByRole("dialog", { name: "Add planner task", exact: true }).getByLabel("Task title", { exact: true }).pressSequentially("Unsaved reminder");
        await page.keyboard.press("Escape");
        await page.getByRole("dialog", { name: "Add planner task", exact: true }).waitFor({ state: "hidden" });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "No page-level horizontal overflow");
        assert.deepEqual(errors, []); assert.deepEqual(forbiddenWrites, []); assert.deepEqual(authWrites, [], "Planner session checks use the read-only auth endpoint");
        console.log(`PASS Planner list/calendar/form, continuous typing, failed save/retry, checklist/completion/deletion, read-only auth and no business writes (${viewport.width}px)`);
      } catch (error) { await page.screenshot({ path: path.join(artifacts, `failure-${viewport.width}.png`) }).catch(() => {}); throw error; }
      finally { await context.close(); }
    }
    console.log(`Planner screenshots: ${artifacts}`);
  } finally {
    await browser?.close();
    if (child.exitCode === null && !startupError) { const stopped = new Promise(resolve => child.once("exit", resolve)); child.kill(); await stopped; }
  }
}
