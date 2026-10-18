# Profit reporting and priority actions

Added 2026-10-18. These are read-only reporting additions. No production settings,
delivery enablement, database migration or new environment credentials are needed.
Existing backend and frontend versions must both include this change.

## Access and locations

- Finance & Expenses → **Profit & Cost**, `/admin/expenses/profit`; also linked
  from Sales Analytics. API: `GET /api/expenses/profit-report`.
- Both FINANCE_READ and INVENTORY_READ are required server-side. Existing roles
  with both are admin, manager and accountant. Accountants cannot open admin order
  details through the report. Other roles are denied before report reads.
- `/admin` Operations Overview now shows unique priority records instead of
  repeating the same order across attention categories. Old API categories remain
  available. Dashboard, delivery and inventory capability gates remain in force.

## Reporting basis

The report reuses `salesRecognitionStages` from the existing sales service;
existing Sales Analytics, expense and cash formulas are unchanged.

- Order value is not recognized revenue or money collected. Captured sales already
  include discounts. Completed refunds use the existing maximum of the refund
  ledger and legacy cumulative counters, not their sum. Existing nonoverlapping
  void adjustments are retained.
- The sales cohort follows order occurrence/creation in the selected Riyadh
  period. Later refunds and returns adjust that original order cohort. A separate
  payment/refund activity section uses event dates. Undated historical activity
  is disclosed rather than assigned invented dates.
- Historical food cost uses completed order-linked STOCK_OUT batch allocations
  and their saved unit costs. Current recipe and ingredient prices are never read.
  Stored transaction unit cost without batch evidence is explicitly an estimate.
  Missing/zero-default costs, missing linked movements, incomplete menu/combo/
  add-on coverage and unmatched returns are gaps, not free food.
- STOCK_IN restoration matches the original deduction/lot and reverses original
  cost, ignoring replacement prices. Duplicate movements count once. Full returns
  can reverse the complete original cost; partial returns without lot evidence
  are estimates. Over-returns, inconsistent return counters and incomplete
  restoration evidence block asserted profit.
- Refunds without restocking reduce sales but retain consumption cost. Separate
  WASTE/DAMAGED movements use occurredAt. Undated waste and missing waste costs
  block operating profit; order consumption is not deducted a second time.
- Operating expenses retain existing expense-date recognition: active/archived
  gross total; cancelled unpaid zero; legacy cancelled paid amountPaid only.
  Purchases, supplier invoices and inventory receipts are not added as another
  expense. Fee bills already classified as operating expenses count once there.

## Formulas and limitations

- Gross profit = recognized net sales − complete recorded food cost, excluding
  separately reported waste. Food-cost percentage divides recorded food cost by
  positive net sales. Missing/estimated evidence makes these recorded results
  unavailable, rather than inflating profit. Estimates are separate and appear
  only when every captured order has calculable evidence.
- Indicative operating profit = recorded gross profit − separate recorded waste
  − recognized operating expenses. Margins divide profit by positive net sales.
  No result is asserted as confirmed net profit.
- No structured confirmed commission/provider settlement ledger currently exists.
  Platform order value and pricing variance are contextual, never inferred fees
  or payouts. Commission/other adjustments stay unavailable; platform orders block
  operating-profit assertion. A reconciliation ledger remains future work.
- Expense VAT stays inside recognized gross expense amounts and is disclosed,
  not deducted twice. Sales/stock tax-basis snapshots are absent. No VAT rate or
  selective net-of-VAT conversion is assumed. This is not a tax-reconciled report.
- Channel comparisons assign their own historical order consumption. Shared waste
  and expenses are restaurant-wide without arbitrary allocation. Channel
  operating profit remains unavailable.
- Today, last seven Riyadh calendar days, this month and custom dates reuse date
  validation (maximum 366 days), SAR and Asia/Riyadh. Reports over 10,000 orders,
  100,000 waste movements, 20,000 expenses or 200,000 consumption movements fail
  explicitly with a shorter-period request; totals are never truncated.
- Reads are not a database snapshot transaction. A consistency check compares
  sales recognition totals/counts with order evidence and blocks profit on a
  mismatch. Concurrent changes across other ledgers can still require refresh.
- Screen, CSV and PDF/Print render the same server amounts and timestamp. Exports
  never recalculate profit. Refresh failures retain labelled stale evidence and
  disable exports; permission/session failures hide retained data.

## Dashboard actions

Pending-age/preparation reasons combine by order. Enabled authorized delivery
evidence combines ready/unassigned, delayed pickup/transit, unresolved issues and
delivered cash attention with the same order, counted once. Stock out/low/blocked/
expiring reasons combine by item. Priority is critical, high, medium, followed by
oldest known timestamp. Unknown stock onset is stated explicitly.

Links open an exact order, an order-number-filtered delivery Active/Cash workspace,
the existing stock editor (`edit=<id>`), or filtered purchase/invoice pages. URL
changes reset delivery drafts to linked filters; ordinary refresh preserves work.
Links never submit assignments, payments or stock writes. Destination validation,
confirmations and audit remain authoritative.

Reported cash, discrepancies, acknowledgment, order balance and confirmed cashier
receipt stay distinct. Acknowledgment does not clear an unconfirmed receipt.
Confirmed receipts and resolved records leave the list/count on refresh. Disabled
delivery stays disabled. Source failures show incomplete counts, not false zero.
At most 12 records are displayed with full unique source totals; stock eligibility
uses bulk reads rather than one query per alert.

## Verification

- Backend: `node --test tests/*.test.js`.
- Frontend: `node --test tests/*.test.mjs tests/*.test.js`, `npm run lint`,
  `npm run build`.
- Owned local MongoDB replica only: set MONGOD_BINARY to a local mongod executable,
  then run `node --test tests/profitAndPriorityIntegration.js tests/adminReportingAccuracyIntegration.js tests/adminOperationsIntegration.js`.
  Helpers create/remove their own temp databases without cloud configuration.
- Build first, then run `node tests/profitActionsBrowser.mjs` in frontend. Provide
  PLAYWRIGHT_MODULE when Playwright is outside the repo. This owns loopback fixture/
  Next servers, blocks external requests and rejects writes. It verifies
  1440/390/320px layouts, CSV/PDF, filters, exact navigation, missing/stale/resolved
  states, permissions and WCAG checks. Artifacts go into an owned temp folder.
- Existing `tests/deliveryManagementBrowser.mjs` covers destination workflow
  regression with owned loopback fixtures, never live orders.

The expense PDF failure was reproduced before changing its test. Assertions now
check the meaningful status cell and recognized/paid amounts per record,
independent of markup adjacency. Archived paid, cancelled unpaid and legacy
cancelled partially paid remain covered, including 140.00 and rejection of 300.00.
The export design was not changed to satisfy the test.
