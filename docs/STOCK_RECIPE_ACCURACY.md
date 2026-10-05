# Phase 1 — Stock & Recipe Accuracy

## Saleable inventory

Website checkout, POS and completed delivery-platform entry all use `deductOrderInventory`.
Only usable batches with a positive balance and a valid expiry policy participate in FEFO.
Quarantined, damaged and expired batches remain physical inventory but cannot supply a sale.
Expiry dates are inclusive through their **Asia/Riyadh calendar day**; stock expires at the
start of the following restaurant day. Historical delivery entry uses present stock eligibility,
not its entered historical order time.

For an expiry-tracked item, missing expiry is **not saleable**. For a non-expiry-tracked item,
missing expiry is permitted; an explicitly known expired date is still excluded. Historic
batches without a quality field retain the schema's usable default. Recipe screens expose
physical and saleable balances separately; batch screens explain blocked/unknown/unallocated stock.

Legacy item-only balances are compatible only if **no batch record has ever existed** for
that item (including depleted records). They still obey the item's expiry policy. A discrepancy
between physical balance and recorded batches is not automatically assigned an expiry or
made saleable. Reconcile it using existing authorized inventory processes; never delete batch
history to enable fallback. Reorder uses the same eligibility rules, capped at physical balance.
Waste, damage and downward adjustments retain physical-batch removal and stock/batch audits.

## Recipe readiness

Every sold menu item, combo component and selected add-on needs an active recipe with at least
one active, valid ingredient, unless **Do Not Track is explicitly saved**. Missing/inactive/empty
recipes block sales in every channel with actionable messages. Disabled ingredient rows are
intentional exclusions; a recipe with all rows disabled is invalid. Referenced ingredients must
exist and be active, unique, have positive quantities at existing six-decimal precision, and use
the inventory item's base unit. Existing purchase-to-base conversions are unchanged; arbitrary
recipe unit conversion is not guessed. Existing price/customization and per-line ingredient
snapshots remain authoritative, including combo and selected-add-on quantity multipliers.

## Transactions and rollout

No migration, seed, new environment variable or historical rewrite is required. **Before enabling
sales, review Recipes and Add-on Recipes** for newly visible missing/invalid recipes. Configure
them or explicitly choose Do Not Track only for intentionally untracked items. Review expiry dates
and batch quality; positive physical stock does not imply sufficient saleable stock.

Production continues to require MongoDB replica-set transactions. Existing stock version checks,
batch compare-and-set, order idempotency and refund/cancellation restoration are retained.
The existing opt-in standalone development fallback is not a production atomicity guarantee.

## Safe automated verification

From `backend`:

```powershell
npm run test:stock-recipe-accuracy
npm run test:stock-recipe-regressions
npm run test:pos-phase2
node --test tests/*.test.js
```

The first three commands create owned temporary local replica sets; do not substitute a production
URI. The regression runner supplies isolated database URIs to legacy scripts that reset test data.
Require a local `mongod` executable on PATH (or the existing `MONGOD_BINARY` test-only setting).

From `frontend`: `npm run lint`, `npm run build`, and
`node --test tests/*.test.js tests/*.test.mjs`. There is no separate typecheck script (JavaScript project).
The mocked browser checks are in `frontend/tests/stockRecipeBrowserSmoke.mjs`; run against a
local frontend on port 3008 with Playwright already available, or set `PLAYWRIGHT_MODULE` to its
installed module directory and `STOCK_RECIPE_SMOKE_URL` to your local origin. They intercept every
API call and check desktop/mobile warnings, explicit Do Not Track, and physical/saleable display.

## Manual checks (local test data only)

1. Create an expiry-tracked ingredient with usable future-expiry, expired, quarantined and damaged
   batches. Confirm positive physical stock and smaller saleable stock in Recipes/Batches.
2. Map a recipe; sell through website, POS and delivery entry. Only eligible batches decrease,
   in FEFO order. Attempt a quantity above saleable balance: no order, cash payment or movement
   should be created. Physical ineligible stock stays present.
3. Disable/remove a recipe, empty its active lines, or select an unmapped add-on. All channels
   should block; explicit saved Do Not Track should allow intentional non-stock items.
4. Sell a combo with multiple components and a multiple-quantity add-on. Inspect stock movement
   ingredient snapshots and base-unit balances. Retry a POS idempotency key: no second deduction.
5. Remove expired/damaged stock through an authorized waste/damage operation; inspect audit logs.
   Refresh reorder suggestions: all-blocked stock produces zero usable on-hand, not physical fallback.
