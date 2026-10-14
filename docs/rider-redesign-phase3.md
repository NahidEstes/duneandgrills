# Rider redesign — Delivery completion and cash reporting

This is the third **visual redesign** phase, following the dashboard/list and
pickup-details redesigns. It does not change the saved delivery activation setting,
production configuration, payment rules or accounting workflow.

## Implementation

- Order details use the shared charcoal cards, amber actions and four-item rider
  navigation. The on-the-way banner distinguishes the actual pickup and order
  stages. Existing validated phone/address links remain; no simulated map, route,
  ETA or tracking was added.
- Confirm Delivery requires the assigned rider, an eligible `picked_up` delivery
  and an `out-for-delivery` order. Its own native confirmation dialog asks whether
  the customer received the order. Only confirmed server data produces the
  completion card, recorded Riyadh completion time and Delivered progress.
- Completed customer contact/address, delivery notes and item notes remain hidden.
  Back to deliveries preserves preview/rehearsal mode. Existing item/payment
  details, restaurant contact and the private allowlisted timeline remain available.
- Cash reporting has separate pending form, reported receipt, discrepancy and
  cashier-confirmed views. An input alone never completes a collection stage.
  Report receipts show only server-provided amount and recorded timestamps.
- The SAR input permits at most two decimals and cannot exceed the authoritative
  positive outstanding balance. Lower and zero collections require a private
  explanation; explanations are limited to 500 characters. Paid/zero/unknown
  balances have no collection form. A stored report suppresses a new report.
- Reporting cash and completing delivery never confirm payment. A discrepancy
  stays unresolved after manager acknowledgment. Only the existing authorized
  cashier workflow, with its current shift and untouched-balance requirements,
  may confirm the receipt. No new partial settlement or report-correction flow
  was introduced. Later unsupported order/balance changes display the recorded
  receipt together with a review warning rather than hiding the historical fact.
- Issue reporting now reviews the entered reason in a confirmation dialog. The
  unresolved notice and restaurant contact are prominent; a manager must resolve
  it before rider actions resume. Manager resolution text and other riders' issue
  history remain private.

## Safety and refresh

The original backend already exposes the required completion/cash timestamps and
enforces ownership, revision checks, transactions and idempotency. No backend API,
database model or migration was needed for this phase.

Every rider confirmation captures the exact reviewed payload and delivery/payment
fingerprint. Read failure, offline state, refresh, an in-flight submission or a
changed fingerprint blocks submission. HTTP 409 requires reviewing refreshed
details and explicitly opening a new confirmation. There is no automatic retry.
An uncertain response can be retried explicitly with the same in-memory key and
payload; a successful response blocks further actions until updated server details
arrive. Reloading still obtains the current authoritative stored report.

Existing 30-second visible/online polling, manual Refresh details, authentication,
preview and isolated rehearsal gates are retained. Cashier confirmation updates
appear on the next successful read. Dialogs use focus containment, Escape/Go back,
focus return and busy protection. Actions remain in document flow above the safe-area
bottom-navigation padding, so no new sticky action competes with the keyboard.

## Files

- `frontend/src/components/rider/RiderDeliveryDetails.jsx`
- `frontend/src/components/rider/RiderCashReport.jsx`
- `frontend/src/components/rider/riderCompletion.js`
- `frontend/src/components/rider/riderPresentation.js`
- `frontend/src/components/rider/riderPickup.js`
- `frontend/src/components/rider/rider.module.css`
- `frontend/tests/riderCompletion.test.mjs`
- `frontend/tests/riderPickupBrowser.mjs`
- `backend/tests/riderWorkflowBrowser.mjs`
- This document.

## Verification scope

Use the installed frontend dependencies:

```powershell
cd frontend
npm run lint
npm run build
node --test tests/riderCompletion.test.mjs tests/riderPickup.test.mjs
node tests/riderDashboardBrowser.mjs
node tests/riderPickupBrowser.mjs
```

The two browser scripts use owned loopback HTTP fixtures and headless Chrome.
The delivery script uses the real backend serializer and order-transition rules,
but its writes and later cashier receipt are **fixture records, not MongoDB
transactions**. It covers 320, 390, 820 and 1440 px, confirmation accessibility,
privacy, Ready/Preparing, delivery completion, prepaid/zero/unknown balance,
short/zero collection, issue pause, stale revisions, offline/read failures, duplicate
clicks and recovery after a cash report was stored but its response was lost.

The existing actual database/payment browser harness has been updated for the new
dialogs and labels:

```powershell
cd backend
node tests/riderWorkflowBrowser.mjs --management
```

It requires an available local `mongod` and owns a disposable loopback replica set.
It was not run for this phase on the new laptop because `mongod` is unavailable.
Do not substitute the cloud database. Physical Android/iOS keyboard and safe-area
behavior and production latency/configuration remain outside these browser checks.

Verified on 14 October 2026: 178 frontend unit tests and 92 backend unit tests
passed; frontend lint, production build, the updated backend browser-script syntax
check and `git diff --check` passed. Dashboard/list and delivery/cash fixture browser
suites passed at all four widths above. Tested WCAG 2A/2AA/2.1AA axe checks returned
no violations; dialog bounds, keyboard focus, horizontal overflow and bottom-navigation
clearance checks passed. Actual mobile/tablet/desktop screenshots were inspected.
