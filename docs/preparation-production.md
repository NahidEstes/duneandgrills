# Preparation recipes and production

Added 2026-10-22. All new screens use English and the existing inventory shell,
dark theme, amber actions, custom selects/date pickers and accessible native
confirmation dialog. No seed, historical rewrite, customer email, production
deployment or live inventory migration is part of this implementation.

## Using the feature

1. Create/reuse the required existing Stock Items. Choose appropriate base units
   and enable expiry tracking on perishable finished items. Do not create another
   copy of an ingredient just to use it in a preparation.
2. Open Inventory → **Preparation Recipes** (`/inventory/preparation-recipes`).
   Create a recipe with a finished item, expected batch yield, unique raw inputs,
   active status and optional notes. Saving/editing this configuration never moves
   stock. Editing requires the current recipe version; finished-item identity is
   fixed after creation. Create a different recipe for a different finished item.
3. Open **Production** (`/inventory/production`) → **Record production**. Select
   an active recipe and multiplier, review actual input quantities, enter actual
   usable output, prepared date/time and any required use-by date. Changing the
   multiplier explicitly resets actual quantities to expected quantities.
4. Choose **Review & confirm production**. The server proposes usable FEFO input
   batches, availability, cost transfer and actual finished stock. Review the
   confirmation dialog, then confirm only after preparing the stock. Preview,
   drafts, closing the dialog and failed validation do not change stock.
5. Use **View batch** in history for immutable recipe/version, actual inputs and
   lot-cost snapshots, output, remaining physical batch balance and linked stock
   movements. Search, preparation, status and Riyadh date filters are server-side;
   pagination/counts and summaries cover the full filtered result, not one page.
6. In **Menu Item Recipes** (the existing `/inventory/recipes`), use the finished
   stock item directly, e.g. 0.025 kg per burger for a 25 g serving. Do not add the
   raw preparation inputs again. Existing order deduction expands menu/combo/
   add-on recipes only; it never recursively expands preparation recipes.

## Units, dates, stock and costs

- Server conversion is authoritative, with six-decimal inventory quantity
  precision. kg↔g and L↔ml are compatible. Containers or cross-dimension units
  require that exact purchase unit and a positive conversion factor explicitly
  configured on the item. Mass/volume density is never guessed. Browser unit
  choices are hints; the browser never posts calculated stock balances/costs.
- All quantities show their unit. Very small base quantities retain up to six
  decimals instead of appearing as zero. Times and calendar expiry follow
  Asia/Riyadh; prepared time cannot be future, tracked finished stock requires a
  use-by date, and production cannot create already expired stock.
- Raw inputs must be active and usable **now**, using existing inclusive Riyadh
  expiry, FEFO, quality, unknown-expiry and legacy-balance rules. Backdating the
  preparation does not authorize consuming expired ingredients. Missing batch
  history permits the existing legacy fallback; existing history with a gap does
  not create invented usable stock.
- Actual raw consumption is STOCK_OUT, and actual finished output is STOCK_IN
  with a PRODUCTION batch source. Every movement has the production reference
  and kind in sourceDetails. No new public stock-movement types are introduced.
- Consumed lot quantities × saved lot costs transfer into the finished batch.
  Finished unit cost = total consumed cost / actual usable output, stored to
  twelve decimal places. Saved batch cost allocations remain authoritative for
  orders, valuation, waste and refunds. Old records are never repriced from an
  edited recipe or today's prices. Recorded zero-cost inputs remain zero and the
  preview flags them for review; they do not prove verified free food/profit.
  Missing/null/invalid input batch costs block production until reconciled;
  today's item cost is not substituted for a missing historical lot cost.
- Expected-minus-actual yield is informational, never a second waste deduction.
  Production creates no purchase, supplier invoice, expense, payment or sale.
  Existing profit reporting reads order-linked consumption, so production's raw
  deductions do not become another food cost on top of finished-item consumption.
- Existing order cancellation and partial refund/restock restore the original
  finished lots, not their raw ingredients. Finished waste removes finished stock
  only. Physical remaining stock is read from the actual InventoryBatch and may
  include stock that is expired/blocked; physical quantity is not saleable stock.

## Atomicity, retry and corrections

Production and reversal always require MongoDB replica-set transactions, even if
the development-only nontransactional inventory fallback is opted in. A missing
transaction-capable database returns 503 instead of partially posting a batch.
Stock version checks, batch compare-and-set and transaction retry remain active.

