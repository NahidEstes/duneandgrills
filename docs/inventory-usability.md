# Inventory usability improvements

Implemented 2026-10-23. Existing English inventory UI, routes, stock ledger,
batch allocation, historical costs and production/recipe workflows are retained.
All verification uses owned local fixtures; no live inventory, migrations, seed
or deployment commands were run.

## Using the updated workspace

1. **Navigation:** the sidebar groups existing pages under Overview, Stock,
   Purchasing, Recipes & Production, Monitoring & Reports, and Settings & Help.
   Collapse groups and pin up to ten pages in Favourites. The active group stays
   expanded. Preferences are scoped to the account and role in browser storage;
   inaccessible/unknown saved routes are discarded. A storage failure leaves the
   current visit usable. Mobile navigation supports Escape, focus containment,
   focus restoration and an inert background.
2. **Item drawer:** click an item name in Stock Items or a dashboard alert. View
   identity, units, purchase conversion, physical/usable balances, eligibility
   evidence, supplier/storage details and current reference cost. Batches,
   movements and recipe usage have separate paginated views. Reads and refreshes
   do not create batches or movements. Closing the drawer retains list filters,
   pagination and scroll. New reviewed movements save their base unit/name in
   immutable sourceDetails. Older history without a saved unit is explicitly
   labelled as recorded base units, rather than silently assuming today's unit.
3. **Mobile cards:** below the desktop table breakpoint, the same server result
   renders item cards with identity, physical/usable quantity, status/reasons and
   actions. Search/filter/sort/page state is shared. Existing desktop table column
   choices and saved views remain available.
4. **Dashboard:** summary cards open matching stock-health filters. Counts use the
   shared backend saleable-stock/expiry rules and full unique active-item totals,
   rather than the displayed alert sample. Expiring means today through the
   inclusive configured Riyadh alert window. Low excludes zero usable stock.
   Alert items open the item drawer. Filters are visible and can be cleared.
   Loading or failed reads never claim there are no alerts. Duplicate obsolete
   dashboard batch/low-stock sample queries were removed.
5. **Contextual actions:** item actions open Receive stock (outside PO), Record
   usage, Record waste, batches, movement history or Edit item. Item query
   parameters are supplied by the server route and verified by a fresh item read;
   inactive/missing selections cannot post. Receive stock clearly links to the
   existing purchase order Receive workflow for PO deliveries. UI/server approval
   controls remain in place.
6. **Eligibility:** drawer breakdowns use the shared server eligibility functions.
   Each saved quantity belongs to one bucket: quality (including explicit unknown
   quality) takes precedence over expiry. An expired quarantined batch is counted
   once. Required unknown expiry, unallocated physical stock, excess batch evidence
   and negative physical stock are explicit. If evidence does not reconcile, saved
   batch buckets are not presented as a complete division of physical stock.
   Genuine legacy fallback requires no batch history, including depleted history.
7. **Item search:** Stock In/Out, Waste, purchase-order lines and batch/movement
   filters use a visible searchable picker with debounced server search, paginated
   results, keyboard navigation, retry and independent selected-item hydration.
   Selection survives searching elsewhere. Late/aborted searches cannot replace
   newer results. There is no first-100-item selection cap. Filters may include
   inactive historical items; mutation forms require an active selection.
8. **Forms/review:** required quantity/unit/reason/expiry and safety controls stay
   visible. Optional receiving metadata and notes are under More details; stock
   item supplier/storage metadata is also collapsible while tracked expiry remains
   visible. Stock changes are first reviewed with server-converted purchase/base
   quantities and expected physical before/after balances, then explicitly
   confirmed. Usable stock is never inferred from the physical increase. Errors
   retain form input, and success displays confirmed ledger balances. Shared labels,
   help text and table captions have improved contrast.

## Read APIs

These routes require the existing inventory read capability, and new workspace
responses are private/no-store:

- `GET /api/inventory/item-options?search=&page=&limit=&includeInactive=true|false`
  returns bounded choices sorted by name/id. Existing READ-level cost information
  supports purchase-order defaults; no new financial permission is granted.
- `GET /api/inventory/items/:id/workspace` returns item metadata, shared-rule
  breakdown and action permissions.
- `GET /api/inventory/items/:id/batches?page=&limit=&status=all` returns saved
  batches, including depleted evidence when requested. No synthetic batch is saved.
- `GET /api/inventory/items/:id/usage?type=preparation|menu|addon&page=&limit=`
  returns recorded recipe references, including inactive/do-not-track labels.
