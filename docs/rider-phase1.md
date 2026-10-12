# Rider Module — Phase 1

Private routes: `/rider`, `/rider/history`, `/rider/profile`. Existing staff authentication,
User `_id`, employee ID, active/session-revocation checks and audit-backed Admin → Staff
account management are reused. Only Admin can provision/edit/deactivate a rider.
The rider role has **only** `rider.portal.read`; Manager does not get preview access.
Public signup still creates customers. Backend APIs and Next server/client guards enforce access.

## Default operation / safe preview

`GET /api/rider/portal` returns only the authenticated actor's profile, empty deliveries/history,
unavailable counts (`null`, displayed as `—`) and `operationalEnabled: false`.
It does not query orders. Every non-read request under `/api/rider` returns
`503 LIVE_DELIVERY_DISABLED` after authentication/authorization. Unknown delivery IDs return 404.
`RIDER_DELIVERY_ENABLED=true` is a reserved future request, **not an activation switch in Phase 1**.
No availability records, assignments, transitions, cash reconciliation, notifications or earnings exist.

Synthetic preview requires ALL of:

- Backend `NODE_ENV=development` or `test`.
- Backend `RIDER_PREVIEW_ENABLED=true` (default off).
- Explicit backend `MONGO_URI` using `mongodb://127.0.0.1:<port>/dg_rider_preview`
  (or localhost/IPv6 loopback; `dg_rider_test` and an optional lowercase alphanumeric suffix also allowed).
  Remote/SRV/multi-host/credentialed/normal restaurant DB URIs are rejected. The shared disposable
  test harness database `dg_record_id_test` is permitted only with `NODE_ENV=test`.

Use a **separate local development instance and empty disposable database**, not the production
database. Start the existing backend/frontend against that local instance. Provision dummy Admin
and rider accounts using the existing approved development account workflow; no automatic seed is
included or run. Sign in through `/login`, then open `/rider?preview=1`. History/Profile retain the
preview parameter. An authenticated Admin can also open the preview. Production always rejects
`/api/rider/preview`, including a hand-entered query string.

Fixtures are constructed in memory, scoped to the current User ID, use `PREVIEW-*` identities,
synthetic addresses and explicitly sample amounts/times. They are never persisted. Availability
changes are local UI state (reset on navigation), never imply dispatch. View Delivery expands
read-only synthetic details. History never fabricates activity. No customer cart/favorites hydration
or reward-writing auth endpoint is requested by the rider workspace. Auth/profile responses are
allowlisted; no tokens/passwords/notes/customer addresses/reward or payment-account fields.
Private responses use no-store; the existing service worker does not cache private APIs or HTML.

## Phase 2 manual-assignment contract (not implemented)

Current Order uses Mongo `_id` plus immutable `orderNumber`, `orderType`, `status` (restaurant
fulfillment), `customer`, `totalAmount`, `paymentMethod`, `paymentStatus`, `paymentRecords`,
`refundedAmountHalala`, `manualEntry`, `deliveryProvider`, occurrence/creation dates and audit history.
There is no rider relation or independent delivery state. Do not overload restaurant `status`.

Future assignment must use the existing Order `_id` and User `_id`, with a separate delivery record
or dedicated subdocument: `order`, `rider`, `deliveryStatus` (assigned/picked_up/delivered/cancelled),
assignment/pickup/completion timestamps, assigning actor, reason/version/idempotency key and audit
events. Reassignment and concurrency need explicit server authorization and atomic checks. Every
rider list/detail/transition query must include the authenticated rider ID, never accept ownership
from the client. Historical completed views should omit contact/address information. Admin previews
must not become an unscoped real-order endpoint.

Only eligible real restaurant-delivery orders may be manually assigned: exclude void/cancelled,
historical `manualEntry` aggregator entries and pickup orders. Define activation/assignment policy
before enabling operations; keep checkout delivery availability unchanged until approved.

Derive amount-to-collect server-side from authoritative payment/refund records and explicitly agreed
collection responsibility, in halala. Never trust client totals, treat aggregator-prepaid orders as
restaurant cash, or infer settlement from order status. Unknown collection state must remain unknown.
Cash capture, reconciliation, payment idempotency, refund handling, privacy retention and delivery
status transitions require Phase 2 approval; this module does not alter accounting, POS or inventory.

## Verification commands

From `backend`: `node --test tests/riderPortal.test.js tests/riderPortalIntegration.js tests/productionSafety.test.js`.
The integration helper spawns a disposable local MongoDB replica set in an exact temporary directory
on a random port; it never loads `.env` or imports the production server. Requires local `mongod`.
From `frontend`: `node --test tests/*.test.mjs tests/*.test.js`, `npm run lint`, `npm run build`.
`node tests/riderBrowserSmoke.mjs` runs a production Next server against an in-memory local HTTP
fixture backend, not the real API/database; requires Playwright and installed Chrome. Set
`PLAYWRIGHT_MODULE` to the installed Playwright directory if not available by package resolution.
No migration, production seed, new dependency or production environment change is required.
