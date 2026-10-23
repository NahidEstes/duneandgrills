# Preparation workflow usability

Implements the three proposed mockups using the existing inventory shell,
stock engine, production transactions and batch allocation rules.

## Recipe ingredients and shortages

- Ingredient rows support name/SKU search and All / Raw / Prepared filters.
  The selected item stays visible when filtering; self/duplicate exclusions and
  compatible unit choices remain active. Reselecting an item preserves its unit.
  Searching/filtering is not an unsaved recipe edit.
- Required, usable and short quantities come from the private read-only
  `POST /api/inventory/preparation/availability` endpoint, in each stock item's
  base unit. It applies the existing eligibility service: expired, quarantined,
  damaged and required-expiry-unknown batches cannot become usable stock.
  Depleted batch history does not create a legacy fallback. Inactive stock is
  explicitly unavailable for production. This read never reserves/posts stock.
- Current recipe dependencies are displayed before their outputs. The complete
  loaded recipe definitions, including inactive recipes, supply the graph, not
  the searched recipe page. Large views explicitly limit the display to 100
  items, with an expandable first twelve. Graph save validation remains complete.
- A short prepared ingredient offers **Produce [item]** when its stock item and
  recipe are active and the latest availability read succeeded. **View recipe**
  opens a read-only view without discarding the current editor draft. An inactive
  child recipe does not invalidate already produced usable stock.
- Availability refreshes on input edits, focus, connectivity and explicit refresh.
  Failed/obsolete reads cannot enable production actions. Recipe list refreshes
  retain the open draft rather than unmounting it.

## Produce first and continue

1. Open **Produce [item]** from a recipe ingredient or production ingredient.
2. Review the suggested shortage target and explicitly apply it, or choose
   **Use one full batch**. Enter actual quantities, preparation time and required
   use-by date. No dates are extended or inherited automatically.
3. Review and confirm that upstream production separately. It uses the existing
   atomic confirmation endpoint and its own request key.
4. After confirmed success, choose **Continue to [previous preparation]**. The
   workspace reloads configuration and the original draft refreshes usable stock.
   Recipe notes, edited actual quantities, target mode and dates are retained.
   Any previous stock preview is discarded. Changed recipe versions require
   explicit recipe reselection/review; retained actuals are not silently reset.
5. Review and confirm the downstream production separately. Shortages never
   trigger recursive production, upstream deductions or automatic confirmations.

Drafts remain in memory within this workspace; navigation/reload warns about
unsaved or suspended drafts. They are not silently persisted as stock actions.
Uncertain confirmations keep the exact actor-scoped session-stored request and
key. Check/retry/review retains that key; switching production stages is disabled
after an unresolved attempt. A legacy pending request receives the same recovery
guard. Unsubmitted keys can rotate for a separate upstream step, and the resumed
unsubmitted draft receives a new key after the upstream outcome is known.
Post-commit storage cleanup failure is not reported as a failed stock posting.

## Stock impact and historical sources

- Preview and the confirmation dialog show each direct input's physical balance
  before, proposed change and balance after, plus finished output. Usable stock
  remains a separate eligibility figure. Missing balances remain unavailable.
  Insufficient previews clearly block confirmation and label partial allocation
  costs as **Allocated cost so far**.
- The preview fingerprint now also includes the finished item's physical stock
  and stock version, so a stale output before/after view cannot be confirmed.
  Already committed request replay/hash behavior is unchanged; old unconfirmed
  previews require a fresh review.
- **Ingredient batch sources** displays saved allocation quantity, historical
  unit cost, consumed cost and original production reference. Source links are
  resolved by the saved batch ID and matching finished item, never by editable
  lot/name text or a current recipe estimate. Missing source/cost evidence is
  labelled explicitly. Raw lots do not acquire invented production links.
- **View source production** opens its existing details/history in a nested
  dialog; closing it returns to the original review/details. The summary uses
  saved historical output/ingredients. Later edits, status changes or replacement
  prices do not reprice old allocations. No source lookup is a stock movement.
- The existing conservative reversal policy is unchanged. Downstream reversal
  restores the exact consumed direct lots. Prior downstream consumption and
  restoration still block upstream reversal. There is no cascade reversal.

No new schema, index, dependency, inventory type, migration or historical rewrite
is required. Existing raw/finished stock transfer, six-decimal quantity precision,
historical batch costing, actual-yield unit costs, permissions, audit, rollback,
expiry, order/refund/waste behavior and transaction requirements remain in use.

## Verification

All database/browser runs use owned disposable loopback replica sets, fixture
users and fixture inventory. No live/staging database or real stock was used.

Verified on 2026-10-23: backend unit tests 166/166, frontend unit tests 234/234,
the eight integration suites 74/74, frontend lint, final production build and
`git diff --check` passed. Both the existing preparation browser suite and the
new workflow suite passed at 1440/390/320 px, including WCAG checks. The mobile
dropdown is kept inside the viewport even when scrolling a long option list.

```powershell
# backend, with MONGOD_BINARY pointing to a local mongod executable
node --test --test-concurrency=1 tests/*.test.js
node --test --test-concurrency=1 tests/multiStagePreparationIntegration.js tests/preparationIntegration.js tests/preparationUpdatesIntegration.js tests/stockRecipeAccuracyIntegration.js tests/profitAndPriorityIntegration.js tests/recordIdsIntegration.js tests/launchReadinessIntegration.js tests/inventoryWorkspaceIntegration.js
# frontend
node --test tests/*.test.mjs tests/*.test.js
npm run lint
npm run build
node tests/preparationWorkflowBrowser.mjs
node tests/preparationBrowser.mjs
```

The new browser harness exercises recipe and production draft return, name/SKU
and type filtering without phantom edit warnings, availability errors/retries,
separate upstream request keys, stale output balance protection, offline blocking,
lost-response recovery, immutable batch costs despite changed item prices,
source/history navigation, physical before/after figures, conservative upstream
reversal and exact downstream restoration at 1440/390/320 px, with WCAG checks.

The installed Next.js version continues to report its existing security advisory
and React 18 deprecation. Builds can stop at the advisory reminder before a normal
retry completes. No dependency upgrade or security-check bypass is part of this
feature. Deployment is outside this change.
