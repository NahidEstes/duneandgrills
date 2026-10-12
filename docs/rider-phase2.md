# Rider Module — Phase 2

**Activation update:** the rehearsal-only boundary below describes the original
Phase 2. The owner-authorized saved Admin toggle now supersedes it; see
[Rider activation](rider-activation.md). Preview/rehearsal isolation still applies.

This supersedes the Phase 2 foundation described in `rider-phase1.md`. Software is
implemented for a **disposable local rehearsal**, not activated for production.
No website checkout option, notification, dispatch scheduler, sale creation,
inventory deduction or historical order migration is added.

## Activation and access

`operationalEnabled` remains server-enforced `false`, including in production when
`RIDER_DELIVERY_ENABLED=true`. Production activation requires a separate owner
decision and implementation/configuration review; changing a flag cannot bypass
the current boundary.

The backend `RIDER_WORKFLOW_ENABLED=true` switch permits database-backed actions
only with `NODE_ENV=development|test` and an explicitly isolated, credential-free,
single loopback `mongodb:` URI named `dg_rider_preview` or `dg_rider_test` (optional
lowercase alphanumeric suffix). `dg_record_id_test` is allowed only for the owned
test harness with `NODE_ENV=test`. SRV, remote, multi-host, production and ordinary
restaurant database names fail closed. MongoDB transactions require a replica set;
the standalone-development fallback is not accepted for delivery writes.

`RIDER_PREVIEW_ENABLED=true` uses the same isolation gate and enables read-only
memory fixtures, not workflow records. It is separate from rehearsal activation.
Neither flag is required or should be enabled on production for this phase.

- Admin/Manager: `/admin/deliveries`, enrollment, assign/reassign before pickup,
  issue resolution and shortage acknowledgment.
- Cashier: only delivered cash-report records and confirmation through the cashier's
  own open shift. No assignment, enrollment, rider directory or preview capability.
- Rider: `/rider`, own availability, assigned delivery list/details/actions/history.
  No Admin/order-management/finance/inventory capability. Direct-ID reads/writes are
  rider-scoped on the server, not filtered only by the browser.
- Staff identities, employee IDs, Order `_id` and `orderNumber` are reused. Public
  signup does not provision riders; existing Admin → Staff management still does.

All delivery API responses are authenticated/private/no-store. Existing service-worker
rules exclude private HTML/APIs and mutations. Default pages show disabled/unavailable
states and do not query live orders. Explicit URLs are `/admin/deliveries?preview=1`,
`/rider?preview=1` or their `?rehearsal=1` counterparts in the isolated instance.

## Data and lifecycle contract

Optional `Order.deliveryMode` defaults to `none`. It is not inferred from an address,
and ordinary checkout/POS/entry clients cannot send it. Authorized isolated enrollment
marks an existing eligible order `restaurant`, recording a reason and unique Delivery
reference. It never creates a duplicate Order or repeats stock deduction.

Eligibility requires delivery type, website/phone/POS source, explicit restaurant mode,
no platform provider/aggregator-prepaid/historical manual entry, no cancelled/failed/
refunded/voided order or restored ingredients. Existing records are not backfilled or
automatically enrolled. Records invalidated later remain visible for investigation but
cannot be assigned, fulfilled or cash-confirmed through this module.

`Delivery` stores its order/rider, independent status, revision, attributable assignment
history, instructions/note, issue history and cash report. Assignment requires an active,
available rider. Availability only indicates willingness; it never assigns anything.
Counts are server-wide in the authorized scope, not page-local. Lists filter before
stable `updatedAt DESC, _id DESC` sorting and have a default 20 / maximum 50 rows per
page. The active-rider directory is bounded at 100; active counts include assigned,
picked-up and unresolved-issue records. Delivered Today uses the Riyadh calendar day.

Transitions:

1. `unassigned → assigned`: Admin/Manager; reassignment only while assigned, with reason.
2. `assigned → picked_up`: assigned rider; restaurant Order must already be `ready`.
3. `picked_up → delivered`: assigned rider; existing restaurant handover transition
   advances `out-for-delivery → delivered`. Delivery status and payment remain separate.
4. `assigned|picked_up → issue`: rider reason mandatory; no automatic cancel/refund.
5. `issue → recorded previous stage`: authorized resolution/reason; same rider/stage,
   no silent reassignment or reset after pickup.

Assignment and resolved-issue histories are retained (bounded to 100 each; reaching
the bound stops writes and requires investigation, never truncates old entries).
Central audit records retain actors, readable order number, identifiers, revisions,
state changes and correlation IDs. Free-text explanations are retained privately in
Delivery, not copied into general logs where they might contain customer information.

All writes require an idempotency key and expected revision. `DeliveryRequest` stores a
hashed scope/key and payload fingerprint plus a non-sensitive result. Identical retries
return the original result; changed contents, stale revisions and competing updates
fail. Delivery, Order transition/payment, shift movement, receipt and audit writes share
one transaction. Order/rider claims serialize competing payment, assignment and
availability operations. Failed audits also roll back payments and receipts.

