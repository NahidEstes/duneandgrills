# Selling recipe workspace: Menu Item Recipes and Add-on Recipes

Implemented for `/inventory/recipes`. Recipe configuration, planning and exports never post stock movements. Production remains an explicit, separately confirmed operation in the existing ProductionWorkspace.

The original visual layout is retained: icon/colour summary cards, grouped tabs, compact item rows with prices, inline ingredient stock/cost fields and the four-column cost summary. The stock/portion planner is collapsed by default; copy/history actions stay in a compact toolbar. Saved revision identifiers appear only when reviewing saved versions/history.

## Eight updates

1. **Ingredient picker:** server search/pagination (20 per request), Raw/Prepared filtering and labels, duplicate choices disabled, independent selected-item hydration. Search requests are aborted when obsolete. New inactive ingredients cannot be selected; existing inactive/missing mappings remain visible for repair.
2. **Entered units:** compatible g/kg, ml/L and configured purchase units. The server converts each submitted quantity using preparationUnits and saves the existing quantityPerSale/quantityPerAddOn and base-unit fields. Conversion rounds to six decimals and requires 0.000001–1,000,000,000 base units. No implicit mass/volume conversion.
3. **Portion planner:** server-calculated physical/usable stock, whole-portion capacity, limiting ingredients, N-portion requirements and shortages. Uses the existing sale eligibility service, including Riyadh expiry, batch quality, genuine legacy fallback, depleted history and physical ceilings. Do Not Track never means unlimited stock. UI scopes are explicitly menu-only or add-on-only. The review API also supports selected menu add-ons; shared ingredient quantities are aggregated before computing capacity.
4. **Prepared ingredients:** read-only recipe view and Produce actions. Production uses its existing request keys, preview, confirmation, costing and reversal rules. The selling editor stays mounted; returning refreshes stock while retaining its quantities, units, flags and original saved revision. Menu recipe saves do not expand preparation dependencies.
5. **Draft protection:** list search/filter/paging do not replace the selected editor. Item/tab switches and normal link/refresh navigation warn before discarding changes. Ingredient search/filter/hydration and portion planning are not recipe edits. Save uses a synchronous double-click lock. Offline previews/saves fail closed. A failed list refresh cannot turn a committed save into a reported save failure. Conflicts and uncertain responses retain the draft and require reviewing the saved version.
6. **Cost confidence:** current reference estimates are separate from historical order costs. Missing, blank, invalid or unsupported monetary values remain unavailable. Genuine zero costs stay valid. Incomplete/untracked mappings do not show verified totals or margins; known partial cost is labelled. The former sales-coverage label now says configured price coverage and explicitly describes listed prices rather than actual sales.
7. **Atomic revisioned saves and history:** menu/add-on recipes, menu-item ingredient relationships and audit records commit together in a required MongoDB transaction. Every write checks an opaque saved revision and increments __v. The existing unique target index is checked and required, including for concurrent first saves and Do Not Track. History is paginated and AUDIT_READ protected, with actor, timestamp, reason and recorded before/after quantities/units/flags. Older missing evidence is never reconstructed from current prices/recipes.
8. **Copy, exclusion and export:** copy loads a source of the same recipe type, shows destination/source ingredients and replaces only draft ingredients after review. Destination price/tracking/recipe status and the source are preserved. Saving a new Do Not Track exclusion requires an explicit confirmation plus a 5–500 character reason. CSV export has current-page/all-filtered scopes, includes complete server results and neutralizes formula cells. A download is created only after receiving the whole successful response; unknown costs stay blank.

## Configuration API contract

Existing routes remain, with read-only review/history/export routes added:

| Route | Contract |
| --- | --- |
| GET /api/inventory/recipes | Menu catalog with recipe, recipeRevision, metrics, summary and pagination |
| GET /api/inventory/add-on-recipes | Same paginated contract; inventoryRecipe alias retained |
| GET /api/inventory/recipes/:id | Independently hydrate a selected menu recipe |
| GET /api/inventory/add-on-recipes/:id | Independently hydrate a selected add-on recipe |
| PUT either detail route | Requires expectedRevision (opaque token, or explicit null for first creation) |
| POST /api/inventory/recipe-review | Read-only draft normalization, reference cost and stock planner |
| GET either detail route/history | Paginated recorded audit history; requires audit.read |
| GET either list route/export | Requires scope=page or scope=all; accepts the same search/status/page/limit filters |
| GET /api/inventory/item-options | Existing pagination plus optional recipeType=all/raw/prepared |

