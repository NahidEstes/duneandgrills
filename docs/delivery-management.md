# Explicit delivery management, attention and cash visibility

`/admin/deliveries` loads once on entry. Search typing/paste/clear and draft filters do
not fetch. Search/Apply (or Enter), Reset, paging, Refresh and attention/cash card
clicks are explicit commands. A confirmed mutation deliberately revalidates once.
There is no timer, focus/visibility refresh, reconnect reload, SSE or WebSocket.
`/rider` refresh behavior is unchanged. Refresh retains verified rows, selected exact
authorized detail, expanded details and rider/reason/terminal drafts. Server changes
require explicit review before further actions; incompatible actions remain blocked.
Failure retains the last success timestamp with stale warnings. Access revocation
hides private data. Reads are abortable/latest-wins and mutations lock selection.

## Attention definitions

All conditions are calculated on the server across authorized records, independent
of search, status and page. Each count is distinct deliveries within that condition;
conditions can overlap and must not be added as a unique total. Ineligible orders
remain visible for review but are excluded from operational attention conditions.

- Ready/unassigned: eligible restaurant order `ready`, delivery `unassigned`.
- Pickup delayed: delivery `assigned`, restaurant `ready`, at least the pickup
  threshold since **the later of assignedAt and Order.readyAt**. Both are required.
- Delivery delayed: delivery `picked_up`, at least the transit threshold since
  `pickedUpAt`. Generic `updatedAt` never resets a delay clock.
- Unresolved issue: eligible delivery `issue`, without a resolution timestamp.
- Delivered/no report: eligible delivery `delivered`, known positive outstanding
  balance and cash report `none`.
- Awaiting cashier: delivered, valid cash report `unconfirmed`.
- Discrepancy: delivered, cash report `discrepancy`, including acknowledged shortages
  until the existing workflow actually settles them.
- Timing unavailable: assigned/ready without either required pickup timestamp, or
  picked-up without a pickup timestamp. No historical dates are fabricated/backfilled.

Optional backend configuration (no migration or variable is required):

```text
DELIVERY_PICKUP_DELAY_MINUTES=15
DELIVERY_TRANSIT_DELAY_MINUTES=45
```

Defaults are 15 and 45 minutes; integers 1–1440 only. Invalid configuration fails
the read visibly instead of silently choosing an unexplained threshold. This does
not enable delivery or change Admin Settings/checkout behavior.

## Cash and scope

Existing authoritative outstanding balance remains total minus captured payment
records in integer halala, or zero for settled/refunded payments. Unknown/invalid
balances or ineligible records are labelled unavailable/requires review. Read-model
Mongo expressions are regression-tested against the shared contract for parity.

- Customer collection pending: known positive balance with no rider report, all time;
  sums **outstanding customer balance** across the authorized delivery scope.
- Awaiting cashier: valid unconfirmed reports, all time; sums **rider-reported cash**,
  not customer debt or confirmed money.
- Discrepancies: valid discrepancy reports, all time; sums their **reported cash**;
  the separate outstanding ledger balance remains visible for investigation.
- Confirmed Today: valid confirmed reports with `confirmedAt` in today's Riyadh
  midnight-inclusive / next-midnight-exclusive range; sums confirmed report amounts.
  This is receipt activity, not new order revenue, net sales or profit.

After a report, do not ask the customer to pay that reported cash again. The original
outstanding payment ledger may remain positive until cashier confirmation. No parallel
ledger, partial capture or automatic settlement exists. Shortage acknowledgement is
not payment. Existing confirmation still requires the user's own open terminal/shift
and the supported full untouched balance, with normal concurrency/audit safeguards.

Admin/Manager scope: all authorized restaurant deliveries. Cashier scope: delivered
cash-report records only; no assignment/enrollment/rider directory access. Rider
scope remains own deliveries and does not receive the new management aggregates.
Private authenticated APIs retain `no-store`. There is no new schema/index/migration.

## Isolated verification / manual rehearsal

From frontend: `node --test tests/*.test.mjs tests/*.test.js`, `npm run lint`,
`npm run build`. From backend: `node --test tests/deliveryManagementIntegration.js
tests/riderWorkflowIntegration.js tests/riderActivationIntegration.js`.

After a frontend build, run `node tests/riderWorkflowBrowser.mjs --management` from
backend (Playwright/installed Chrome required; bundled runtime can be supplied via
`PLAYWRIGHT_MODULE`). It owns a random-port temporary Mongo replica set and local
API/UI, creates dummy data only there, tests zero implicit requests, draft/selection
preservation, revision review, failure recovery, mobile/keyboard/axe and the existing
manager→rider→cashier workflow. No real database/configuration is accessed.

For a human, use `node tests/riderWorkflowBrowser.mjs --manual` and the printed local
URLs/dummy credentials. Select a delivery, enter drafts and expand details; type a
search/change a filter without applying, then Refresh and verify drafts survive.
Apply a nonmatching query: authorized selected detail remains outside results. Use
attention/cash cards to deliberately filter, then Reset. Report cash as the rider;
verify the ledger stays unpaid until the cashier confirms at terminal `LOCAL`.
Stop with Ctrl+C; only the harness-owned temporary database is removed.

Production load/latency, real role accounts and historical missing timestamps are
not verified by a local rehearsal. Summary aggregation is server-side/batched but
must examine the authorized delivery scope; no cache or production indexes were added.
