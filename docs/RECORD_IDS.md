# Readable record IDs and ID search

## Identifiers

The MongoDB `_id` remains the only relational identity. Existing order numbers, external delivery references, SKUs, EXP numbers, purchase-order numbers, invoice references, count numbers, lots, supplier codes, employee IDs and terminal codes are not rewritten.

New fields: Refund.refundNumber (RFN), SupplierPayment.paymentNumber (PAY), PosShift.shiftNumber (PSH), CashMovement.movementNumber (CSH), StockTransaction.transactionNumber (STX), PosHeldSale.heldSaleNumber (HLD), User.customerNumber (CUS, customer role only). Staff reuse User.employeeId (EMP); historical manual values remain unchanged.

RFN/PAY/PSH/CSH/STX/HLD use `PREFIX-RiyadhCreationYear-000001`. CUS/EMP use `PREFIX-000001` without annual reset. Business dates are not used to determine a new ID's year. Cash IDs cover all existing ledger movement types, including opening cash/sales/refunds, not only manual cash in/out/payout.

`backend/services/recordNumberService.js` reuses Counter and the existing Expense service's Riyadh-year utility. A shared model plugin handles create/save/insertMany. Counter reservation is deliberately outside caller transactions, so failed transactions leave gaps but never recycle reservations. No financial, stock or idempotency boundary is changed. Unique partial indexes accept legacy missing/null fields. Query updates/replacements/upserts cannot modify the fields; client-supplied IDs are rejected, including new staff IDs. Capacity above 999999 returns a controlled 503.

## Search and UI

Admin sidebar and header: **Search by ID**, `/admin/record-search`.
API: authenticated `GET /api/record-search?q=...&page=1&limit=15`; read-only detail `GET /api/record-search/:type/:id`.

All sixteen record types are supported, including historical/custom/external formats. Exact case-insensitive matches precede escaped partial matches; known prefixes prioritize types without excluding historical external references. Search uses database queries, case-insensitive indexes, a maximum 25 results/page, maximum 20 pages, per-query 2-second timeout and existing rate limiter (60 requests/minute). No unauthorized counts are returned. Partial regex search is necessarily less efficient than indexed exact ID search: use a longer/full ID for large databases. Broad searches are deliberately capped at 500 displayed records.

Existing capabilities are authoritative. Inventory staff see inventory/purchasing records but not invoices/payments without payables access; accountant sees authorized finance/payables/inventory/refunds; cashier sees allowed orders/terminals and their own held sales, shifts, cash and requested/original-cashier refunds. Managers/admins retain existing permissions. Customer/staff identity lookup requires dashboard/staff capability. Search projections exclude email/phone/address, credentials, balances and other private fields. Detail authorization is checked again; guessing an internal ID does not grant access.

Lists use shared `frontend/src/components/ui/RecordId.jsx` for read-only copyable IDs. Search has record-specific read-only detail links and CSV export of displayed records only, not an unbounded database dump. Stock/waste CSV, inventory report data, refund print records and shift/cash summaries retain IDs. Existing finance CSV/PDF and order receipts continue using their original identifiers. Audit labels/metadata carry new numbers, including STX on stock movement audit entries. Staff/supplier search lists remain server-paginated; existing form pickers collect bounded option pages so staff or suppliers beyond the first page are not silently omitted.

## Safe historical backfill

No production script was run during implementation. Take and verify a database backup first. Use a staging copy to review the dry-run output; check the explicitly selected database before applying. Do not seed/reset the database.

From the backend directory, use the intended connection URI from your secret manager (never commit it):

```powershell
$env:MONGO_URI = '<intended database URI>'
npm run migrate:record-numbers
# Equivalent explicit dry run:
npm run migrate:record-numbers -- --dry-run
# Apply ONLY after review and backup:
npm run migrate:record-numbers -- --apply
# Verify restartability and remaining = 0:
npm run migrate:record-numbers -- --dry-run
```

Default dry-run disables automatic index/collection creation and makes no counter/record writes. Preflight reports duplicate identifiers case-insensitively and blocks apply if collisions exist. Do not auto-rename collisions: resolve them through a separately approved data-integrity procedure.

Apply streams missing identifiers in `createdAt`, `_id` order, uses the original creation instant (or ObjectId timestamp), preserves existing values, and writes only the new ID using a guarded raw update. Amounts, status, relationships and timestamps are untouched. It is idempotent/restartable. Counters bootstrap above both existing sequences and current reservations and are never lowered. Final output includes remaining missing counts, counter/highest-assigned checks and validation state; index creation is additive (no syncIndexes/dropIndexes).

Run only ONE backfill process. Recommended rollout: pause write traffic, stop old application workers, dry-run/review, apply/index creation, start updated workers, verify, resume traffic. Do not run old and new workers together: old code could create ID-less records. Updated live creators share the atomic counters and conditional migration writes, so uniqueness remains safe, but a maintenance window makes historical ordering/review deterministic. No new environment variable is required; MongoDB transaction support remains as required by existing POS/inventory workflows.

This migration covers the newly numbered types and missing staff employee IDs only. It never regenerates any pre-existing business ID. The existing Expense numbering service/migration is unchanged.

## Verification / manual checks

```powershell
cd backend
npm run test:record-ids
npm run test:pos-phase2
node tests/runRecordIdRegressions.js
# These three start their own temporary local MongoDB replica sets; install mongod or set MONGOD_BINARY.
cd ../frontend
node --test tests/posShortcuts.test.js tests/recordIdExports.test.js tests/selectionOptions.test.js
npm run lint
npm run build
npm start -- --port 3008
```

Browser smoke tests use only intercepted API fixtures:

```powershell
# In another frontend terminal, set PLAYWRIGHT_MODULE to an installed Playwright package if not resolvable.
node tests/recordSearchBrowserSmoke.mjs
node tests/posBrowserSmoke.mjs
```

Create a customer/staff member, open a shift, record cash, hold a sale, sell/refund, receive stock, record waste, pay a supplier invoice. Confirm each new record has its corresponding automatic number. Retry idempotent actions and check the same number returns. Search each ID, copy it, open/reload details, export CSV; check refund print and shift closing summaries. Check invoice references and duplicate lots show supplier/item context. Repeat under cashier/inventory/accountant accounts; prohibited details should be inaccessible. Verify staff forms cannot enter/change employee IDs. Existing invoices, vendor references, SKUs, lots and order identities remain unchanged.

## Verification results (2026-10-05)

- Record-ID integration: 10 passed, 0 failed (including parent test).
- POS Phase 2 integration: 17 passed, 0 failed (including parent test).
- Regression runner: all 9 suites passed — POS, POS Phase 1, Phase 2 operational, inventory, expenses, purchasing Phase 3A/3B, customer CRM and authentication/security.
- Frontend unit tests: 6 passed, 0 failed.
- Mocked-browser checks: record search at 1440px/390px and POS at 1440px/768px passed; no real API/database writes.
- ESLint: exit 0. Production build: exit 0, 23/23 static pages generated; record-search route is dynamic.
- Backend changed/new JavaScript syntax checks and git diff whitespace checks passed. No separate backend lint or frontend typecheck script is configured; the Next build's configured check completed.
- Production migration, deploy, commit and push were not performed.
