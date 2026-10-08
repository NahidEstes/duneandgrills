import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as orders from "../src/utils/adminOrders.js";
import * as freshness from "../src/components/admin/dashboardFreshness.js";
import * as adminUi from "../src/components/admin/adminUi.js";

const require = createRequire(import.meta.url), { transformSync } = require("next/dist/build/swc");
const file = new URL("../src/components/admin/RecentOrdersPanel.jsx", import.meta.url);
const compiled = transformSync(readFileSync(file, "utf8"), { filename: file.pathname, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
const mod = { exports: {} };
new Function("require", "module", "exports", compiled.code)(id => id === "../../utils/adminOrders.js" ? orders : id === "./dashboardFreshness.js" ? freshness : id === "./adminUi.js" ? adminUi : require(id), mod, mod.exports);
const id = "111111111111111111111111";
const row = { _id: id, orderNumber: "ORD-2026-000001", customer: { name: "" }, source: "pos", items: [{ quantity: 2 }, { quantity: 3 }], totalAmount: 43, status: "pending", paymentStatus: "unpaid", createdAt: "2026-10-07T21:01:00Z", preparationDueAt: "2026-10-07T21:31:00Z", preparationActive: true };
const render = (resource, status = "all") => renderToStaticMarkup(React.createElement(mod.exports.default, { resource, status, viewAllHref: orders.adminOrdersHref("", { tab: "orders", status }), orderHref: id => orders.adminOrdersHref("", { tab: "orders", status, order: id }) }));

test("View All and exact-order URLs preserve the filter and round-trip refresh/back/forward state", () => {
  const current = new URLSearchParams("tab=overview&recentStatus=pending&other=keep");
  const list = orders.adminOrdersHref(current, { tab: "orders", status: "pending", order: null });
  const detail = orders.adminOrdersHref(list.split("?")[1], { order: id });
  const back = orders.adminOrdersHref(detail.split("?")[1], { order: null });
  assert.equal(back, list); assert.match(detail, /status=pending/); assert.match(detail, /other=keep/);
  assert.equal(new URL(detail, "http://localhost").searchParams.get("order"), id);
  assert.equal(orders.normalizeOrderStatus("unknown"), "all"); assert.equal(orders.normalizeOrderStatus("confirmed"), "confirmed");
  assert.doesNotMatch(orders.adminOrdersHref(current, { recentStatus: "all" }), /recentStatus/);
});

test("source and payment labels never claim aggregator cash receipts or missing payment status", () => {
  for (const [source, label] of Object.entries({ website: "Website", pos: "POS", phone: "Phone", jahez: "Jahez", keeta: "Keeta", hungerstation: "HungerStation", ninja: "Ninja" })) assert.equal(orders.orderSourceLabel(source), label);
  assert.equal(orders.orderSourceLabel(undefined), "Unavailable");
  const prepaid = orders.orderPaymentLabel({ paymentStatus: "paid", paymentMethod: "cash", deliveryPaymentType: "aggregator_prepaid" });
  assert.equal(prepaid, "Aggregator prepaid · Paid"); assert.doesNotMatch(prepaid, /cash|settled|collected/i);
  assert.equal(orders.orderPaymentLabel({}), "Payment status unavailable");
  assert.equal(orders.customerDisplayName(row), "Walk-in");
  assert.equal(orders.customerDisplayName({ customer: { name: "  " } }), "Guest");
  assert.equal(orders.orderItemQuantity(row), 5); assert.equal(orders.orderItemQuantity({ items: [{}] }), null);
});

test("Riyadh dates and recorded-only timing separate historical entries from live and terminal orders", () => {
  assert.match(orders.orderDateLabel(row.createdAt), /Oct 8, 2026/);
  assert.match(orders.orderDateLabel(row.createdAt), /Asia\/Riyadh/);
  const now = Date.parse("2026-10-07T21:36:00Z");
  assert.deepEqual(orders.orderPreparationLabel(row, now), { text: "Prep overdue by 5 min", overdue: true });
  assert.deepEqual(orders.orderPreparationLabel(row, now - 600000), { text: "Prep due in 5 min", overdue: false });
  assert.equal(orders.orderPreparationLabel({ status: "preparing", preparationActive: true }, now), null);
  assert.equal(orders.orderPreparationLabel({ ...row, manualEntry: true }, now).overdue, false);
  assert.equal(orders.orderPreparationLabel({ ...row, preparationActive: false, status: "delivered" }, now).overdue, false);
  assert.equal(orders.orderDateLabel(undefined), "Unavailable");
});

test("loading, empty, error and stale results are visibly distinct without manufactured zeros", () => {
  assert.match(render({ status: "loading", data: null }), /Loading recent orders/);
  const failure = render({ status: "error", data: null }); assert.match(failure, /role="alert"/); assert.match(failure, /Retry recent orders/); assert.doesNotMatch(failure, /No recent orders|SAR 0/);
  assert.match(render({ status: "success", data: { data: [], pagination: { total: 0 } } }), /No recent orders match/);
  const stale = render({ status: "stale", data: { data: [row] }, lastSuccessAt: Date.parse(row.createdAt), error: "server failure" });
  assert.match(stale, /Recent orders may be outdated/); assert.match(stale, /ORD-2026-000001/); assert.match(stale, /dateTime=/i);
});

test("compact responsive rows use keyboard-accessible links, all statuses and separate readable badges", () => {
  const html = render({ status: "success", data: { data: [row], pagination: { total: 9, hasMore: true } } }, "pending");
  assert.match(html, /Latest 7 matching orders · 9 matching/);
  assert.match(html, /href="\/admin\?tab=orders&amp;status=pending&amp;order=111/);
  assert.match(html, /aria-label="Open order ORD-2026-000001"/);
  assert.match(html, /aria-label="Order status: Pending"/); assert.match(html, /aria-label="Payment: Unpaid"/);
  assert.match(html, /Walk-in · 5 items/); assert.match(html, /flex-wrap/); assert.doesNotMatch(html, /<table|min-w-\[/);
  for (const label of Object.values(orders.ORDER_STATUS_LABELS)) assert.ok(html.includes(label), label);
  assert.match(html, /aria-pressed="true"/);
});
