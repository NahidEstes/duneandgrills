# Preparation recipes and production

Added 2026-10-22. All new screens use English and the existing inventory shell,
dark theme, amber actions, custom selects/date pickers and accessible native
confirmation dialog. No seed, historical rewrite, customer email, production
deployment or live inventory migration is part of this implementation.

## Using the feature

### Recipe and production improvements (2026-10-23)

- Recipe cards show the finished item, expected output/unit and ingredient count.
  Finished names are resolved for the displayed page, including inactive items.
- Selecting a recipe in Record Production displays its saved preparation notes
  before confirmation. An explicit message identifies recipes without notes.
- **Plan production by → Target output quantity** accepts a compatible metric
  unit or an explicitly configured purchase unit. **Apply target** calculates the
  multiplier and resets expected ingredient/finished quantities. Edited actuals
  require an explicit reset confirmation. Target edits must be applied before
  reviewing production. Actual usable output remains a separate entry. For a
  2 kg recipe, a 5 kg / 5,000 g target produces a 2.5 multiplier. Server conversion
  and six-decimal base quantities remain authoritative. The applied target is
  saved immutably; it never moves stock by itself.
- **Inventory Settings → Production output variance threshold (%)** is editable
  under the existing manager/admin count-approval permission. The default is 10%;
  allowed values are 0–100, including decimal percentages. A deviation strictly
  greater than the threshold, either below or above expected output, requires a
  nonblank Yield Explanation. Exactly at the threshold does not require one.
  The browser warns before review; the server enforces the requirement before any
  posting. Policy changes share production's configuration transaction lock and
  invalidate outstanding previews. Each new batch saves its threshold, signed
  percentage, direction and calculation version. Historical batches without this
  evidence remain labelled as unrecorded; there is no backfill or retrospective
  classification. This policy compares expected and actual output, independently
  of the existing physical input/loss calculation, and creates no Waste entries.
- Completed batch details offer **Print label → Batch label preview** with an
  80 × 80 mm printable label: saved preparation name, saved finished item name,
  batch reference, prepared time and use-by date in Asia/Riyadh. Select matching
  paper and 100% scale in the browser print dialog. Labels use escaped saved text,
  an isolated print frame and no record mutation. Reversed batches cannot print.
  For older batches without a saved finished name, the label explicitly shows
  that the name was not recorded and the saved item identity; it never substitutes
  today's name as historical evidence. Physical printer output was not tested.
- **View version history** is visible only with the existing AUDIT_READ capability
  (admin/manager). `GET /api/inventory/preparation-recipes/:id/history` enforces that
  permission independently and serves private/no-store, paginated audit evidence.
  Each change compares before/after recipe name, expected output/unit, status,
  notes and added/removed/changed ingredient quantities/units, with actor/time.
  Old audit ObjectId byte snapshots are decoded when complete; missing evidence
  is explicitly unavailable, never reconstructed from current stock or recipes.
  New saves record string item identities in the same existing audit collection.
  No new history collection, index, migration or historical rewrite is required.

New optional Production fields: `target`, `variance`, `finishedName`. New inventory
setting: `productionVarianceThresholdPercent` (effective default 10). Clients with
pre-feature saved requests keep the original request hash when target fields are
absent; already committed requests still replay before new policy validation.
Updating the new setting requires the existing transaction-capable database.

### Original workflow

1. Create/reuse the required existing Stock Items. Choose appropriate base units
   and enable expiry tracking on perishable finished items. Do not create another
   copy of an ingredient just to use it in a preparation.
2. Open Inventory → **Preparation Recipes** (`/inventory/preparation-recipes`).
   Create a recipe with a finished item, expected batch yield, unique raw/prepared inputs,
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

## Multi-stage preparation (2026-10-23)

The three mockup workflow improvements (ingredient search/shortages, separate
upstream production with draft return, and stock impact/source production views)
are documented in [Preparation workflow usability](preparation-workflow-usability.md).