A shared configuration lock serializes recipe graph changes and production
confirmation. Raw-only inputs exclude any other preparation output, including
inactive definitions and historical production batches. Concurrent edits cannot
introduce nested/circular preparation. This deliberately conservative first
version does not support preparation-as-input or changing a recipe's finished
item. Confirmation rechecks recipe version, stock and cost evidence against the
server preview fingerprint; changed evidence requires a fresh reviewed preview.

Each confirmation has a unique request key and payload hash. Concurrent/retried
requests with that same key return the original result; a changed payload or
different actor cannot reuse it to create another batch. The browser stores the
exact uncertain request in sessionStorage, blocks duplicate clicks, and exposes
**Check saved result** / **Retry exact confirmation**. Explicitly reviewing again
retains the same request key. A late successful request therefore cannot turn
into a second posting. Offline submissions are blocked; success is shown only
after a server result or an authenticated saved-result lookup.

Confirmed records have no edit/delete API. Admin/manager inventory count-approval
permission can reverse an untouched completed batch, with a reason and explicit
confirmation. Reversal removes that exact finished batch (not another FEFO lot),
restores original raw batches/costs/expiry and appends reversal movements/audit.
Any subsequent finished-batch consumption, waste, adjustment/restoration, missing
original batches or quantity mismatch blocks reversal. Even fully restored order
consumption remains a dependency in this first version. Reversal is a recording
correction; it does not physically turn prepared food back into raw ingredients.
Changed item base units, batch costs, original ingredient expiry or restoration
above original received quantity also block reversal; changed costs are never
used to create inventory value from a historical correction.

## Permissions and operational requirements

- Backend reads require INVENTORY_READ. Recipes, previews and production require
  INVENTORY_WRITE. Reversal requires INVENTORY_COUNT_APPROVE. Existing inventory
  page roles are preserved; accountant inventory navigation stays restricted.
- New collections: PreparationRecipe and Production; new PRD annual references
  reuse existing immutable record-number counters and permission-aware ID search.
- Recipe finished-item uniqueness, production request-key uniqueness and PRD
  uniqueness are schema indexes. Existing Mongoose initialization creates these
  through the usual deployment path. The readiness check now verifies them. If
  the environment disables automatic indexing, provision the new schema indexes
  through its normal reviewed process before use; no index migration was run
  against a live database here.
- No new secret or environment setting is needed. Production uses the existing
  MongoDB connection and requires replica-set transactions. All counters/stock/
  batches/records/audit writes for a posting are transactional except existing
  readable-ID reservation, which intentionally leaves gaps on rollback.
- Selection configuration has explicit limits of 10,000 active stock items and
  1,000 preparation recipes; exceeding them returns an error instead of silently
  truncating selection. Production graph confirmation is serialized in this first
  version; it favors safety over high-volume parallel posting.

## Verification

Use an owned local mongod executable via MONGOD_BINARY (not a cloud URI).

```powershell
# backend
node --test tests/preparation.test.js tests/preparationIntegration.js
node --test tests/stockRecipeAccuracyIntegration.js tests/profitAndPriorityIntegration.js tests/recordIdsIntegration.js tests/launchReadinessIntegration.js
node --test tests/*.test.js
# frontend
node --test tests/*.test.mjs tests/*.test.js
npm run lint
npm run build
node tests/preparationBrowser.mjs
```

The browser harness uses real controllers against its owned disposable local
replica, loopback Express and production Next. It checks 1440/390/320px layouts,
unsaved draft retention, recipe save without stock writes, unit entry, preview,
confirmation, offline protection, a lost successful response with saved-result
recovery, real reversal, stale history recovery and WCAG checks. PLAYWRIGHT_MODULE
can point to an already installed Playwright module. Screenshots go into an owned
temporary folder. No real users/orders/inventory balances are used.

Verification on this checkout (2026-10-22): backend unit tests 151/151,
frontend unit tests 222/222, the five owned integration suites above 53/53,
frontend lint, and all three browser sizes passed. The targeted production suite
was also rerun after adding missing-cost and reversal-dependency guards.
Production compilation/static generation succeeded, but the final `npm run build`
command exited 1 at the installed Next.js 16.4.0 security-advisory gate. Read-only
`npm audit --omit=dev` independently reported Next advisories. This is an existing
dependency issue; no Next/React/package-lock upgrade or security-check bypass was
included in this inventory feature. Resolve it before treating the checkout as
ready for production release.
