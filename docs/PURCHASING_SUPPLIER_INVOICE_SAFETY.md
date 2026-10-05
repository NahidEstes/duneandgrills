# Phase 2: Purchasing and supplier invoice safety

## Receiving

- Select only delivered PO lines. Unselected lines stay outstanding; zero quantities are rejected rather than treated as receipts.
- Purchase quantities have at most six decimal places. Existing purchase-to-base conversion, unit costs, requested/actual brands, lots, expiry and FEFO are retained.
- The cumulative cap for a line is `ordered quantity × (1 + overReceiveTolerancePercent / 100)`. Exceeding the outstanding quantity within that cap requires Manager/Admin and a nonblank override reason. Exceeding the cap is blocked.
- Each receipt requires a 1–128-character idempotency key. Reuse the key **and exact payload** after double-click, network timeout or ambiguous server failure. A changed payload under that key returns 409.
- The form stores the pending payload/key in session storage, scoped by user and PO. Inputs lock after submission until the outcome is known. Reopening/refreshing the same browser tab retries the saved submission, including if that PO has since become Received. Only definite 400/422 validation rejection allows correction with a new key. Browser session storage must be available; losing/clearing storage after an ambiguous outcome requires checking the PO/movement history before submitting another receipt.
- New receipts retain their original PO response and movement IDs. Retry returns that result, not a later PO revision, and performs no extra stock/price/audit writes. Keys created before this release remain duplicate-safe but lack historical response snapshots; they return current PO state with `legacyReceipt: true` and no movements. Historical records are not rewritten.
- Batches, stock, movements, PO quantities, result snapshots, price history and receipt audit records commit in one MongoDB transaction. No standalone/development fallback is allowed for receipt or invoice writes.

## PO completion

- Receiving sets Received only after every required line is fulfilled. A direct incomplete Received transition is rejected.
- Manager/Admin can use Closed Short with a mandatory reason when remaining quantities will not arrive. This does not create receipts or increase stock.
- Existing focused reorder recalculation runs after receiving/status changes. Confirmed inbound is the real outstanding quantity converted to base units, and Closed Short contributes no future inbound. Existing best-effort recalculation logs failures; retry the focused/full reorder scan if that refresh fails.

## Invoice reservations and three-way matching

| Invoice status | Reserves billable quantity? |
| --- | --- |
| Draft | No; proposal only |
| Submitted / Review Required / Approved / Posted | Yes |
| Disputed | Yes, until explicitly voided or edited through the existing review workflow |
| Voided | No |

Editing a review-required invoice returns it to Draft and releases its old reservation in the same transaction. This is recorded in its update audit. Other edits/approval policies remain unchanged. Paid invoices cannot be voided until completed payments have been reversed through the authorized existing reversal workflow.

For each PO line:

- `committed` is the quantity on all other reserving invoices, including historical invoices.
- `remaining billable = max(0, received − committed)`.
- `policy cap = received + ordered × invoiceQuantityTolerancePercent / 100`.
- A new committed invoice must satisfy `committed + its quantity ≤ policy cap`. Tolerance is shared cumulatively, not renewed for each invoice number.
- Any excess over actual received quantity is **always a mismatch**, even within tolerance. A within-cap exception needs explicit Manager/Admin authorization and a reason at submission, approval and posting. Quantities beyond the cap cannot be committed via a free-text override.
- Existing price/amount tolerance and three-way matching remain. Approval and posting of a mismatch require a review/override reason; posting refreshes the match rather than trusting a cached Draft result.
- Editing and revalidation exclude the current invoice. Stored line/header adjustments are not counted twice, and transition revalidation does not rewrite historical invoice amounts, line IDs or brand snapshots.
- Shared, sorted PO write locks within the transaction serialize competing invoice commitments, edits/releases and concurrent receipts. Mongoose transaction retries reread commitments after a write conflict. Invoice status/audit and posted price records commit atomically.
- The billable-quantities preview API uses existing Payables Read authorization. It is advisory; the server rechecks at submission, approval and posting. Invoice detail quantities are explicitly labelled as the last validation snapshot.
- Duplicate normalized supplier invoice numbers remain prohibited per supplier. Existing supplier-payment amount limits, idempotency, reversal permissions and outstanding-balance protection are unchanged.

## Compatibility / configuration

No data migration, seed, ID rewrite, new environment variable or production operation is required. Optional PO fields default for old records; existing invoices are counted dynamically. The new invoice query index follows the project's normal Mongoose index configuration; no `syncIndexes`, migration or production index operation is run here. A MongoDB replica set is required, as for production inventory transactions already. This phase does not repair historical overbilling automatically: review/void/correct it using authorized workflows before trying another commitment on those goods.

PO-embedded receipt response history increases document size over many small receipts. Very high-volume receiving may eventually merit separately persisted receipt response records with the same transaction/key guarantees; this release does not migrate historical purchasing data or introduce a duplicate receiving system.

## Automated verification

From `backend`:

```powershell
npm run test:purchasing-safety
node --test tests/*.test.js
npm run test:stock-recipe-accuracy
npm run test:stock-recipe-regressions
npm run test:pos-phase2
```

The purchasing/stock safety suites own temporary local replica sets and never read a production URI. The regression runner supplies owned test databases to older scripts; do not directly run legacy reset-based integration scripts against arbitrary connection strings. MongoDB's `mongod` must be on PATH (or use the existing `MONGOD_BINARY` test override).

From `frontend`:

```powershell
node --test tests/purchaseReceiptSubmission.test.js
node --test tests/*.test.js tests/*.test.mjs
npm run lint
npm run build
npm run start -- -p 3008
```

In another terminal, with Playwright available (or the existing `PLAYWRIGHT_MODULE` pointing to its installed module directory):

```powershell
node tests/purchasingSafetyBrowserSmoke.mjs
```

The browser smoke mocks every API and verifies 1440px/390px layouts, item selection, saved payload/key after an ambiguous failure and refresh, partial invoice lines, self-excluded availability and review reasons. It never changes real stock or invoices.

## Simple local manual test

Use a dedicated development replica-set database, not production.

1. Create/approve/order a two-item PO. In Receive select only one item, enter partial quantity, actual brand, lot and expiry. Verify the other line remains outstanding and only the selected base-unit stock increases.
2. Receive the rest in separate submissions; verify Received appears only after all lines are complete. On another incomplete PO, Manager/Admin Close Short with a reason; verify stock is unchanged and reorder confirmed inbound falls to zero.
3. Simulate a lost receipt response; reopen/refresh the same tab and Retry Original Receipt. Verify movement count/stock do not increase again. Do not clear browser storage or generate another key for that delivery.
4. Create a partial supplier invoice, remove unbilled lines and submit it. Start another invoice on the same PO; verify only the remaining received quantities default. Try billing the same goods again and verify commitment is blocked.
5. Verify legitimate split invoices can both be approved/posted. Edit a Review Required invoice and check self-exclusion and Draft reservation release. Void an unpaid invoice with a reason and check its quantity becomes available; disputed invoices keep their reservation.
6. Test concurrent receipts/invoice submissions in two windows, permitted within-policy overrides with Manager/Admin + reason, and unauthorized attempts with Inventory/Accountant accounts. Verify payment limits and reversal restrictions remain unchanged.