Select another preparation's finished **inventory item** as an ingredient. The
ingredient choices label known recipe outputs Prepared and other items Raw;
all active options load independently of the recipe library's search and page.
The existing explicit configuration limits fail visibly rather than truncating
choices. Zero stock is allowed when defining a recipe, but blocks production
until usable stock exists. Recipe save and preview do not move stock.
Recipe search/filter changes outside a form no longer trigger an unsaved-draft
warning; edits inside the recipe form retain the existing discard protection.

For Whole Onion → Sliced Onion → Caramelized Onion, save both recipes, produce
Sliced Onion in Production first, then produce Caramelized Onion using Sliced
Onion and its other direct ingredients. 1,000 g whole → 900 g sliced, followed
by 500 g sliced consumption leaves 400 g sliced (example quantities only).
The second stage never deducts whole onion again or automatically produces an
upstream recipe. Missing usable stock requires a separate production operation.

Each stage uses existing eligible FEFO batches, their historical costs and
actual finished yield. No recipe estimates, current replacement prices, child
cost surcharge, automatic shelf-life reset or recursive stock expansion is
introduced. Source batch IDs/lot numbers and original production movements
remain traceable; old costs and recipe snapshots do not change when an upstream
recipe is edited or deactivated. The user still supplies required use-by dates.

Downstream reversal restores its exact original direct-ingredient lots and does
not restore upstream raw inputs. Any downstream consumption/restoration history
continues to block upstream reversal, even after downstream reversal. No cascade
reversal, schema/index migration, dependency or historical rewrite is required.

Multi-stage verification: backend unit tests 166/166; the eight owned-replica
integration suites 74/74; frontend unit tests 232/232; lint and production build
passed. The build initially stopped at the existing Next.js security-advisory
reminder and then completed on the normal retry, with the advisory still present.
No dependency upgrade or security-check bypass was included. All stock tests use
disposable loopback databases. The expanded browser harness covers prepared
selection beyond 100 stock choices and independently of recipe search results,
self/duplicate exclusions, read-only saves/previews, direct-stock confirmation,
historical lot references, and the existing recovery/reversal/accessibility flows
at 1440/390/320 px.

## Preparation yield / loss report (2026-10-23)

Open **Production → Yield / Loss Report**. Today, Last 7 days, This month and
Custom dates use Asia/Riyadh, with an optional preparation filter. Custom ranges
include both selected days and are limited to 366 days. Paginated batch evidence
and full-range summaries use the same server calculation, not current-page totals.
Batch details and the production preview also show these figures.

- **Actual ingredient input** sums the saved actual inputs after metric conversion
  into the finished item's saved base unit. It requires complete ingredient evidence
  and a common mass (kg/g) or volume (L/ml) basis. Count/container output, mixed
  mass/volume inputs and missing historical evidence show physical loss unavailable,
  with a reason. Current purchase conversions or assumed densities are never used.
- **Total preparation loss** is positive actual input minus actual usable output.
  **Recorded quantity gain** shows the opposite difference separately. Losses and
  gains do not cancel each other in the summary. These are recorded quantity
  differences, not a determination that all missing quantity was damaged stock.
- **Output below expected** compares each batch's saved expected output with its
  actual output. **Output above expected** is separate. These are output variance,
  not another measure of raw stock consumed. For input 1,000 g, expected output
  900 g and actual output 850 g: preparation loss is 150 g, output shortfall is 50 g,
  and usable yield is 85%. Extra actual input changes total loss independently of
  the output shortfall. Summary yield is total comparable output / total comparable
  input, not an average of batch percentages.
- **Yield explanation (optional)** on Record Production accepts up to 500 characters,
  e.g. extra trimming or damaged raw material. It is saved immutably with the batch,
  participates in preview/retry checks, and appears in details/report evidence.
  Existing batches without an explanation say **Not recorded**; none are backfilled.
- Summaries group each preparation and saved output unit separately, retaining
  each batch's historical recipe target. Reversed batches remain visible but are
  excluded from effective totals. Physical-loss coverage and output-comparison
  coverage are explicit; missing quantities never silently become zero. Different
  recipe versions may share a group, but their own saved targets are used.
