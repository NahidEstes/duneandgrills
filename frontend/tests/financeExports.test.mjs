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
