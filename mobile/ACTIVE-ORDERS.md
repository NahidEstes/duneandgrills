# Home active orders

Implemented locally on 2026-10-11. Home places a charcoal/orange card below the fulfillment/address controls and above search. The most recently created active order supplies the actual number, status and fulfillment, independently of the future checkout selection. No reference-image order, ETA, phone frame or sample record enters production data.

## Behavior and lifecycle

Only `pending`, `confirmed`, `preparing`, `ready` and `out-for-delivery` count as active. Terminal (`delivered`, `cancelled`, `failed`, `refunded`) and unknown statuses are excluded. Pending displays “Order received” and “Waiting for restaurant confirmation,” with a receipt icon and every progress step neutral. Confirmed, preparing, ready and out-for-delivery use the actual backend status. Pickup progress ends in Collected; delivery includes On the way and ends in Delivered. The indicator becomes vertical below 360px or above 1.2 system font scale. Labels wrap, actions retain at least 48px touch height, and no unchanged-status live announcements are added.

More than one active order adds “View all active orders (N),” opening the existing Orders tab with its Active orders filter selected. All orders remains accessible. Guest active filtering verifies saved credentials and displays fresh statuses; ordinary guest history keeps its existing private tracking links. View order uses the existing `/order/[id]` route: owner order ID for authenticated customers, actual order number plus `guest=1` for guests. No credential is in a route parameter.

Unresolved submissions are never card candidates. A separate “Resolve unresolved order” Home action opens existing checkout recovery. Cart, checkout, idempotency, recovery storage, authentication, offers and menu logic are retained. No dependency, backend lifecycle, tracking endpoint, maps or notification service was added.

## Reads, privacy and freshness

Authenticated discovery waits for existing session verification and uses owner-authorized `GET /orders/my`. Home focus, foreground resume and pull/manual refresh rediscover active orders. The single foreground polling controller subsequently reads only the known active IDs via `GET /orders/:id`, at the existing 30-second interval; it does not poll historical orders for the Home card.

Guest discovery uses only securely saved guest credentials from the existing bounded tracking store. Saved summaries discover candidates; the card requires a successful private `GET /orders/track/:orderNumber` using `X-Order-Tracking-Token`. Each credential retains its original API origin. The guest interval is 120 seconds. Account credentials and unresolved requests are never guest candidates, and expiry retains the account owner rather than exposing saved guest orders.

The existing `useResource`/`ResourceController` handles focus, AppState, aborts, one request generation/timer, outage backoff and Retry-After on failed reads. Refresh reasons distinguish history discovery from status polling. Home does not start a timer after an unsuccessful initial discovery or an empty result. Blur, background, unmount, terminal status and inaccessible/revoked orders stop/remove the relevant work. Reader identity scopes state to current account/credential changes without putting secrets in scope strings. Aborted prior-account responses cannot update either cache or UI.

Outages retain the last verified status with “Status may be outdated” and Retry. A successful terminal or access-denied result removes that order even if another active read fails. Initial failures show a small refresh/retry notice, never a fabricated active card. No arrival/preparation estimate is invented.

## Changed files

- `src/app/(tabs)/home.tsx`: placement, refresh and separate recovery action.
- `src/components/active-order.tsx`, `src/components/icons.ts`: responsive card, progress, icons, navigation and accessibility.
- `src/domain/orders.ts`: active whitelist, newest selection and truthful status/progress mappings.
- `src/hooks/useActiveOrders.ts`, `src/services/active-order-reader.ts`: owner/guest discovery, selective refresh and scoped state.
- `src/hooks/useResource.ts`, `src/services/resource-controller.ts`: shared refresh reason and optional initial-poll policy; existing callers keep their behavior.
- `src/app/(tabs)/orders.tsx`: active filter, fresh guest active list and retained account-owner isolation after expiry.
- `tests/active-order.test.cjs`, `tests/run.cjs`: production-module tests.
- `tests/active-order-smoke.cjs`: intercepted browser scenarios; `tests/design-smoke.cjs` accepts an explicit fresh export directory.
- `README.md`, this record: behavior and verification handoff.

## Local verification

Passed: TypeScript, lint without warnings, **58 mobile tests**, Android/iOS Hermes and web export. Production-module tests cover lifecycle mappings, newest selection, unknown/terminal exclusion, guest verification/revocation, selective polling, outage retention including partial access removal, aborted state, wrong identity, expiry, timer cleanup/resume and no initial polling without a verified active order.

Chrome fixture smoke exercises actual routes/provider and proves pending/preparing/ready states, pickup/delivery progress, latest selection and multiple active filtering (including guests), owner/private tracking navigation, terminal removal, outage/retry, separate recovery, session expiry without guest fallback, 30-second signed/120-second guest polling, blur cleanup, account switch and a late old-account response. Visual inspection includes 320px and 390px widths, 130% browser text and Home scrolling. Existing Offers, Profile/address/account and Home/Menu/Cart/checkout diagnostic suites passed. Every API request was intercepted locally; no live/staging customer or order writes occurred.

Screenshots (ignored local artifacts): `artifacts/active-order-home-390.png`, `active-order-home-320.png`, `active-order-home-large-text.png`, `active-order-home-scroll.png`, `active-order-pending-390.png`, `active-order-delivery-390.png`, `active-order-offline-390.png`, `active-order-list-320.png`, `active-order-guest-list-390.png`. Numbers and statuses in them are isolated test fixtures.

Run from `mobile/`:

```powershell
npm test
npm run typecheck
npm run lint
node node_modules/expo/bin/cli export --platform all --output-dir artifacts/active-order-export --max-workers 2
# Browser diagnostics need installed Playwright/Chrome; set PLAYWRIGHT_MODULE if required.
node tests/profile-harness.cjs
node tests/active-order-smoke.cjs
node tests/profile-smoke.cjs
node tests/offers-smoke.cjs
$env:MOBILE_EXPORT_DIR = 'F:/My Projects/duneandgrills/mobile/artifacts/active-order-export'
node tests/design-smoke.cjs
```

No physical Android/iOS or emulator runtime test was possible on this Windows host (ADB/emulator/Java unavailable). Browser text enlargement is not native system font scaling; browser focus tests and pure controller tests do not establish native AppState, screen-reader, keyboard/back or SecureStore behavior. Verify foreground/background, real text scaling, scrolling, logout/switch and private tracking on a native device before release. Existing preview APK predates this feature; no APK/cloud build, commit, push, deployment or publication was triggered.

Suggested commit message: `feat(mobile): add Home active order status and tracking`