- The report is read-only under existing INVENTORY_READ permission. The API is
  `GET /api/inventory/production/yield-report` (`period=today|week|month|custom`,
  `from`, `to`, optional `recipe`, `page`, `limit`). Responses are private/no-store.
  It streams every matching record for totals without silently truncating the
  selection. Last updated, refresh, empty, loading and retained-error states are
  visible. Report reads create no ledger, audit, Waste or expense entries.

The entire actual input cost is still transferred into usable finished stock,
so reduced usable output increases its recorded unit cost. **Do not enter the
same preparation loss again in Waste / Damaged Stock**: that would deduct raw
stock twice. Later spoilage of the already produced finished stock continues to
use the existing Waste flow. No new configuration, schema index, live migration
or historical rewrite is required for this report; the optional explanation field
is stored only on new confirmations. Old exact requests without the field retain
their idempotent recovery behavior.

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
- Direct inputs (raw or prepared) must be active and usable **now**, using existing inclusive Riyadh
  expiry, FEFO, quality, unknown-expiry and legacy-balance rules. Backdating the
  preparation does not authorize consuming expired ingredients. Missing batch
  history permits the existing legacy fallback; existing history with a gap does
  not create invented usable stock.
- Actual direct-ingredient consumption is STOCK_OUT, and actual finished output is STOCK_IN
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
confirmation. Raw and prepared stock items may be direct ingredients. Graph
validation covers every recipe, including inactive definitions, and replaces an
edited definition before checking self/direct/indirect cycles and duplicate
outputs. Validation and save share the same transaction so concurrent saves
cannot introduce cycles or duplicate outputs. A recipe's finished item stays
fixed. Confirmation rechecks recipe version, stock and cost evidence against
the server preview fingerprint; changed evidence requires a fresh reviewed preview.

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

Updates verified on 2026-10-23: preparation/planning unit and owned-replica tests
32/32; separate stock, profit, record-ID and launch regression suites 40/40;
frontend unit tests 230/230; backend unit tests 161/161 with
`--test-concurrency=1`; frontend lint passed. An initial parallel backend run
hit the existing Notebook completion timestamp race; the isolated Notebook suite
and the full sequential run passed without changes to Notebook code.

The final production build completed successfully, retaining the installed
Next.js 16.4.0 security advisory and React 18 deprecation warnings. Earlier builds
stopped at the existing advisory gate after compiling/static generation. No
dependency upgrade or security-check bypass was added by this work; upgrade Next
before production release. No live deployment or live database changes were run.

The expanded browser harness verifies recipe summaries, saved notes, version
comparison, target unit conversion and multiplier, rejecting/accepting resets of
edited actuals, required variance explanations, isolated label preview/print,
saved settings, reversal, offline/stale/uncertain-confirmation recovery and WCAG
checks at 1440/390/320 px. It also renders labels to PDF and checks that two
maximum-length names fit one 80 mm label. Physical printers remain unverified.

Use an owned local mongod executable via MONGOD_BINARY (not a cloud URI).

```powershell
# backend
node --test tests/preparation.test.js tests/preparationYield.test.js tests/preparationIntegration.js
node --test tests/preparationGraph.test.js tests/multiStagePreparationIntegration.js
node --test tests/productionPlanning.test.js tests/preparationUpdatesIntegration.js
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

Yield-report verification on 2026-10-23: backend unit tests 158/158, frontend unit
tests 226/226, the five owned integration suites 55/55 and frontend lint passed.
Frontend yield rendering tests additionally
cover authoritative figures, unknown evidence, escaping, reversed/preview labels
and loading/error/empty/retained results. Browser tests at 1440/390/320 px verify
1 kg input / 0.9 kg target / 0.85 kg output, the saved explanation, filtered report
totals, custom Riyadh dates, failed-refresh recovery, reversal exclusion, no extra
stock writes, offline protection, stale/uncertain confirmation recovery and WCAG
checks. The production build compiled/static-generated successfully but exited 1
at the same installed Next.js security-advisory gate described below.

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
