import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

// Own both servers; never call a configured application backend, database or staging URL.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let sessionChecks = 0;
const fixture = http.createServer((request, response) => {
  const role = /(?:^|;\s*)dg_session=owned-browser-(admin|manager|cashier|kitchen|customer)(?:;|$)/.exec(request.headers.cookie || "")?.[1];
  const session = request.method === "GET" && request.url === "/api/auth/session";
  if (session) sessionChecks++;
  response.writeHead(session ? role ? 200 : 401 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(session && role ? { user: { _id: "111111111111111111111111", name: "Owned SSR fixture", role } } : { success: false, message: "Owned fixture: browser APIs must be intercepted" }));
});
await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV: "production", BACKEND_API_URL: `http://127.0.0.1:${fixture.address().port}/api`, SITE_URL: origin, SITE_ENV: "staging", NEXT_TELEMETRY_DISABLED: "1" };
for (const key of Object.keys(env)) if (/MONGO|DATABASE|JWT_SECRET|API_PROXY_SECRET|TOKEN/i.test(key)) delete env[key];
const next = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let startupError; next.on("error", error => { startupError = error; }); next.stdout.on("data", () => {}); next.stderr.on("data", () => {});
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (startupError) throw startupError;
    if (next.exitCode != null) throw new Error(`Owned Next server exited: ${next.exitCode}`);
    try { if ((await fetch(origin + "/login")).ok) { ready = true; break; } } catch {}
    await pause(500);
  }
  assert.ok(ready, "Owned Next server is ready");
  for (const file of ["orderingInterfacesBrowserSmoke.mjs", "posBrowserSmoke.mjs", "adminReportingBrowserSmoke.mjs"]) {
    const exit = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["tests/" + file], { cwd: root, windowsHide: true, stdio: "inherit", env: { ...env, ORDERING_SMOKE_URL: origin, POS_SMOKE_URL: origin + "/pos", REPORTING_SMOKE_URL: origin } });
      child.on("error", reject); child.on("exit", resolve);
    });
    console.log(`${file}: exit=${exit}`); if (exit !== 0) process.exitCode = 1;
  }
  assert.ok(sessionChecks > 0, "Fixtures exercised the real server layout authentication boundary");
} finally {
  if (next.exitCode == null && !startupError) { const stopped = new Promise(resolve => next.once("exit", resolve)); next.kill(); await stopped; }
  await new Promise(resolve => fixture.close(resolve));
}
