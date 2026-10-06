# Phase 3 — Reporting accuracy and cashier workflow

## Shared sales definitions

`backend/services/salesReportingService.js` is authoritative for Dashboard, Analytics, daily series and source/type breakdowns. CSV/PDF use those returned values, not independent revenue formulas. Compatibility keys `totalRevenue` and `revenue` now mean **net sales**, not collections or profit.

| Metric | Definition |
| --- | --- |
| Ordered amount | All original order totals, including unpaid/pending/failed/cancelled orders. This is not money collected. |
| Gross sales | Recorded captured order totals, **after discounts but before reversals**. Paid/partially-refunded/refunded payment records, explicit captured voids, and actual completed refunds establish a capture. Order status alone does not. |
| Recorded collections | Captured order amounts before reversals, excluding aggregator-prepaid delivery orders. These are internal Cash/Card/Other records, not bank/provider settlement verification. |
| Completed refunds | Sum of `Refund.amountHalala` only for `completed` refunds. Reconcile with completed-refund counters on legacy orders using the maximum of the cumulative counters and the completed ledger sum, never their sum. Refund status alone never implies a full-order amount. |
| Captured-payment voids | Explicit `voidedAt` events. Unpaid cancellations carrying `paymentStatus: voided` are not captured sales. The void adjustment is the remaining captured amount after completed refunds so the same money is not deducted twice. |
| Net sales | Gross sales minus actual completed refunds minus non-overlapping captured void adjustments. Discounts are already inside the charged order total; do not subtract them again. This is not profit. |
| Average order value | Original gross captured sales divided by captured-order count, before refunds/void adjustments. |

### Two separate date bases

- **Order-date sales**: `orderOccurredAt` for historical delivery entry, otherwise `createdAt`. All completed refunds/voids adjust the original order cohort, even if their event happened in another reporting period. Historical cohort totals can therefore change when a refund completes later.
- **Payment/refund event-date activity**: POS capture occurs atomically at sale creation, so POS `createdAt` is its capture event date. Refunds use `completedAt`; voids use `voidedAt`. Cash is separated from other recorded methods. Negative event-period net collections are valid (for example refunds of earlier sales).
- Other sales channels currently have no capture timestamp/payment ledger. Their recorded captures contribute to their order-date cohort but **not** to an invented payment-date total. Unknown payment/refund dates are shown separately across the complete selected source/type history, outside dated activity. `updatedAt` is never used as a fabricated payment date.
- Aggregator-prepaid sales contribute to sales and their own metric, not restaurant collections; settlement tracking is not implemented here.
- All business-date boundaries, daily keys, displayed report dates and exported dates use **Asia/Riyadh**. Ranges include the start and exclude the following midnight after the final selected day. Stored timestamps are unchanged.
- Item rankings show captured, non-voided item quantities/line values before order-level discounts and refund returns. They are explicitly labelled and must not be interpreted as net item revenue.

## Expense archive/cancellation boundary

- `/entries` defaults to an **active working list**. Its Record State filter allows archived/cancelled/all historical records. Export from this list follows the explicitly selected state.
- Dashboard, Reports and report exports default to **all historical record states**, use expense dates in Riyadh, and include valid archived expenses in all financial calculations. Archive changes visibility only.
- `/entries/:id/archive` cannot cancel or resurrect an expense. `/entries/:id/cancel` is a separate action protected by existing `finance.write` (Admin/Accountant). Manager remains read-only.
- Unpaid cancellation requires a reason of at least three characters. Original total, ID, notes and payment fields remain intact. `cancelledAt`, `cancelledBy`, reason and the audit record are stored together in a MongoDB transaction. Concurrent retries create only one cancellation audit; audit failure rolls back cancellation.
- **Paid/partially-paid cancellation is rejected**, even for authorized writers. Recorded `amountPaid` cannot be reduced/erased in an ordinary edit. There is no existing expense-payment reversal ledger/provider integration to prove a refund, so this phase does not pretend that money was reversed. Paid expenses can safely be archived.
- Previously cancelled paid records are not migrated or erased. Their existing `amountPaid` remains financially recognized and outstanding liability is zero; the original `totalAmount` is retained alongside the recognized amount. These legacy records need accounting review before a separately approved payment-reversal workflow is added.
- Server-defined recognized amounts are used consistently in totals, category/trend/payment/recurring breakdowns and exports. Cancelled unpaid bills have zero recognized amount. Original values and record states remain visible in historical tables/CSV.
- These are expense-date operating-expense totals, **not payment-date cash flow**. Inventory purchases/COGS remain excluded. No net-profit calculation was added.

## Cashier customer search