- Existing paginated `GET /api/inventory/items/:id/history` remains authoritative.

## Reviewed stock changes and safeguards

The updated manual and waste forms use:

- `POST /api/inventory/movement-review/preview`
- `POST /api/inventory/movement-review/confirm`
- `GET /api/inventory/movement-review/request/:key`

Write capability is checked on all three, independently of the UI. Manual exact
adjustments and explicit negative overrides additionally require existing manager
inventory count-approval capability. Ordinary item negative-stock configuration
retains the existing stock service behaviour. Dedicated Waste never overrides
negative stock. Linked purchase/order/count mutations are refused here and must
use their original workflows. Legacy movement/waste endpoints remain compatible;
the new review/retry contract applies to the updated forms and endpoints.

Preview is read-only. Confirmation rechecks item identity, active state, physical
stock/version, units, purchase conversion, cost/expiry/negative configuration,
supplier and saved batch quantities/quality/cost/FEFO evidence. Changed evidence
requires a new review. Batch history gaps block deductions rather than creating
usable stock. The final posting calls the existing performStockMovement service,
preserving transaction, audit, FEFO, expiry, quality and lot-cost behaviour.
Normal manual usage retains existing physical allocation rules; saleable-only
order/production consumption remains governed by its existing services.

Each request key is globally unique and bound to its actor, exact request hash
and confirmed stock transaction. Request registration and stock/batch/audit writes
commit atomically in a mandatory MongoDB replica-set transaction. Concurrent or
lost-response retries return the original transaction. Changed payload/actor reuse
conflicts. There is no standalone fallback for this reviewed path.

The exact uncertain request/key is retained in account-scoped sessionStorage.
Offline submission and submissions without safe request storage are blocked.
Check saved stock result / Retry exact stock confirmation recover uncertainty.
Review again retains the same key, so a late prior success cannot become another
posting. Successful stock posts are not reported as failed because a subsequent
reorder-suggestion refresh fails. No purchase, invoice, payment or expense is
created by these manual stock actions; production loss is never deducted again.

Related runtime fixes: Stock In/Out now uses a shared guarded form rather than the
previous missing-useRef page implementation; validateMovementPayload no longer
references unrelated undefined purchase-item variables.

## Deployment requirements

New collection: InventoryMovementRequest, with a globally unique `{ key: 1 }`
index. Existing Mongoose model initialization provisions it when auto-indexing is
enabled. If production disables auto-indexing, provision the schema-defined index
through the normal deployment process. Confirmation fails with 503 if the complete
unique key index or transaction support is unavailable. No manual live index
creation or historical migration was performed in this task. No new secrets,
environment flags or dependencies are required. Existing stock and production
records require no rewrite or backfill.

## Verification

Use only an owned local MongoDB executable via MONGOD_BINARY:

```powershell
# backend
node --test tests/inventoryWorkspace.test.js tests/inventoryWorkspaceIntegration.js tests/adminInventoryHealthIntegration.js
node --test tests/preparationIntegration.js tests/preparationUpdatesIntegration.js tests/stockRecipeAccuracyIntegration.js tests/profitAndPriorityIntegration.js tests/recordIdsIntegration.js tests/launchReadinessIntegration.js
node --test --test-concurrency=1 tests/*.test.js
# frontend
node --test tests/*.test.mjs tests/*.test.js
npm run lint
npm run build
node tests/inventoryWorkspaceBrowser.mjs
node tests/preparationBrowser.mjs
```

Backend unit tests: 164/164; frontend unit tests: 232/232. Existing stock, order,
refund, costing, ID, health and preparation regression suites passed 68/68. New
workspace/read/review/index safeguards plus health integration and unit checks
passed 19/19. Frontend lint and the final production build passed. Earlier builds
stopped after compilation at the installed Next.js 16.4.0 security advisory gate;
the final build retained that warning and the React 18 deprecation warning. No upgrade or
security-check bypass was introduced. Upgrade Next before production release.

Browser fixtures verify 1440/390/320px navigation/favourites, responsive cards,
drawer/read-only evidence, search beyond 100 items, filters, physical purchase
conversion, stale review rejection, lost-success recovery, offline protection,
manual usage/waste and accessibility. Final browser checks also cover direct
table/drawer contextual actions, failed-search retry and a delayed obsolete
search response. The existing Preparation/Production browser suite passed at all
three widths, including batch label, target, history, yield and reversal flows.
Screenshots are written only to an owned
temporary directory. No physical stock, real suppliers, customer messages or live
inventory are used.
