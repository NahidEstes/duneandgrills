# Rider cash clarity and mobile workflow

## Cash definitions (existing ledger, no new accounting)

- `collection_pending`: known eligible customer balance; no rider cash report. The displayed collection amount is `customerCollectionHalala`.
- `awaiting_confirmation`: a rider report exists. Display `reportedCashHalala`, not an instruction to collect the balance again. Only a cashier can confirm payment using the existing shift/payment workflow.
- `discrepancy`: reported shortage awaiting authorized handling. Manager acknowledgment does not confirm payment; this change adds no partial settlement.
- `confirmed`: cashier-confirmed rider receipt. It is not additional revenue.
- `no_collection`: no customer collection required. Refund states do not reopen settled debt.
- `unavailable`: unsupported/ineligible order, unknown balance or invalid report. No amount is invented.

Cards, details and history share `RiderCash`. Details distinguish the current customer ledger balance, rider-reported collection and cashier-confirmed receipt. Never sum these overlapping facts as revenue/earnings.

## Reads, privacy and refresh

`/api/rider/portal` and the isolated `/api/rider/workflow` list use the authenticated rider ID. Pending Cash groups count **all own delivered records**, independently of table/history filters and pagination. Group amounts are current outstanding balances for unreported orders, and reported amounts for the other two groups. The compact section links the latest five tasks directly; each category links to all matching history records.

History accepts bounded order-number search, delivered-date `all/today/yesterday/custom`, cash state, page and limit. Both custom dates are inclusive Riyadh calendar days, implemented as inclusive start/exclusive next midnight. Search/Enter, Apply, Reset and pagination are explicit; typing does not fetch. Active records cannot be forced into history with a conflicting status filter. Historical contact/address and item notes remain hidden.

Assignment notices compare the server count of this rider's recorded assignment-history events across deliveries, including formerly assigned records. Pagination, completion and reassignment away do not increase the count; a new actual assignment does. The first response establishes a baseline. No sound, navigation, notification permission or persistent notification system is added. Legacy records without assignment history cannot invent notifications; deleting history would invalidate this baseline and is not supported.

Rider list/details poll every 30 seconds only while visible and online; focus/visibility/reconnection can refresh sooner. Simultaneous in-flight reads are coalesced, newer filter responses win, and mutation invalidation schedules a follow-up if needed. Previous cards/drafts remain during refresh; failures retain the last successful timestamp with stale/offline warnings. Actor/role/URL-mode changes remount private drafts and gate old data immediately. Denied access clears protected results; expired sessions follow the existing auth flow. These hooks are rider-only: `/admin/deliveries` remains explicit/manual refresh with no polling/focus/search-on-typing changes.

## Confirmations and timeline

Pickup, delivery and cash reporting use the existing native modal dialog, keyboard focus containment, Escape/Cancel and focus return. The dialog captures the reviewed delivery/payment fingerprint and exact payload. A changed fingerprint or HTTP 409 requires closing/reviewing current details and explicitly restarting; it never silently adopts newer revisions. Rider requests additionally send the reviewed order revision; backend validation/transaction claims protect concurrent payment changes. Older clients remain compatible. Uncertain retries preserve the same idempotency key/payload in memory; offline actions are never queued/replayed.

The rider timeline is a separate allowlist of actual own delivery/cash timestamps and own issue/resolution events. It does not expose manager audit notes, assignment reasons, resolution reasons, staff identities or another rider's issue history. Resolving an issue resumes the existing prior stage; no reset/cancellation/refund is introduced.

## Restaurant contact and owner checks

Contact Restaurant/Manager reads only the stored `RestaurantSettings.location.phone`, never an invented fallback or a staff personal phone. Configure/verify the restaurant operational number in existing Admin Settings → Location/contact. Missing/invalid contact is explicitly unavailable. Calls/maps require an explicit click.

No migration, seed, new environment variable, dependency upgrade or production activation is required. Existing rider enablement/isolated rehearsal gates remain authoritative. This work does not enable delivery, change checkout, stock, prices, refunds, payments or reporting definitions.

In an authorized local test environment:

1. Assign a ready restaurant-managed order to a rider; open `/rider` as that rider. Switch filters/pages, refresh, temporarily disconnect and reconnect. Cards/drafts should remain and last-success time must not advance on failure.
2. Confirm Pickup, report an issue, resolve it as a manager, refresh and verify Picked Up resumes. Confirm Delivery and verify the order is still unpaid until cashier receipt.
3. Enter cash, review the amount/reason in the dialog, cancel/reopen or confirm. Verify Pending Cash and History show awaiting cashier rather than collect again; confirm as a cashier with an existing open shift. Verify one receipt, not a second stock deduction.
4. Use History search/Enter, cash/date Apply, custom dates and Reset. Check delivered-date Riyadh boundaries and hidden historical contact/address.
5. Assign another order while the rider portal is open; verify the notice without automatic navigation. Page changes alone must not produce it.
6. On mobile check touch targets, keyboard, confirmation Escape/Tab/focus return and content clear of bottom navigation. Check logout/permission loss removes private data.

Automated disposable full-flow browser rehearsal (requires an already built frontend, installed Chrome and Playwright):

```powershell
# From backend; PLAYWRIGHT_MODULE is needed only if Playwright is not locally resolvable.
node tests/riderWorkflowBrowser.mjs --management
```

This script owns a temporary loopback replica set and dummy users/orders; it never reads a production URI. `--management` also asserts the Admin manual-refresh rules. Do not use real customer data for rehearsal.

## Verification (13 October 2026)

- Backend delivery/rider regression group: 61/61 passed, including nine new rider accuracy cases (parent/child cases counted by Node's test runner).
- Existing order engine, production safety and reporting regression group: 58/58 passed. No accounting or inventory regressions observed in these isolated tests.
- Frontend Node tests: 157/157 passed; `npm run lint` passed without warnings/errors. Edited backend JavaScript syntax checks and `git diff --check` passed.
- `npm run build`: production build passed, 31 generated pages, including the framework's TypeScript stage. Existing React 18 deprecation warning remains; dependencies were not upgraded.
- `node tests/riderWorkflowBrowser.mjs --management`: disposable full-flow Chrome rehearsal passed with one cashier movement and zero stock movements, active polling, retained reads/drafts, cash/history links, issue resolution, dialogs/keyboard and the Admin manual-refresh regression checks.
- `node tests/riderBrowserSmoke.mjs` (frontend): isolated HTTP fixture smoke passed at 390, 820 and 1536 px; keyboard, empty/error/permission states, preview privacy and no writes verified. Axe checks reported no WCAG 2A/2AA/2.1AA violations on tested views.
- Actual screenshots were inspected. Responsive browser simulation is not physical Android/iOS testing; real on-screen keyboard and device safe-area behavior still need an owner/device check. Production latency/configuration were not verified and delivery was not activated.