## Cash boundaries and limitations

Outstanding balance is derived in integer halala from the authoritative total/payment
records. Paid or partially/full-refunded settled orders collect zero; a refund does not
reopen customer debt. Unknown/failed balances display Unavailable. Rider reports may
not exceed outstanding balance, are recorded only once after delivery and are **not
payments**. Shortages require a reason and an explicit Admin/Manager acknowledgment.

Cashier confirmation supports only an unconfirmed report equal to the full untouched
order balance, with no existing payment records or refund reservation. It requires the
confirming user's open shift on the specified terminal. The existing order-payment
service records the payment and the existing `pos-sale:<orderId>` cash movement once.
There is no separate revenue/finance ledger. Delivered never marks Paid by itself.

Partial balances, shortages and discrepancies remain clearly unconfirmed, even after
acknowledgment. Existing payment handling only supports full capture, so no fabricated
partial payment/reconciliation system is introduced. Broader discrepancy settlement or
cash-report corrections require a separately approved accounting workflow. Subsequent
refund/void handling remains in the existing payment system and does not change this
historical cash receipt.

Only active delivery details expose necessary customer name/phone/address and delivery
note. Delivered details/history hide customer contact/address, notes and item notes.
Lists do not contain contact/address. App URLs contain private record IDs only; phone
and Google Maps destination links require the rider's explicit action. Preview contact
links and workflow buttons are disabled. No live GPS or external app integration exists.

Loading, empty, errors, offline failures and last-successful Riyadh load times are explicit.
Reads are abortable; late/unmounted responses cannot replace another view. Mutations
are bounded while pending, ignore unmount and reuse their in-memory key on uncertain
retry. They are never persisted, queued offline or automatically replayed on reconnect.
Expired sessions return to the existing login flow. Reload current server state before
retrying an uncertain action after navigation/reload.

## Safe human rehearsal

Requires Node, installed project dependencies, local `mongod` and a successful frontend
build. No external database, dotenv, production server or production credentials are read.

```powershell
cd 'F:\My Projects\duneandgrills\frontend'
npm run build
cd ..\backend
node tests/riderWorkflowBrowser.mjs --manual
```

The command launches its own random-port Mongo replica set, dummy users/order/open
cashier shift, real authenticated API routes and the built Next UI. It prints local URLs.
Keep this process open; Ctrl+C stops the owned sandbox and cleans its temporary database.
It does not reset/drop any existing database. Use separate browser profiles/private
sessions for these **dummy sandbox-only** accounts, password `LocalDummy123!`:

- `manager@rehearsal.invalid`: open printed `/admin/deliveries?rehearsal=1`; select
  `TEST-REHEARSAL-CASH`, choose Local rider and Assign.
- `rider@rehearsal.invalid`: open printed `/rider?rehearsal=1`, View Delivery, Confirm
  Pickup then Confirm Delivery. Order is still unpaid. Report actually collected `40` SAR.
- `cashier@rehearsal.invalid`: open printed management page, Details; enter terminal
  `LOCAL`, Confirm Cashier Receipt. Reload rider details: Paid, zero to collect, confirmed.

Try issue/resolution before delivering, reassignment with a reason before pickup,
offline action/retry, empty status filters and preview-only URLs. For destructive/conflict
cases use automated isolated tests, not real staff/orders. Restarting the manual harness
creates a fresh independent sandbox; no production seed/migration is involved.

## Verification

From `backend`:

```powershell
node --test tests/riderWorkflowIntegration.js tests/riderPortal.test.js tests/riderPortalIntegration.js tests/productionSafety.test.js tests/orderEngine.test.js tests/orderEngineIntegration.js
node tests/riderWorkflowBrowser.mjs
```

The browser test requires Playwright plus installed Chrome; if Playwright is provided by
a bundled runtime, set `PLAYWRIGHT_MODULE` to its package directory. It starts the same
owned sandbox, exercises real UI/API/database actions, checks payment/stock invariants,
read-only preview, offline/no-queue and recovery, and runs axe at rider mobile/tablet and
Admin desktop sizes. Screenshots are saved only in a printed temporary visual directory.
From `frontend`: `node --test tests/*.test.js tests/*.test.mjs`, `npm run lint`, `npm run build`.
Existing Phase 1 `node tests/riderBrowserSmoke.mjs` remains a no-write regression suite.

No migration, backfill, dependency upgrade or production environment change is needed.
New Delivery/DeliveryRequest schemas declare their unique/query indexes; isolated tests
create them only in owned databases. Before any future production activation, review and
approve production index provisioning, load testing, operational eligibility/enrollment,
cash-discrepancy policy and privacy retention. None of those production operations has
been performed in this phase.
