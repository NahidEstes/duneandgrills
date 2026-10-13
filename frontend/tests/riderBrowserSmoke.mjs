import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildRiderPortal } from "../../backend/services/riderPortalService.js";

// Fully isolated HTTP fixtures. No real API, authentication secret, Mongo connection or server.js.
const requests = [];
let responseStatus = 200, previewAllowed = true, previewDelay = 0;
const fixture = createServer((req, res) => {
  requests.push({ method: req.method, path: req.url });
  const role = /dg_session=([^;]+)/.exec(req.headers.cookie || "")?.[1];
  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  const user = { _id: "111111111111111111111111", employeeId: "EMP-TEST", name: "Local Test Rider", role, email: "local@isolated.invalid", phone: "" };
  let status = 200, body;
  if (!role) { status = 401; body = { success: false, message: "Fixture session required" }; }
  else if (req.url === "/api/auth/session") body = { success: true, user };
  else if (["/api/rider/portal", "/api/rider/preview"].includes(pathname)) {
    if (responseStatus !== 200) { status = responseStatus; body = { success: false, message: "Fixture connection failure" }; }
    else try { body = { success: true, ...buildRiderPortal(user, { preview: req.url.endsWith("preview"), config: { previewEnabled: previewAllowed } }) }; }
    catch (error) { status = error.status; body = { success: false, message: error.message }; }
  } else { status = 404; body = { success: false, message: "Unexpected fixture endpoint" }; }
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "private, no-store" });
  if (req.url === "/api/rider/preview" && previewDelay) setTimeout(() => res.end(JSON.stringify(body)), previewDelay);
  else res.end(JSON.stringify(body));
});
await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
const portProbe = createServer(); await new Promise(resolve => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: path.resolve(import.meta.dirname, ".."), windowsHide: true,
  env: { ...process.env, NODE_ENV: "production", BACKEND_API_URL: `http://127.0.0.1:${fixture.address().port}/api` },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = ""; next.stdout.on("data", data => { serverOutput += data; }); next.stderr.on("data", data => { serverOutput += data; });
let browser;
try {
  for (let i = 0; i < 120; i++) {
    try { await fetch(`${origin}/rider`, { redirect: "manual" }); break; }
    catch { if (next.exitCode != null || i === 119) throw new Error(`Local Next server failed: ${serverOutput.slice(-2000)}`); await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  const unauthenticated = await fetch(`${origin}/rider`, { redirect: "manual" });
  assert.equal(unauthenticated.status, 307); assert.match(unauthenticated.headers.get("location"), /login/);
  const unauthorized = await fetch(`${origin}/rider`, { headers: { cookie: "dg_session=cashier" }, redirect: "manual" });
  assert.match(await unauthorized.text(), /access%3Ddenied|access=denied/);
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const screenshots = await mkdtemp(path.join(tmpdir(), "dg-rider-visual-"));
  for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1536, height: 1024 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript({ path: path.resolve(import.meta.dirname, "../node_modules/axe-core/axe.min.js") });
    await context.addCookies([{ name: "dg_session", value: "rider", url: origin }]);
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    requests.length = 0; responseStatus = 200; previewAllowed = true; previewDelay = 0;
    await page.goto(`${origin}/rider`);
    await page.getByRole("heading", { name: "Live delivery is not enabled" }).waitFor();
    assert.equal(await page.getByRole("switch").isDisabled(), true);
    assert.equal(await page.locator("article").count(), 0);
    assert.equal(await page.getByText("—", { exact: true }).count(), 2);
    previewDelay = 700;
    await page.getByRole("link", { name: "Open isolated demo preview" }).click();
    await page.getByRole("status").filter({ hasText: "Loading private rider workspace" }).waitFor();
    await page.getByRole("heading", { name: "PREVIEW-A", exact: true }).waitFor();
    previewDelay = 0;
    await page.screenshot({ path: path.join(screenshots, `rider-${viewport.width}.png`), fullPage: true });
    assert.equal(await page.locator("article").count(), 2);
    const switchControl = page.getByRole("switch"); await switchControl.click();
    assert.equal(await switchControl.getAttribute("aria-checked"), "true");
    await page.getByRole("button", { name: "Picked Up (0)" }).click();
    await page.getByRole("heading", { name: "No matching preview deliveries" }).waitFor();
    await page.getByRole("button", { name: "All (2)" }).click();
    const details = page.locator("article").first().locator("summary");
    await details.focus(); await page.keyboard.press("Enter");
    await page.getByText("Read-only synthetic preview", { exact: true }).first().waitFor();
    assert.equal(await page.locator("article").first().locator("details").getAttribute("open"), "");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const accessibility = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(row => ({ id: row.id, nodes: row.nodes.length })));
    assert.deepEqual(accessibility, []);
    await page.getByRole("link", { name: "History", exact: true }).click();
    await page.getByRole("heading", { name: "No matching delivery history" }).waitFor();
    assert.equal(await page.getByText("Synthetic delivery address", { exact: false }).count(), 0);
    await page.getByRole("link", { name: "Profile", exact: true }).click();
    await page.getByRole("region", { name: "Rider profile" }).waitFor();
    await page.getByText("EMP-TEST", { exact: true }).waitFor();
    await page.getByRole("link", { name: "Deliveries", exact: true }).click();
    await page.getByRole("heading", { name: "PREVIEW-A", exact: true }).waitFor();
    responseStatus = 503;
    await page.getByRole("button", { name: "Refresh rider workspace" }).click();
    await page.getByRole("heading", { name: "Retained data may be outdated" }).waitFor();
    assert.equal(await page.locator("article").count(), 2); assert.equal(await page.locator("time").count(), 1);
    responseStatus = 200;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("heading", { name: "PREVIEW-A", exact: true }).waitFor();
    previewAllowed = false;
    await page.getByRole("button", { name: "Refresh rider workspace" }).click();
    await page.getByRole("link", { name: "Return to private dashboard" }).waitFor();
    assert.equal(await page.locator("article").count(), 0);
    assert.ok(requests.every(row => row.method === "GET"));
    assert.ok(requests.every(row => ["/api/auth/session", "/api/rider/portal", "/api/rider/preview"].includes(row.path.split("?")[0])), JSON.stringify(requests));
    assert.deepEqual(errors, []);
    console.log(`PASS rider ${viewport.width}px: private access, disabled/demo states, keyboard details, navigation, filters, errors/retry, axe, no writes/customer APIs`);
    await context.close();
  }
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser?.close();
  if (next.exitCode == null) { const stopped = new Promise(resolve => next.once("exit", resolve)); next.kill(); await stopped; }
  await new Promise(resolve => fixture.close(resolve));
}
