import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAnalyticsCsvRows, buildAnalyticsReportHtml } from "../src/utils/adminExports.js";
import { formatAdminDate } from "../src/components/admin/adminUi.js";
import { dateValue, monthRange } from "../src/components/admin/finance/financeUtils.js";
import { buildExpensePdfHtml } from "../src/components/admin/finance/financeExports.js";

const summary = { totalOrders: 4, orderedAmount: 400, grossSales: 200, collectedAmount: 200, completedRefunds: 25, voidAmount: 100, netSales: 75 };
const analytics = { summary, range: { from: "2026-10-05", to: "2026-10-05" }, filters: { source: "pos", orderType: "takeaway" }, series: [{ date: "2026-10-05", orders: 4, ...summary }], sourceBreakdown: [{ source: "pos", orders: 4, ...summary }], orderTypeBreakdown: [{ orderType: "takeaway", orders: 4, ...summary }], cashActivity: { collectedAmount: 30, completedRefunds: 10, voidAmount: 0, netCollected: 20, unknownPaymentDateAmount: 100 }, definitions: { timezone: "Asia/Riyadh", netSales: "Net sales is not profit", cashAttribution: "Payment/refund event dates are separate" } };

test("sales CSV reuses server-calculated metrics and keeps sales/event attribution separate", () => {
  const rows = buildAnalyticsCsvRows(analytics);
  assert.deepEqual(rows[0].slice(2), [4, 400, 200, 200, 25, 100, 75]);
  const activity = rows.find(row => row[0].startsWith("Event-date")); assert.deepEqual(activity.slice(3), ["", "", 30, 10, 0, 20]);
  assert.ok(rows.some(row => row[0] === "Order-date source" && row.at(-1) === 75));
  assert.ok(rows.some(row => row[0] === "Definition: netSales"));
});
test("sales PDF labels both bases and unknown-date limitations without treating unpaid orders as collections", () => {
  const html = buildAnalyticsReportHtml(analytics); assert.match(html, /Order-date sales/); assert.match(html, /event-date activity/); assert.match(html, /Asia\/Riyadh/); assert.match(html, /not profit/); assert.match(html, /Unknown-date amounts/); assert.match(html, /Source: pos/);
});
test("Finance input/export dates and admin display follow Riyadh regardless of browser-local timezone", () => {
  const boundary = "2026-10-04T21:00:00Z";
  assert.equal(dateValue(boundary), "2026-10-05");
  assert.equal(dateValue("2026-10-04T20:59:59Z"), "2026-10-04");
  assert.equal(formatAdminDate(boundary, { year: "numeric", month: "2-digit", day: "2-digit" }), formatAdminDate("2026-10-05T08:00:00Z", { year: "numeric", month: "2-digit", day: "2-digit" }));
  assert.deepEqual(monthRange(new Date("2026-12-31T22:00:00Z")), { from: "2027-01-01", to: "2027-01-31" });
  assert.deepEqual(monthRange(new Date("2028-02-15")), { from: "2028-02-01", to: "2028-02-29" });
});
test("expense PDF uses recognized server values and retains archived/legacy-cancelled payment history", () => {
  const html = buildExpensePdfHtml({ rows: [
    { title: "Archived valid expense", totalAmount: 100, recognizedAmount: 100, amountPaid: 100, recordStatus: "archived", paymentStatus: "paid" },
    { title: "Cancelled unpaid", totalAmount: 100, recognizedAmount: 0, recognizedVat: 0, amountPaid: 0, recordStatus: "cancelled", paymentStatus: "unpaid" },
    { title: "Legacy cancelled partial", totalAmount: 100, recognizedAmount: 40, amountPaid: 40, recordStatus: "cancelled", paymentStatus: "partially_paid" },
  ] });
  assert.match(html, /140\.00/); assert.doesNotMatch(html, /300\.00/); assert.match(html, /Archived · Paid/); assert.match(html, /Cancelled · Unpaid/); assert.match(html, /Recognized expense/);
});
