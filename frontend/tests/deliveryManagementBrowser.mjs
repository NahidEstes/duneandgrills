import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { serializeDelivery } from "../../backend/services/deliveryContractService.js";
import { managementDeliveryQuery, activeAttentionMatch } from "../../backend/services/deliveryQueryService.js";
import { buildDeliveryTimeline } from "../../backend/services/deliveryTimelineService.js";

// Owned loopback HTTP fixtures only. Real read/query contracts; no Mongo, .env,
// real settings/orders/payments or production API. Writes below simulate responses.
const now = new Date("2026-10-14T10:00:00Z"), past = "2026-10-13T08:00:00Z";
const riderA = "111111111111111111111111", riderB = "222222222222222222222222", riderC = "333333333333333333333333";
let records, riders, enabled = true, failList = false, conflict = false, held = false, release, cashMovements = 0;
const requests = [], committed = new Map();
const make = (id, status = "unassigned", report = "none") => ({
  delivery: { _id: id, rider: status === "unassigned" ? null : riderA, status, revision: 2, createdAt: past, assignedAt: status === "unassigned" ? null : past, pickedUpAt: status === "picked_up" || status === "delivered" ? past : null, deliveredAt: status === "delivered" ? past : null, pickupInstructions: "Fixture restaurant pickup counter", deliveryNote: "PRIVATE fixture delivery note", assignmentHistory: [], issueHistory: [],
    ...(status === "issue" ? { issue: { reason: "Fixture road obstruction", previousStatus: "picked_up", reportedAt: past } } : {}),
    cashReport: { status: report, amountHalala: report === "none" ? null : report === "discrepancy" ? 3000 : 4200, reportedAt: report === "none" ? null : past, confirmedAt: report === "confirmed" ? now.toISOString() : null } },
  order: { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", orderNumber: `TEST-ADMIN-${id}`, __v: 4, status: status === "delivered" ? "delivered" : ["picked_up", "issue"].includes(status) ? "out-for-delivery" : "ready", readyAt: past, source: "website", deliveryMode: "restaurant", orderType: "delivery", inventoryStatus: "not_required", paymentStatus: report === "confirmed" ? "paid" : "pending", totalAmount: 42, customer: { name: "Fixture customer", phone: "+0000000000", address: "PRIVATE fixture address" }, items: [{ name: "Fixture burger", price: 42, quantity: 1, itemNote: "PRIVATE fixture item note" }] },
});
const reset = () => {
  records = [...Array.from({ length: 23 }, (_, index) => make(`WAIT-${index + 1}`)), make("ASSIGNED", "assigned"), make("NO-CLOCK", "assigned"), make("TRANSIT", "picked_up"), make("ISSUE", "issue"), make("COLLECT", "delivered"), make("REPORTED", "delivered", "unconfirmed"), make("SHORT", "delivered", "discrepancy"), make("CONFIRMED", "delivered", "confirmed")];
  records.find(row => row.delivery._id === "NO-CLOCK").delivery.assignedAt = null;
  riders = [{ id: riderA, name: "Fixture rider A", available: true, activeCount: 4 }, { id: riderB, name: "Fixture rider B", available: true, activeCount: 0 }, { id: riderC, name: "Unavailable fixture rider", available: false, activeCount: 0 }];
  enabled = true; failList = false; conflict = false; held = false; cashMovements = 0; committed.clear();
};
const valueAt = (row, key) => key.split(".").reduce((value, part) => value?.[part], row);
const equal = (a, b) => String(a) === String(b);
const matches = (row, match) => Object.entries(match).every(([key, condition]) => {
  if (key === "$and") return condition.every(value => matches(row, value));
  if (key === "$or") return condition.some(value => matches(row, value));
  const value = valueAt(row, key);
  if (condition && typeof condition === "object" && !(condition instanceof Date) && !condition._bsontype) return Object.entries(condition).every(([op, expected]) => op === "$ne" ? !equal(value, expected) : op === "$gte" ? !!value && new Date(value) >= expected : op === "$lt" ? !!value && new Date(value) < expected : op === "$in" ? expected.some(item => equal(value, item)) : false);
  return equal(value, condition);
});
const readRows = role => records.filter(row => role !== "cashier" || (row.delivery.status === "delivered" && row.delivery.cashReport.status !== "none")).map(({ delivery, order }) => {
  const pickupClock = delivery.assignedAt && order.readyAt ? new Date(Math.max(new Date(delivery.assignedAt), new Date(order.readyAt))).toISOString() : null;
  const attentionFlags = { ready_unassigned: delivery.status === "unassigned" && order.status === "ready", pickup_delayed: delivery.status === "assigned" && !!pickupClock, delivery_delayed: delivery.status === "picked_up" && !!delivery.pickedUpAt, issue: delivery.status === "issue", timing_unavailable: (delivery.status === "assigned" && !pickupClock) || (delivery.status === "picked_up" && !delivery.pickedUpAt), no_cash_report: delivery.status === "delivered" && delivery.cashReport.status === "none", awaiting_cash: delivery.cashReport.status === "unconfirmed", discrepancy: delivery.cashReport.status === "discrepancy" };
  return { ...delivery, orderRecord: order, healthEligible: true, pickupClock, attentionFlags, healthCash: serializeDelivery(delivery, order).cashState };
});
const list = (role, query) => {
  const all = readRows(role), parsed = managementDeliveryQuery({ role }, query, now);
  let selected = all.filter(row => matches(row, parsed.match) && (query.status === "all" || !query.status || row.status === query.status) && (!query.search || row.orderRecord.orderNumber.toLowerCase().includes(query.search.toLowerCase())));
  if (query.attention && query.attention !== "all") selected = selected.filter(row => query.attention === "needs_attention" ? matches(row, activeAttentionMatch()) : row.attentionFlags[query.attention]);
  if (query.cashStatus && query.cashStatus !== "all") selected = selected.filter(row => row.healthCash === (query.cashStatus === "confirmed_today" ? "confirmed" : query.cashStatus));
  const clock = parsed.stages[0].$set.managementSortClock.slice(1), direction = parsed.stages[2].$sort.managementSortClock;
  selected.sort((a, b) => !valueAt(a, clock) ? 1 : !valueAt(b, clock) ? -1 : direction * (new Date(valueAt(a, clock)) - new Date(valueAt(b, clock))) || direction * String(a._id).localeCompare(String(b._id)));
  const page = Number(query.page || 1), limit = Number(query.limit || 20), counts = Object.fromEntries(["unassigned", "assigned", "picked_up", "issue", "delivered"].map(status => [status, all.filter(row => row.status === status).length]));
  const cash = Object.fromEntries(["collection_pending", "awaiting_confirmation", "discrepancy", "confirmed", "no_collection", "unavailable"].map(key => { const group = all.filter(row => row.healthCash === key); return [key, { count: group.length, amountHalala: group.reduce((sum, row) => sum + (key === "collection_pending" ? 4200 : row.cashReport.amountHalala || 0), 0) }]; }));
  const deliveredCash = Object.fromEntries(Object.keys(cash).map(key => { const group = all.filter(row => row.status === "delivered" && row.healthCash === key); return [key, { count: group.length, amountHalala: group.reduce((sum, row) => sum + (key === "collection_pending" ? 4200 : row.cashReport.amountHalala || 0), 0) }]; }));
  return { success: true, mode: "operational", operationalEnabled: true, counts, serverNow: now, pagination: { page, limit, total: selected.length }, appliedFilters: parsed.applied,
    deliveries: selected.slice((page - 1) * limit, page * limit).map(row => ({ ...serializeDelivery(row, row.orderRecord, { name: riders.find(rider => rider.id === row.rider)?.name }), pickupClock: row.pickupClock, attention: Object.keys(row.attentionFlags).filter(key => row.attentionFlags[key]) })),
    ...(role !== "cashier" ? { riderFilters: riders } : {}), health: { thresholds: { pickupMinutes: 15, deliveryMinutes: 45 }, activeAttentionCount: all.filter(row => matches(row, activeAttentionMatch())).length, attention: Object.fromEntries(["ready_unassigned", "pickup_delayed", "delivery_delayed", "issue", "timing_unavailable", "no_cash_report", "awaiting_cash", "discrepancy"].map(key => [key, all.filter(row => row.attentionFlags[key]).length])), cash, deliveredCash, confirmedToday: { ...deliveredCash.confirmed, start: now, endExclusive: now } } };
};
reset();
const fixture = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1"), role = /dg_session=([^;]+)/.exec(req.headers.cookie || "")?.[1], query = Object.fromEntries(url.searchParams);
  const request = { path: url.pathname, method: req.method, query, role }; requests.push(request);
  let status = 200, body;
  try {
    if (!role) { status = 401; body = { success: false }; }
    else if (["/api/auth/session", "/api/auth/me"].includes(url.pathname)) body = { success: true, user: { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Local management fixture", role } };
    else if (url.pathname === "/api/deliveries/config") body = { success: true, operationalEnabled: enabled, workflowEnabled: false, previewAvailable: false };
    else if (url.pathname === "/api/deliveries/riders") { assert.notEqual(role, "cashier"); body = { success: true, data: riders }; }
    else if (url.pathname === "/api/deliveries" && req.method === "GET") {
      if (failList) { status = 503; body = { success: false, message: "Isolated management read failure" }; } else body = list(role, query);
    } else if (url.pathname === "/api/deliveries/enrollment-order") { assert.notEqual(role, "cashier"); body = { success: true, data: { id: "EXISTING", orderNumber: "TEST-EXISTING", revision: 4, source: "website", orderType: "delivery", status: "ready" } }; }
    else if (req.method === "GET" && url.pathname.startsWith("/api/deliveries/")) {
      const record = records.find(row => row.delivery._id === url.pathname.split("/").at(-1)); assert.ok(record);
      if (role === "cashier") assert.equal(record.delivery.status, "delivered");
      body = { success: true, mode: "operational", operationalEnabled: true, data: { ...serializeDelivery(record.delivery, record.order, { name: "Fixture rider" }, { detail: true }), timeline: buildDeliveryTimeline(record.delivery, record.order) } };
    } else if (req.method === "POST") {
      let raw = ""; for await (const chunk of req) raw += chunk; const payload = request.body = JSON.parse(raw);
      if (held) await new Promise(resolve => { release = resolve; });
      if (committed.has(payload.idempotencyKey)) body = { ...committed.get(payload.idempotencyKey), duplicate: true };
      else if (url.pathname === "/api/deliveries/orders/EXISTING/enroll") { assert.notEqual(role, "cashier"); assert.ok(payload.reason.trim()); assert.equal(payload.expectedRevision, 4); records.push(make("EXISTING")); body = { success: true }; committed.set(payload.idempotencyKey, body); }
      else {
        const [id, action] = url.pathname.split("/").slice(-2), record = records.find(row => row.delivery._id === id); assert.ok(record);
        assert.ok(payload.idempotencyKey.length >= 16);
        if (conflict || payload.expectedRevision !== record.delivery.revision) { conflict = false; record.delivery.revision++; status = 409; body = { success: false, message: "Delivery changed; refresh and review" }; }
        else if (action === "confirm_cash" && payload.terminal !== "LOCAL") { status = 409; body = { success: false, message: "Open your cashier shift on the selected terminal" }; }
        else {
          if (action === "assign") { assert.notEqual(role, "cashier"); assert.ok(["unassigned", "assigned"].includes(record.delivery.status)); assert.ok(riders.some(row => row.id === payload.riderId && row.available)); assert.notEqual(record.delivery.rider, payload.riderId); if (record.delivery.rider) assert.ok(payload.reason.trim()); record.delivery.rider = payload.riderId; record.delivery.status = "assigned"; record.delivery.assignedAt = now.toISOString(); }
          else if (action === "confirm_cash") { assert.equal(record.delivery.cashReport.status, "unconfirmed"); record.delivery.cashReport.status = "confirmed"; record.delivery.cashReport.confirmedAt = now.toISOString(); record.order.paymentStatus = "paid"; cashMovements++; }
          else if (action === "acknowledge_cash") { assert.notEqual(role, "cashier"); assert.equal(record.delivery.cashReport.status, "discrepancy"); assert.ok(payload.reason.trim()); record.delivery.cashReport.acknowledgedAt = now.toISOString(); }
          else throw Error("Unexpected action");
          record.delivery.revision++; body = { success: true }; committed.set(payload.idempotencyKey, body);
        }
      }
    } else { status = 404; body = { success: false, message: "Unexpected fixture endpoint" }; }
  } catch (error) { status = error.status || 403; body = { success: false, message: error.message }; }
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "private, no-store" }); res.end(JSON.stringify(body));
});
await new Promise(resolve => fixture.listen(0, "127.0.0.1", resolve));
const probe = createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], { cwd: path.resolve(import.meta.dirname, ".."), windowsHide: true, env: { ...process.env, NODE_ENV: "production", SITE_URL: origin, BACKEND_API_URL: `http://127.0.0.1:${fixture.address().port}/api` }, stdio: ["ignore", "pipe", "pipe"] });
let output = "", browser; next.stdout.on("data", value => { output += value; }); next.stderr.on("data", value => { output += value; });
const until = async predicate => { for (let n = 0; n < 120 && !predicate(); n++) await new Promise(resolve => setTimeout(resolve, 25)); assert.ok(predicate()); };
try {
  for (let n = 0; n < 120; n++) { try { await fetch(origin + "/admin/deliveries", { redirect: "manual" }); break; } catch { if (next.exitCode != null || n === 119) throw Error(output.slice(-1500)); await new Promise(resolve => setTimeout(resolve, 250)); } }
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright"); browser = await chromium.launch({ channel: "chrome", headless: true });
  const screenshots = await mkdtemp(path.join(tmpdir(), "dg-delivery-management-redesign-"));
  for (const viewport of [{ width: 320, height: 760 }, { width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 1000 }]) {
    reset();
    const context = await browser.newContext({ viewport, serviceWorkers: "block" }); await context.addCookies([{ name: "dg_session", value: "manager", url: origin }, { name: "dg_csrf", value: "local-csrf", url: origin }]); await context.addInitScript({ path: path.resolve(import.meta.dirname, "../node_modules/axe-core/axe.min.js") });
    const page = await context.newPage(), errors = []; page.on("pageerror", error => errors.push(error.message));
    const surface = viewport.width >= 1024 ? page.locator("table") : page.locator('[aria-label="Delivery cards"]');
    const count = () => requests.filter(row => row.path === "/api/deliveries" && row.method === "GET" && row.role === "manager").length;
    const tab = label => page.getByRole("tab", { name: label, exact: true });
    const choose = async (label, option) => { await page.getByRole("combobox", { name: label, exact: true }).click(); await page.getByRole("option", { name: option, exact: true }).click(); };
    const explicit = async action => { const response = page.waitForResponse(row => row.url().includes("/api/deliveries?") && row.request().method() === "GET"); await action(); await response; await page.getByRole("button", { name: "Refresh deliveries", exact: true }).waitFor({ state: "visible" }); await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(node => node.textContent === "Refresh deliveries")?.disabled); };
    const layout = async (target = page) => { assert.equal(await target.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); assert.equal(await target.evaluate(() => [...document.querySelectorAll("dialog[open]")].every(node => { const r = node.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; })), true); assert.deepEqual(await target.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(row => ({ id: row.id, nodes: row.nodes.map(node => node.target) }))), []); };
    await page.goto(origin + "/admin/deliveries"); await page.getByRole("button", { name: "Rider Needed 23", exact: true }).waitFor();
    assert.equal(await tab("Active Deliveries").getAttribute("aria-selected"), "true"); assert.equal(await page.getByRole("group", { name: "Applied delivery filters" }).count(), 0);
    assert.equal(await page.getByRole("combobox", { name: "Date period" }).isVisible(), false);
    assert.equal(await page.getByRole("button", { name: "Food ready · no rider 23", exact: false }).isVisible(), false);
    await layout(); await page.screenshot({ path: path.join(screenshots, `active-${viewport.width}.png`), fullPage: true }); await page.screenshot({ path: path.join(screenshots, `active-viewport-${viewport.width}.png`) });
    await tab("Active Deliveries").focus(); await explicit(() => page.keyboard.press("ArrowRight"));
    assert.equal(await tab("Cash & Settlement").getAttribute("aria-selected"), "true"); assert.equal(await tab("Cash & Settlement").evaluate(node => node === document.activeElement), true, "Keyboard tab focus survives its explicit read");
    await explicit(() => page.keyboard.press("ArrowRight")); assert.equal(await tab("History").getAttribute("aria-selected"), "true"); await explicit(() => page.keyboard.press("Home"));
    for (const [name, key, value, total] of [["Rider Needed 23", "status", "unassigned", 23], ["Awaiting Pickup 2", "status", "assigned", 2], ["On the Way 1", "status", "picked_up", 1], ["Needs Attention 27", "attention", "needs_attention", 27]]) {
      await explicit(() => page.getByRole("button", { name, exact: true }).click()); assert.equal(requests.filter(row => row.path === "/api/deliveries").at(-1).query[key], value); await page.getByText(`${total} matching records`, { exact: true }).waitFor();
    }
    await explicit(() => page.getByRole("button", { name: "Clear filters", exact: true }).click());
    const search = page.getByPlaceholder("Search order number…"); const beforeDraft = count(); await search.fill("NO-MATCH"); await page.getByRole("button", { name: "More Filters", exact: false }).click(); await choose("Delivery status", "Assigned");
    await page.clock.install(); await page.clock.fastForward(65_000); await page.evaluate(() => { dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); }); assert.equal(count(), beforeDraft); await page.clock.resume();
    await explicit(() => search.press("Enter")); await page.getByRole("heading", { name: "No matching active deliveries" }).waitFor();
    await page.getByRole("button", { name: "1 delivery issue · Review", exact: true }).waitFor();
    await explicit(() => page.getByRole("button", { name: "Remove filter: Order: NO-MATCH", exact: true }).click()); assert.equal(await page.getByRole("button", { name: "Remove filter: Assigned", exact: true }).count(), 1);
    await explicit(() => page.getByRole("button", { name: "Clear filters", exact: true }).click());
    await explicit(() => page.getByRole("button", { name: "Next", exact: true }).click());
    await surface.getByText("TEST-ADMIN-ISSUE", { exact: true }).waitFor();
    await explicit(() => page.getByRole("button", { name: "Needs Attention 27", exact: true }).click()); assert.equal(requests.filter(row => row.path === "/api/deliveries").at(-1).query.page, "1");
    await page.getByText("View all alerts", { exact: true }).click(); await explicit(() => page.getByRole("button", { name: /Unresolved issue 1/ }).click()); await surface.getByText("TEST-ADMIN-ISSUE", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Review Issue", exact: true }).click(); const drawer = page.getByRole("dialog", { name: "Delivery details & actions", exact: true });
    await drawer.getByText("Fixture road obstruction", { exact: true }).first().waitFor(); assert.equal(await drawer.getByRole("radio").count(), 0); assert.equal(await drawer.getByLabel("Your open cashier terminal").count(), 0); await layout(); await page.keyboard.press("Escape");
    await explicit(() => page.getByRole("button", { name: "Clear filters", exact: true }).click());
    await page.getByRole("region", { name: "Delivery orders" }).getByRole("button", { name: "Assign Rider", exact: true }).first().click(); await drawer.getByRole("radio").first().waitFor();
    assert.equal(await drawer.getByRole("radio").last().isDisabled(), true); assert.equal(await drawer.getByLabel("Your open cashier terminal").count(), 0); assert.equal(await drawer.locator("details[open]").count(), 0);
    await drawer.getByRole("radio").nth(1).check(); await drawer.getByText("Customer details", { exact: true }).click(); await drawer.getByText("PRIVATE fixture address", { exact: true }).waitFor();
    await drawer.getByText("Order Summary", { exact: true }).click(); await drawer.getByText("PRIVATE fixture item note", { exact: true }).waitFor();
    for (let n = 0; n < 12; n++) { await page.keyboard.press("Tab"); assert.equal(await page.evaluate(() => document.querySelector("dialog[open]").contains(document.activeElement)), true); }
    await layout(); await page.screenshot({ path: path.join(screenshots, `assignment-drawer-${viewport.width}.png`) });
    await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Open selected delivery", exact: true }).click(); assert.equal(await drawer.getByRole("radio").nth(1).isChecked(), true); assert.equal(await drawer.locator("details[open]").count(), 2);
    await drawer.getByRole("button", { name: "Refresh selected & list", exact: true }).click(); await until(() => !held); await drawer.getByRole("button", { name: "Assign Rider", exact: true }).waitFor();
    await drawer.getByRole("button", { name: "Assign Rider", exact: true }).click(); const confirm = page.getByRole("dialog", { name: "Confirm rider assignment", exact: true }); await confirm.getByText("Fixture rider B", { exact: true }).waitFor();
    held = true; release = null; const postCount = requests.filter(row => row.method === "POST").length; await confirm.getByRole("button", { name: "Confirm assignment", exact: true }).evaluate(node => { node.click(); node.click(); }); await until(() => requests.filter(row => row.method === "POST").length === postCount + 1 && !!release);
    assert.equal(await confirm.getByRole("button", { name: "Go back", exact: true }).isDisabled(), true); held = false; release(); await drawer.getByRole("button", { name: "I reviewed the latest delivery", exact: true }).waitFor(); await drawer.getByRole("button", { name: "I reviewed the latest delivery", exact: true }).click();
    assert.equal(await drawer.getByRole("button", { name: "Reassign Rider", exact: true }).isDisabled(), true);
    await drawer.getByRole("radio").first().check(); await drawer.getByLabel("Reassignment reason", { exact: false }).fill("Fixture authorized reassignment");
    await drawer.getByRole("button", { name: "Reassign Rider", exact: true }).click(); await confirm.getByText("Fixture authorized reassignment", { exact: true }).waitFor(); await confirm.getByRole("button", { name: "Go back", exact: true }).click();
    await drawer.getByRole("button", { name: "Reassign Rider", exact: true }).click(); conflict = true; await confirm.getByRole("button", { name: "Confirm reassignment", exact: true }).click(); await confirm.getByRole("alert").filter({ hasText: "Delivery changed" }).waitFor(); assert.equal(await confirm.getByRole("button", { name: "Confirm reassignment", exact: true }).isDisabled(), true); await confirm.getByRole("button", { name: "Go back", exact: true }).click(); await drawer.getByRole("button", { name: "Refresh selected & list", exact: true }).click(); await drawer.getByRole("button", { name: "I reviewed the latest delivery", exact: true }).click();
    riders[0].available = false; await drawer.getByRole("button", { name: "Refresh selected & list", exact: true }).click(); await drawer.getByText("Your retained rider selection is unavailable", { exact: false }).waitFor(); assert.equal(await drawer.getByRole("radio").first().isChecked(), true); assert.equal(await drawer.getByRole("button", { name: "Reassign Rider", exact: true }).isDisabled(), true); riders[0].available = true;
    await page.keyboard.press("Escape"); const stamp = await page.locator("time[datetime]").first().getAttribute("datetime"); failList = true; await page.getByRole("button", { name: "Refresh deliveries", exact: true }).click(); await page.getByRole("alert").filter({ hasText: "Retained results may be outdated" }).waitFor(); assert.equal(await page.locator("time[datetime]").first().getAttribute("datetime"), stamp); failList = false; await explicit(() => page.getByRole("button", { name: "Retry deliveries", exact: true }).click());
    await explicit(() => tab("Cash & Settlement").click()); assert.equal(await page.getByRole("button", { name: "Remove filter: Needs Attention", exact: true }).count(), 0); await layout(); await page.screenshot({ path: path.join(screenshots, `cash-${viewport.width}.png`), fullPage: true });
    for (const [name, state] of [[/Collection pending 42.00 SAR/, "collection_pending"], [/Rider reported · Cashier pending 42.00 SAR/, "awaiting_confirmation"], [/Discrepancy 30.00 SAR/, "discrepancy"], [/Confirmed today 42.00 SAR/, "confirmed_today"]]) {
      await explicit(() => page.getByRole("button", { name }).click()); assert.equal(requests.filter(row => row.path === "/api/deliveries").at(-1).query.cashStatus, state); await page.getByText("1 matching records", { exact: true }).waitFor();
    }
    await explicit(() => page.getByRole("button", { name: "Clear filters", exact: true }).click());
    const cashRow = viewport.width >= 1024 ? page.getByRole("row").filter({ hasText: "TEST-ADMIN-REPORTED" }) : page.getByRole("article").filter({ hasText: "TEST-ADMIN-REPORTED" }); await cashRow.getByRole("button", { name: "Review Cash", exact: true }).click(); await drawer.getByLabel("Your open cashier terminal").fill("LOCAL");
    assert.equal(await drawer.getByRole("radio").count(), 0); await drawer.getByRole("button", { name: "Confirm Cashier Receipt", exact: true }).click(); await drawer.getByText("Paid", { exact: true }).waitFor(); assert.equal(cashMovements, 1); assert.equal(await drawer.getByLabel("Your open cashier terminal").count(), 0); await page.keyboard.press("Escape");
    await explicit(() => page.getByRole("button", { name: /Discrepancy 30.00 SAR/ }).click()); const shortRow = viewport.width >= 1024 ? page.getByRole("row").filter({ hasText: "TEST-ADMIN-SHORT" }) : page.getByRole("article").filter({ hasText: "TEST-ADMIN-SHORT" }); await shortRow.getByRole("button", { name: "Review Cash", exact: true }).click(); await drawer.getByLabel("Discrepancy acknowledgment reason", { exact: false }).fill("Fixture shortage reviewed"); await drawer.getByRole("button", { name: "Acknowledge shortage · No payment posting", exact: true }).click(); await drawer.getByRole("button", { name: "Acknowledge shortage · No payment posting", exact: true }).waitFor({ state: "detached" }); await drawer.getByText("Discrepancy · Requires review", { exact: true }).waitFor(); assert.equal(records.find(row => row.delivery._id === "SHORT").order.paymentStatus, "pending"); assert.equal(cashMovements, 1); await page.keyboard.press("Escape");
    await explicit(() => tab("History").click()); assert.equal(await page.getByRole("group", { name: "Applied delivery filters" }).count(), 0); await page.getByRole("button", { name: "More Filters", exact: false }).click(); const beforeHistoryDraft = count(); await choose("Date period", "Today"); await choose("Sort deliveries", "Oldest delivered first"); assert.equal(count(), beforeHistoryDraft); await explicit(() => page.getByRole("button", { name: "Apply", exact: true }).click()); await page.getByRole("heading", { name: "No matching delivery history" }).waitFor(); await explicit(() => page.getByRole("button", { name: "Clear filters", exact: true }).first().click());
    assert.equal(await page.getByText("PRIVATE fixture address", { exact: true }).count(), 0); await layout(); await page.screenshot({ path: path.join(screenshots, `history-${viewport.width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Add existing order", exact: true }).click(); const enrollment = page.getByRole("dialog", { name: "Add existing order", exact: true }); await enrollment.getByPlaceholder("Exact existing order number").fill("TEST-EXISTING"); await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Add existing order", exact: true }).click(); assert.equal(await enrollment.getByPlaceholder("Exact existing order number").inputValue(), "TEST-EXISTING"); await enrollment.getByRole("button", { name: "Find Existing Order", exact: true }).click(); await enrollment.getByLabel("Own-delivery authorization reason").waitFor(); assert.equal(await enrollment.getByRole("button", { name: "Enroll Own Delivery", exact: true }).isDisabled(), true); await enrollment.getByLabel("Own-delivery authorization reason").fill("Fixture eligible order enrollment"); await layout(); await page.screenshot({ path: path.join(screenshots, `enrollment-${viewport.width}.png`) }); await enrollment.getByRole("button", { name: "Enroll Own Delivery", exact: true }).click(); await enrollment.getByRole("status").filter({ hasText: "Confirmed by the server" }).waitFor(); assert.ok(records.some(row => row.delivery._id === "EXISTING")); await page.keyboard.press("Escape");
    records.push(make("CASHIER-REPORTED", "delivered", "unconfirmed"));
    const cashierContext = await browser.newContext({ viewport, serviceWorkers: "block" }); await cashierContext.addCookies([{ name: "dg_session", value: "cashier", url: origin }, { name: "dg_csrf", value: "local-cashier-csrf", url: origin }]); await cashierContext.addInitScript({ path: path.resolve(import.meta.dirname, "../node_modules/axe-core/axe.min.js") }); const cashier = await cashierContext.newPage(); const directoryBefore = requests.filter(row => row.role === "cashier" && row.path.endsWith("/riders")).length; await cashier.goto(origin + "/admin/deliveries"); await cashier.getByRole("tab", { name: "Cash & Settlement", exact: true }).waitFor(); assert.equal(await cashier.getByRole("tab", { name: "Cash & Settlement", exact: true }).getAttribute("aria-selected"), "true"); assert.equal(await cashier.getByRole("tab", { name: "Active Deliveries", exact: true }).count(), 0); assert.equal(await cashier.getByRole("combobox", { name: "Filter rider", exact: true }).count(), 0); assert.equal(await cashier.getByRole("button", { name: "Add existing order", exact: true }).count(), 0); assert.equal(requests.filter(row => row.role === "cashier" && row.path.endsWith("/riders")).length, directoryBefore);
    const cashierRow = viewport.width >= 1024 ? cashier.getByRole("row").filter({ hasText: "TEST-ADMIN-CASHIER-REPORTED" }) : cashier.getByRole("article").filter({ hasText: "TEST-ADMIN-CASHIER-REPORTED" }); await cashierRow.getByRole("button", { name: "Review Cash", exact: true }).click(); const cashierDrawer = cashier.getByRole("dialog", { name: "Delivery details & actions", exact: true }); const receiptButton = cashierDrawer.getByRole("button", { name: "Confirm Cashier Receipt", exact: true }); await cashierDrawer.getByLabel("Your open cashier terminal").fill("CLOSED"); await receiptButton.click(); await cashierDrawer.getByRole("alert").filter({ hasText: "Open your cashier shift" }).waitFor(); assert.equal(cashMovements, 1); await cashierDrawer.getByRole("button", { name: "Refresh selected & list", exact: true }).click(); await cashier.waitForFunction(() => ![...document.querySelectorAll("button")].find(node => node.textContent === "Confirm Cashier Receipt")?.disabled); await cashierDrawer.getByLabel("Your open cashier terminal").fill("LOCAL"); await receiptButton.click(); await cashierDrawer.getByText("Paid", { exact: true }).waitFor(); assert.equal(cashMovements, 2); assert.equal(await cashierDrawer.getByRole("radio").count(), 0); await layout(cashier); await cashier.screenshot({ path: path.join(screenshots, `cashier-receipt-${viewport.width}.png`) }); await cashierContext.close();
    assert.deepEqual(errors, []); console.log(`PASS ${viewport.width}px: workspaces, manual reads, summary/chip filters, pagination, recorded duration, assignment/draft/focus, cash confirmation/discrepancy, enrollment and cashier scope`); await context.close();
  }
  console.log(`Screenshots: ${screenshots}`);
} finally {
  held = false; release?.(); await browser?.close(); if (next.exitCode == null) { const stopped = new Promise(resolve => next.once("exit", resolve)); next.kill(); await stopped; } await new Promise(resolve => fixture.close(resolve));
}
