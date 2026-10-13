# My points — 13 October 2026

Profile now has a compact orange-star **My points** card with the current available balance and a chevron. It opens `/points`; the four existing bottom tabs are unchanged. Guests see a sign-in invitation, never a cached customer balance. The read-only screen includes back navigation, an available-points card, **How points work**, **Recent activity**, pull-to-refresh and an accessible refresh button, loading/error/retry/empty states and a stale-data notice.

## Existing API and policy

The app calls only authenticated `GET /api/rewards/me` through the existing secure native account/API client. It supplies no user ID parameter. The existing backend resolves `req.user._id`; the response is `{ success: true, data: { pointsBalance, pointsDebt, pointsPerSAR, policy, history, membership, activeRedemption } }`.

- `pointsBalance` is the available balance, used directly without estimated earning, cash conversion, or subtracting `pointsDebt` locally. Missing/malformed balances show an error; they never silently become zero.
- Positive `pointsDebt` shows: “Some points were adjusted after a refund. Future earned points will first cover this adjustment.” It is not a cash liability or payment request.
- Current `policy` contains `earnAfter: 'completed_and_paid'`, `pointsExpire: false`, and `reservationMinutes`. The screen uses server `pointsPerSAR` and `earnAfter` to explain earning, and `pointsExpire` to explain expiry. Missing/unknown policy/rate is shown as unavailable rather than replaced with the audited rate of 10. A changed rate is reflected on the next read.
- Eligible spending excludes delivery fees and reflects discounts. This rule is not currently exposed as a policy field; it was verified in `backend/services/customerOrderService.js` (`eligiblePointsAmount: discountedSubtotal`) and the existing completion/payment award service, and is documented customer copy. Legacy accrual and all existing refund rules remain server-owned.
- `membership`, `activeRedemption`, reservations, tier progress, audit keys and raw transaction descriptions are not retained in the customer read model or rendered. There is no redeem/cancel/cash-discount UI or loyalty mutation request.

Backend source and calculations were not changed. The existing account GET may perform its own legacy-balance initialization and expired-reservation housekeeping. The app adds no second points system and no balance mutation logic. Tests intercept that endpoint rather than invoking it on staging/live accounts.

## Ledger and loading

`history` is the existing server ledger, sorted newest first. The backend populates `pointTransactions.order` with `_id`/`orderNumber` and caps its response at the latest **100 records**, with no history-pagination endpoint or total-lifetime count. The screen shows 10 records initially and **Load more** reveals another 10 locally, up to the supplied history. Copy explicitly says that this is not complete lifetime history.

Rows show customer descriptions, signed points and dates explicitly formatted in **Asia/Riyadh**, including UTC-midnight crossings. `EARN` becomes “Points earned”; `REDEEM` becomes “Reward redeemed”; positive `REVERSAL` becomes “Points returned”, negative becomes “Points adjusted after a refund”, and zero/unknown adjustment has neutral copy. Amount signs follow the actual ledger number. Deleted/missing order references render ordinary activity. A valid populated Mongo order ID opens the existing authenticated `/order/[id]` screen; the order number is displayed when present, otherwise a “View order” link is shown. The existing order endpoint still enforces ownership. Raw descriptions/source keys/balance-after/audit records are not displayed.

## Account isolation and refresh

`useMyPoints` reuses the existing `useResource`/`ResourceController` with an account-and-credential scope and **no poll callback**. Profile and My points fetch on focus/foreground activation and manual/pull refresh. Returning from order details/completion to either screen triggers a fresh read; there is no local optimistic points credit or separate points polling loop.

Each screen keeps only its own in-memory current-account snapshot. On temporary network/service failure, known points remain visible with “may be outdated”; no known balance is replaced with zero. Initial failures show retry without fabricating a balance. Logout/account/credential changes hide/reset the prior scope, deactivate/abort old reads and ignore their late results. The points screen's visible-history count resets on account/credential change. No loyalty persistence was added to AsyncStorage/SecureStore.

401 and network failures remain distinct. The resource now exposes an additive, scope-bound `errorStatus`; My points shows sign-in on 401 even when a concurrent `/auth/me` validation has not yet cleared the global session. Cached points are hidden immediately. The existing API client's session expiration/pending recovery logic remains unchanged. Other resource consumers retain their previous behavior.

## Verification and limitations

Verified locally on 13 October 2026:

- `npm test`: **72/72 passed**, including seven points-focused tests for contract validation, dynamic rules, signed activity, sanitized/order-safe records, Riyadh dates, the 100-record limit and resource isolation/stale behavior.
- `npm run typecheck` and `npm run lint`: passed.
- `npx expo export --platform all --max-workers 2`: Android and iOS Hermes bundles plus Web/static routes exported successfully, including `/points`.
- `points-smoke.cjs`: passed using the actual app in the isolated browser harness. Covered Profile entry/back/owner order navigation; positive/zero/debt balances; dynamic rate; all activity signs; empty/10→20→25/100-record loading; initial and stale outage/retry; guest/401 expiry/logout/account switch/late response isolation; no loyalty persistence or mutations; 320/390-pixel layouts and 130% Web text.
- Existing Profile and conveniences browser regressions: passed against the final harness source, including authentication, profile/addresses, pending-order guards, reorder, favourites and sharing adapters.
- `git diff --check`: passed. Changes are confined to `mobile/`.

All API traffic in the browser checks was intercepted. No staging/live loyalty/customer/order writes, deployment, commit, push, APK/IPA or cloud build was performed.

```powershell
# mobile/
npm test
npm run typecheck
npm run lint
npx expo export --platform all --max-workers 2
node tests/profile-harness.cjs
# Set PLAYWRIGHT_MODULE to an installed Playwright package with Chrome available.
node tests/points-smoke.cjs
node tests/profile-smoke.cjs
node tests/conveniences-smoke.cjs
```

The harness copies the actual app/routes/providers into an ignored diagnostic directory, substituting only native secure-storage/dialer/share adapters; the points loader, authentication, UI and resource lifecycle are unchanged. Every API request is intercepted. Browser screenshots are generated in ignored `mobile/artifacts/points-*.png`; their fixture balances/transactions are not real customer data.

Screenshots: [Profile entry](artifacts/points-profile-390.png), [balance and earning rules](artifacts/points-balance-rules-390.png), [activity](artifacts/points-history-390.png), [stale balance](artifacts/points-stale-390.png), [zero and empty history](artifacts/points-zero-empty-390.png), [guest](artifacts/points-guest-390.png), [320-pixel account switch](artifacts/points-second-account-320.png), and [enlarged Web text](artifacts/points-large-text-390.png). Profile, balance/rules and enlarged-text captures were visually inspected.

Physical Android/iOS runtime, native pull gesture/text scaling, secure storage and installed-app behavior remain device acceptance checks. JavaScript bundle exports and browser fixtures do not prove those. No new dependencies, environment variables, backend endpoint or policy configuration are required; a future authorized native build is needed to include this source update in an installable app.

Implementation: `src/app/points.tsx`, `src/components/points.tsx`, `src/hooks/useMyPoints.ts`, `src/domain/points.ts`, the Profile entry/root route/icons, and the additive resource error-status field. Tests: `tests/points.test.cjs` and `tests/points-smoke.cjs`; existing Profile/conveniences fixtures include a read-only rewards response.
