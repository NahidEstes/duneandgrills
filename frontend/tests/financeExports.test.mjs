import assert from "node:assert/strict";
import test from "node:test";
import { buildExpensePdfHtml } from "../src/components/admin/finance/financeExports.js";

test("finance PDF report includes filtered expense details and safe totals", () => {
  const html = buildExpensePdfHtml({
    filters: { from: "2026-09-01", to: "2026-09-30", paymentStatus: "paid", search: "rent" },
    rows: [{
      expenseNumber: "EXP-2026-000001",
      expenseDate: "2026-09-01T00:00:00.000Z",
      title: "Rent <Main>",
      category: { name: "Rent" },
      vendor: "Landlord & Co.",
      referenceNumber: "INV-100",
      totalAmount: 1000,
      vatAmount: 150,
      amountPaid: 1000,
      paymentStatus: "paid",
      recurringTemplate: "template-id",
    }],
  });
  assert.match(html, /EXP-2026-000001/);
  assert.match(html, /Rent &lt;Main&gt;/);
  assert.match(html, /Landlord &amp; Co\./);
  assert.match(html, /Invoice \/ Ref\./);
  assert.match(html, /Recurring/);
  assert.match(html, /All expense types/);
  assert.doesNotMatch(html, /Rent <Main>/);
});

test("branded report keeps recognized totals, history and selected filters accurate", () => {
  const html = buildExpensePdfHtml({
    filters: { category: "rent", recordStatus: "all", vendor: '<script>alert("vendor")</script>' },
    categories: [{ _id: "rent", name: "Rent & premises" }],
    rows: [
      { title: "Archived rent", totalAmount: 1000, recognizedAmount: 1000, vatAmount: 150, recognizedVat: 150, amountPaid: 750, paymentStatus: "partially_paid", recordStatus: "archived" },
      { title: "Cancelled duplicate", totalAmount: 300, recognizedAmount: 0, vatAmount: 45, recognizedVat: 0, amountPaid: 0, paymentStatus: "unpaid", recordStatus: "cancelled" },
    ],
    truncated: true,
  });
  const summary = html.match(/<section class="summary">(.*?)<\/section>/s)[1];
  assert.match(summary, /SAR\s*1,000\.00/);
  assert.match(summary, /SAR\s*750\.00/);
  assert.match(summary, /SAR\s*250\.00/);
  assert.match(html, /VAT included: SAR\s*150\.00/);
  assert.match(html, /Rent &amp; premises/);
  assert.match(html, /Archived/);
  assert.match(html, /Cancelled/);
  assert.match(html, /Partially Paid/);
  assert.match(html, /first 5,000 matching records/);
  assert.doesNotMatch(html, /<script>/);
});