Example configuration write:

```json
{
  "expectedRevision": "opaque token returned by GET",
  "isActive": true,
  "doNotTrack": false,
  "ingredients": [
    {
      "inventoryItem": "inventory item ObjectId",
      "quantity": 250,
      "enteredUnit": "g",
      "isActive": true
    }
  ]
}
```

The server ignores client cost/stock/base-unit assertions. Legacy base-quantity payloads remain accepted **with the revision precondition**; add-on quantityPerSale alias is retained. Missing revision is HTTP 428; stale revision/concurrent creation is 409. Clients must read and review the latest version rather than silently retrying with a new token. Enabling an exclusion also requires confirmDoNotTrack=true and reason. Inventory read/write capabilities remain independently enforced; history additionally requires audit.read.

The review body adds kind=menu/addon, id and integer portions (1–1,000,000). Optional menu addOns entries have id and integer quantity (1–100 per portion). Only active add-ons linked to that menu are accepted; requirements sharing an inventory item are summed before stock comparison. UI reference estimates cover the edited recipe, not the optionally selected add-ons.

Add-on PUT responses now use the catalog-with-recipe shape consistently with menu PUT; inventoryRecipe is also included. Both in-repository editing callers use the new contract. Order, POS, combo, add-on sale and refund request contracts are unchanged.

## Storage and release

- Optional ingredient enteredQuantity/enteredUnit fields were added to InventoryRecipe and AddOnInventoryRecipe. Existing base quantity/unit fields remain authoritative for sales.
- Revision uses existing __v plus updatedAt and recipe identity. Existing records need no revision backfill.
- No stock, batch, allocation, production, price or historical order cost migration/backfill is required.
- Deploy the frontend and configuration API changes together. Any external recipe-editing client must send expectedRevision; blind-write fallback is deliberately refused.
- MongoDB replica-set transaction support and the existing unique menuItem/addOn indexes are required. Save/export fail closed when required support is unavailable.
- Explicitly saving a draft in a purchase unit uses its **current** configured conversion, displayed by the server review before saving. Past records/allocations retain their original quantities and costs.
- Planner availability is advisory and does not reserve stock. Sale/production confirmation still revalidates actual stock.
- Drafts remain in memory; navigation protection does not make drafts durable across a forced browser termination.
- CSV generation uses the complete filtered server result inside a transaction and buffers the finished file. Failures/timeouts do not download a partial file. Large exports require adequate request time/memory.
- Existing Next.js 16.4.0 build security advisory and React 18 deprecation remain visible. Dependency upgrades are a separate change.

## Verification

Use only the disposable replica helper. It owns its temporary loopback MongoDB and never loads a live dotenv/database URI.

```powershell
# Set MONGOD_BINARY to a locally installed mongod executable.
# Set PLAYWRIGHT_MODULE if Playwright is supplied outside frontend/node_modules.

# backend directory
node --test --test-concurrency=1 tests/*.test.js
node --test --test-concurrency=1 tests/sellingRecipesIntegration.js tests/multiStagePreparationIntegration.js tests/preparationIntegration.js tests/preparationUpdatesIntegration.js tests/stockRecipeAccuracyIntegration.js tests/profitAndPriorityIntegration.js tests/recordIdsIntegration.js tests/launchReadinessIntegration.js tests/inventoryWorkspaceIntegration.js

# frontend directory
node --test tests/*.test.mjs tests/*.test.js
npm run lint
npm run build
node tests/sellingRecipeBrowser.mjs
node tests/preparationWorkflowBrowser.mjs
node tests/stockRecipeBrowserSmoke.mjs
```

The real selling-recipe browser suite uses owned Express/Next/MongoDB fixtures at 1440, 390 and 320px, checking accessibility and horizontal overflow. It covers more than 100 stock choices, draft retention, production return, reference conversion, copy/history, stale saves, lost-response recovery, explicit exclusions, add-on saves and complete exports. Backend tests cover concurrent first saves/edits, audit rollback, missing uniqueness indexes, unavailable transactions, shared add-on stock, expiry/quality/legacy/physical ceilings, authorization and preservation of original order cost evidence. Existing stock/order/refund/combo/production regression suites remain in place.