`GET /api/pos/customers?search=...&limit=8` uses the existing POS session resolution and `pos.operate` capability, including lock enforcement. Search supports customer name, phone and readable customer ID, accepts 2–80 characters, escapes regex, limits results to 1–20 (default 8), has a 2-second Mongo query limit and 90 requests/minute rate limit.

Only active customer records are eligible. The response allowlist is `_id`, `name`, `phone`, `customerNumber`; it excludes email, addresses, notes, rewards histories, credentials and staff records. The cashier does not receive Admin access. Existing Admin/Manager customer search is unchanged. UI distinguishes loading, successful empty results and an API failure.

## Local verification

Use development/test data only. The new integration test creates and owns a temporary local MongoDB replica set; it does not read `.env`, use external database URLs, reset production data or run migrations. Local `mongod` must be available (or provide `MONGOD_BINARY` pointing to the local executable).

```powershell
cd backend
npm run test:admin-reporting-accuracy
node --test tests/*.test.js
npm run test:stock-recipe-accuracy
npm run test:purchasing-safety
npm run test:stock-recipe-regressions
npm run test:pos-phase2
cd ../frontend
node --test tests/adminReportingAccuracy.test.mjs tests/financeExports.test.mjs
node --test tests/*.test.js tests/*.test.mjs
npm run lint
npm run build
```

For the API-mocked responsive browser test, start `npm run start -- -p 3008` after building, then run `node tests/adminReportingBrowserSmoke.mjs`. Supply `PLAYWRIGHT_MODULE` only if Playwright lives outside the project. All API requests in this smoke test are mocked; it cannot mutate restaurant data.

### Manual checks (development database)

1. Create an unpaid website order and a paid POS sale. Compare ordered/gross/collected/refund/void/net values in Dashboard and Analytics; export CSV/PDF and compare the same values. Finish one partial refund; pending/failed refunds should not change completed-refund totals.
2. Refund an earlier sale today. Its original order-date cohort changes, while today's event-date activity contains the refund, not a new sale. A void must appear once, not as another completed refund.
3. Filter a Riyadh date and check orders at `20:59:59Z` versus `21:00:00Z`; import a historical delivery order and verify its original date, not entry date. Aggregator prepaid must not increase restaurant collections.
4. Log in as a cashier at `/pos`; search a name/phone/customer ID and select it. Simulate an API failure/offline response: show search unavailable, not “No customers found”. Admin/Manager customer pages should still work.
5. Archive a paid expense. It disappears from the active list but remains in Dashboard/Reports/export totals and Archived History. Cancel a duplicate unpaid bill with a reason: recognized expense becomes zero while its original amount and audit remain. Attempt paid cancellation/payment reduction: it must be rejected.

## Deployment/data requirements and limitations

- No migration, seed, timestamp rewrite, new required environment variable, production operation or dependency upgrade. New cancellation metadata is optional and old records remain valid.
- Transactional expense state changes need a MongoDB replica set, already required by the existing stock/purchasing safety phases; they fail closed on standalone MongoDB, including development fallback mode.
- Unknown historical capture/refund timestamps cannot be reconstructed safely. Records that say “refunded” without an actual refund amount are not assigned an invented amount. Reconciliation requires separately approved evidence/data work.
- No expense-payment reversal workflow, gateway, aggregator settlement, table management, tax functionality or profit reporting was added.
- Full-history reconciliation aggregates should be profiled if the order history becomes very large; no speculative caching/rewrites were added.

## Verification results (2026-10-05)

- Phase 3 isolated integration: 27 tests passed, 0 failed.
- Backend pure tests: 57 passed, 0 failed.
- Phase 1 stock/recipe accuracy: 13 passed; Phase 2 purchasing safety: 24 passed; POS Phase 2: 17 passed.
- Stock/recipe legacy regressions: all 8 integration suites passed. Legacy expense integration also passed using an owned isolated database.
- Frontend reporting/finance export tests: 5 passed, 0 failed.
- Full frontend tests: 37 tests, 36 passed, 1 pre-existing unrelated failure in `tests/customerDisplay.test.mjs:25`. The expected snapshot omits the existing empty `pickupName`/`pickupToken` fields. Both that test and `src/utils/customerDisplaySync.js` match HEAD exactly and were left unchanged.
- Responsive API-mocked browser checks passed at 1440×1000 and 390×844, including Analytics/CSV, expense archive/cancel/history/PDF, and cashier customer search. No page errors or document overflow.
- Frontend lint and production build exited 0. Build generated 23 static pages and completed its TypeScript phase.
- Changed backend JavaScript syntax checks and `git diff --check` passed.
