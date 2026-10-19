import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setFixtureSession } from "./helpers/fixtureSession.mjs";

// Own both servers and intercept every browser API. No real staff accounts are used.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
const actor = { _id: "111111111111111111111111", name: "Test Admin", role: "admin" };
const fixture = http.createServer((request, response) => {
  const session = request.method === "GET" && request.url === "/api/auth/session" && request.headers.cookie?.includes("dg_session=owned-browser-admin");
  response.writeHead(session ? 200 : 503, { "Content-Type": "application/json" });
  response.end(JSON.stringify(session ? { user: actor } : { message: "Browser APIs must be intercepted" }));
});
await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
const reservation = net.createServer();
await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${reservation.address().port}`;
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const env = { ...process.env, NODE_ENV: "production", BACKEND_API_URL: `http://127.0.0.1:${fixture.address().port}/api`, SITE_URL: origin, SITE_ENV: "staging", NEXT_TELEMETRY_DISABLED: "1" };
for (const key of Object.keys(env)) if (/MONGO|DATABASE|JWT_SECRET|API_PROXY_SECRET|TOKEN/i.test(key)) delete env[key];
const next = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let serverError;
let serverLog = "";
next.on("error", error => { serverError = error; });
next.stdout.on("data", value => { serverLog = (serverLog + value).slice(-4000); });
next.stderr.on("data", value => { serverLog = (serverLog + value).slice(-4000); });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (serverError) throw serverError;
    if (next.exitCode !== null) throw new Error(serverLog);
    try { if ((await fetch(`${origin}/login`)).ok) { ready = true; break; } } catch { /* Wait for our server. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, "Owned production frontend is ready");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block" });
    try {
      await setFixtureSession(context, origin, "admin");
      const writes = [];
      const errors = [];
      let rejectSave = false;
      let staff = [];
      const shift = { _id: "222222222222222222222222", name: "Morning", startTime: "09:00", endTime: "17:00", isActive: true };
      await context.route("**/api/**", async route => {
        const request = route.request();
        const resource = new URL(request.url()).pathname.replace(/^\/api/, "");
        const method = request.method();
        let status = 200;
        let payload = { success: true, data: [] };
        if (resource === "/auth/me" || resource === "/auth/session") payload = { user: actor };
        else if (resource === "/cart") payload.data = { items: [], coupon: null };
        else if (resource === "/attendance/shifts") payload.data = [shift];
        else if (resource === "/admin/staff" && method === "GET") payload.data = staff;
        else if (resource.startsWith("/admin/staff") && method !== "GET") {
          const body = request.postDataJSON();
          writes.push({ resource, method, body });
          if (rejectSave) { status = 409; payload = { message: "Fixture email already exists" }; }
          else if (resource === "/admin/staff" || method === "PATCH") {
            staff = [{ ...staff[0], ...body, _id: "333333333333333333333333", employeeId: "EMP-001", defaultShift: body.defaultShift ? shift : null, isActive: true }];
            payload.data = staff[0];
          }
        }
        await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${origin}/admin/staff`);
      await page.getByText("No matching staff accounts.", { exact: true }).waitFor();
      const add = page.getByRole("button", { name: "Add staff", exact: true });
      await add.click();
      let dialog = page.getByRole("dialog", { name: "Add staff account", exact: true });
      assert.ok(await dialog.evaluate(element => element === document.activeElement), "Opening focuses the dialog");
      const type = async (field, value) => {
        await field.click();
        await field.pressSequentially(value, { delay: 20 });
        assert.equal(await field.inputValue(), value, "Every character is entered without clicking again");
        assert.ok(await field.evaluate(element => element === document.activeElement), "Typing retains input focus");
      };
      await type(dialog.getByLabel("Name", { exact: true }), "Sample Staff");
      await type(dialog.getByLabel("Email", { exact: true }), "staff@example.test");
      await type(dialog.getByLabel("Phone", { exact: true }), "0501234567");
      await type(dialog.locator('input[autocomplete="new-password"]'), "SamplePass1!");
      await type(dialog.locator('input[inputmode="numeric"]'), "123456");
      const pin = dialog.locator('input[inputmode="numeric"]');
      await pin.pressSequentially("7a");
      assert.equal(await pin.inputValue(), "123456", "Existing PIN length validation is retained");
      await pin.fill("");
      await pin.pressSequentially("12ab3456");
      assert.equal(await pin.inputValue(), "123456", "PIN still accepts digits only");
      await dialog.getByRole("checkbox", { name: "Enable Staff Clock access" }).check();
      await dialog.getByRole("combobox", { name: "Not assigned", exact: true }).click();
      await page.getByRole("option", { name: /Morning/ }).click();
      const role = dialog.getByRole("combobox", { name: "cashier", exact: true });
      await role.click();
      await page.keyboard.press("Escape");
      await page.getByRole("listbox").waitFor({ state: "hidden" });
      assert.equal(await dialog.isVisible(), true, "Escape closes an open dropdown before the form");
      await role.click();
      await page.getByRole("option", { name: "kitchen", exact: true }).click();
      await dialog.getByRole("button", { name: /Joining date/ }).click();
      const picker = page.getByRole("dialog", { name: "Choose date", exact: true });
      await picker.getByLabel("Enter date", { exact: true }).fill("19-10-2026");
      await picker.getByRole("button", { name: "Go", exact: true }).click();
      const create = dialog.getByRole("button", { name: "Create staff", exact: true });
      rejectSave = true;
      await create.click();
      await page.getByText("Fixture email already exists", { exact: true }).waitFor();
      assert.equal(await dialog.getByLabel("Name", { exact: true }).inputValue(), "Sample Staff");
      await dialog.getByLabel("Phone", { exact: true }).fill("");
      await type(dialog.getByLabel("Phone", { exact: true }), "0507654321");
      rejectSave = false;
      await create.click();
      await dialog.waitFor({ state: "hidden" });
      const created = writes.at(-1);
      assert.equal(created.resource, "/admin/staff");
      assert.equal(created.method, "POST");
      for (const [key, value] of Object.entries({ name: "Sample Staff", email: "staff@example.test", phone: "0507654321", role: "kitchen", password: "SamplePass1!", pin: "123456", attendanceEnabled: true, defaultShift: shift._id, joiningDate: "2026-10-19" })) assert.equal(created.body[key], value, key);
      assert.equal(Object.hasOwn(created.body, "employeeId"), false);

      await page.getByRole("button", { name: "Edit Sample Staff", exact: true }).click();
      dialog = page.getByRole("dialog", { name: "Edit staff profile", exact: true });
      const name = dialog.getByLabel("Name", { exact: true });
      await name.fill("");
      await type(name, "Updated Staff");
      await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(writes.at(-1).method, "PATCH");
      assert.equal(writes.at(-1).body.name, "Updated Staff");
      assert.equal(Object.hasOwn(writes.at(-1).body, "password"), false);

      for (const [mode, value] of [["password", "ChangedPass2!"], ["pin", "654321"]]) {
        await page.getByRole("button", { name: mode === "pin" ? "Reset attendance PIN for Updated Staff" : "Reset password for Updated Staff", exact: true }).click();
        dialog = page.getByRole("dialog", { name: mode === "pin" ? "Reset attendance PIN · Updated Staff" : "Reset password · Updated Staff", exact: true });
        await type(dialog.locator("input"), value);
        await dialog.getByRole("button", { name: mode === "pin" ? "Save new PIN" : "Save new password", exact: true }).click();
        await dialog.waitFor({ state: "hidden" });
        assert.ok(writes.at(-1).resource.endsWith(`/reset-${mode}`));
        assert.equal(writes.at(-1).body[mode], value);
      }

      await add.click();
      dialog = page.getByRole("dialog", { name: "Add staff account", exact: true });
      await type(dialog.getByLabel("Name", { exact: true }), "Unsaved Staff");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.ok(await add.evaluate(element => element === document.activeElement), "Closing returns focus to the opener");
      await add.click();
      assert.equal(await dialog.getByLabel("Name", { exact: true }).inputValue(), "", "Reopening resets the form");
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.deepEqual(errors, []);
      console.log(`PASS continuous typing, create/edit, failed save, password/PIN reset, Escape and focus restoration (${viewport.width}px)`);
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  if (next.exitCode === null && !serverError) {
    const stopped = new Promise(resolve => next.once("exit", resolve));
    next.kill();
    await stopped;
  }
  await new Promise(resolve => fixture.close(resolve));
}
