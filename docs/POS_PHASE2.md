# POS Phase 2

## Delivered scope

- Configurable, immutable terminal codes; active-terminal validation; archived terminal history and terminal snapshots on sales, drafts, shifts, cash and refunds. `MAIN` is provisioned lazily for backward compatibility, not selected automatically on a new cashier device.
- Dedicated POS sessions and hashed POS PINs, password fallback, inactivity lock, verified cashier switching and five-failure/five-minute lockout. The cart stays mounted during lock. Recovery references are scoped by cashier and terminal; network/locked recovery failures do not erase them.
- Existing shift/cash system extended with opening notes, drawer/cashier concurrency guards, mandatory movement reasons, idempotency, blind close, denomination helper, variance manager approval, unfinished-sale acknowledgement and preserved close snapshots.
- Existing refund reservation/payment system extended for authorized POS amount/item refunds and same-shift/time-window voids. No gateway or physical terminal integration. Restocking is explicitly opt-in and false by default.
- Shared ordered favourites, separate cached popular products, keyboard help, current-catalog repeat sale and server-paginated/filterable recent sales with audited receipt reprints.
- Transaction-safe historical ingredient/add-on/batch returns and proportional reward reversals. A failed inventory return rolls back cash, refund and payment changes. Late reward credit observes current refunded state.

## Local configuration

No data rewrite, seed or new application environment variable is required. Historical documents without new fields remain readable. Keep the existing `JWT_SECRET`, backend connection and Next API proxy configuration.

Use a MongoDB replica set (or Atlas) for atomic operations. Production already fails closed without transactions. Do **not** enable `ALLOW_NON_TRANSACTIONAL_INVENTORY` for production. Void and inventory-return actions deliberately require transactions even in development. The older opt-in standalone-development fallback remains only for compatibility with existing local tests/workflows; it is not an accounting safety guarantee.

Mongoose's existing index initialization creates new terminal/session/favourite indexes and the additional Order history/void indexes. Where administrators disable `autoIndex`, they must provision the indexes declared in `PosTerminal`, `PosSession`, `PosQuickItem` and `Order` through their normal controlled index rollout before enabling the feature. Do not use `syncIndexes()` to drop historical indexes. No production index or database operation was performed during implementation.

In **Admin → Settings**:

1. Create an active terminal, e.g. `COUNTER-1`, with a display name/location label. Managers can manage terminals; only administrators can set staff POS PINs.
2. Set dedicated 4–6 digit POS PINs. Attendance/discount-approval PIN behavior is unchanged; attendance PINs are not silently copied into POS authentication. Changing a POS PIN invalidates that staff member's auth/session version; ask them to sign in again.
3. Select auto-lock: disabled / 1 / 5 / 10 / 15 minutes (default 5). Configure the void window (default 120 minutes).
4. Enable shifts and require an open shift for real drawer accounting. Configure blind close, variance threshold and single-shift-per-terminal policy. One cashier cannot open two incompatible shifts.

POS sessions last at most 12 hours and are scoped to the authenticated browser owner. The browser holds a scoped token in session storage, never a PIN/password. Requests carrying that session are rejected while locked. Existing authenticated API callers without a POS-session header remain compatible; screen lock is not a substitute for account authentication or an operating-system kiosk lock.

## Cash and restoration rules

Money is aggregated in integer halala. Expected drawer cash is opening cash + original cash-sale movements + cash in − cash out − payouts − completed cash refunds − cash void reversals. Card/Other sales never add cash. Void does not delete the order. Sales summary excludes voided orders and lists void reversals separately.

A cash refund uses the original drawer if its shift is still open; otherwise it requires the refunding actor's current open drawer (which may be another terminal). Closed original cash ledgers are not mutated. Card/Other refunds require staff to perform/confirm any external payment separately and optionally record a reference.

Item refunds are priced from immutable order prices and the order's discount ratio, not from submitted amounts or today's catalog. Reservation checks prevent over-refunds and duplicate item quantities. Only explicitly physically returned items are restocked, using the original ingredient/add-on deduction snapshots and original batch allocation slices. Historical deductions with insufficient allocation evidence fail safely instead of consulting edited recipes. Rewards are reversed proportionally and idempotently using the existing non-negative points-balance policy.

Closing preserves unresolved working/held sales and requires acknowledgement. Large variance needs a reason plus Manager/Admin approval (cashiers submit a manager POS PIN). Only Manager/Admin can reopen, with a reason. Every close retains its amount/count/variance/totals snapshot.

## Manual test checklist (local test data only)

1. Sign in as cashier, open `/pos`, select a terminal and open a shift with SAR 50 and an opening note. Verify another cashier cannot open a conflicting shift on the same terminal.
2. Customize an item, add quantities/notes/discount, hold/resume it and refresh. Lock manually and by inactivity; unlock using POS PIN/password. Verify quantities and the recovery reference survive. Wrong PIN five times must block for five minutes. A deactivated cashier cannot unlock.
3. Attempt terminal/cashier switching with a current sale/open shift: it must block. Hold/clear and close before switching. After verified switching, the next order/action must show the new cashier in history/audit.
4. Complete a cash sale for SAR 20, a card sale for SAR 30, record cash in SAR 10 and payout SAR 5. Expected drawer cash is SAR 75. Retry a movement request; it must not add cash twice.
5. As Manager/Admin, open Recent POS Sales → Details. Request/approve/complete a partial cash refund, initially with **no stock return**. Cash must decrease once. Retry completion; stock, money and points must not reverse twice. Test returned item quantities separately and verify original ingredient/add-on batches.
6. Void an unrefunded sale within the configured window with a reason; stock stays deducted unless ALL items were explicitly physically returned. Test unauthorized cashier, refunded sale, expired window and closed-original-shift rejection.
7. Close with held sales present: acknowledgement required. For blind-close cashier, expected cash is hidden before submit. Above-threshold variance requires a note/manager PIN. Print the closed summary. Manager reopening must retain the earlier close snapshot.
8. Search/filter history by order/pickup name, dates, cashier (manager), terminal, payment/status/type; test Next/Previous pages, details and receipt reprint marker. Cashier sees only their sales. No phone/address appears in history lists.
9. Add/order favourites and distinguish them from Popular. Unavailable products stay disabled. Favourites still open customization. Repeat an old sale after changing its catalog price: the new cart uses today's validated price, not its previous discount/payment/order ID.
10. Open Shortcut Help (`F1`). `Alt+S/H/R/C/D/Enter/L` focus search, hold, held sales, cash, card, confirmed completion and lock. Shortcuts pause while typing or in a modal. Check desktop and tablet without horizontal page overflow.

## Verification commands

Backend (from `backend`):

```text
npm run test:pos-phase2
npm run test:pos-phase1
npm run test:pos
npm run test:phase2
npm run test:inventory
npm run test:customizations
npm run test:settings
npm run test:auth-security
npm run test:kitchen
```

`test:pos-phase2` starts its own temporary **local** MongoDB replica set, checks API permissions/transactions/concurrency, then removes only its own temporary files. It never reads a production URI. Install `mongod` on PATH, or set test-only `MONGOD_BINARY` to its executable. Older integration scripts retain their existing isolated `_test` database safeguards; never point them at production.

Frontend (from `frontend`):

```text
npm run test:pos
npm run lint
npm run build
npm start -- --port 3008
node tests/posBrowserSmoke.mjs
```

Browser smoke requires an installed Chrome and Playwright available to Node. If using the bundled Codex runtime, set test-only `PLAYWRIGHT_MODULE` to its Playwright package directory. `POS_SMOKE_URL` can override the default `http://localhost:3008/pos`. Every browser API request is fulfilled with test fixtures; no production order/payment/database request is sent. Desktop 1440×1000 and tablet 768×1024 exercise terminal/cart, opening/cash/closing controls, distinct cash request keys, auto-lock, PIN, refresh recovery, favourites, shortcut help, server search, details/reprint layering, manual refund controls, safe restock defaults and overflow checks. Actual financial/inventory atomicity is checked against real MongoDB in the backend suite, not inferred from these browser fixtures. There is no standalone TypeScript or backend-lint script; backend JavaScript syntax checks and the configured Next build checks are used.

### Verified results (2026-10-05)

- `test:pos-phase2`: 17 passed, 0 failed (16 scenarios plus parent suite); temporary replica set.
- `test:pos-phase1`, `test:pos`, `test:customizations`, `test:auth-security`: integration checks passed, exit 0.
- `test:phase2`: 4 unit tests passed plus operational integration checks passed, exit 0.
- `test:inventory`: 3 unit tests passed plus inventory integration checks passed, exit 0.
- `test:settings`: 6 passed, 0 failed; `test:kitchen`: 3 passed, 0 failed.
- Frontend `test:pos`: 2 passed, 0 failed.
- Extended browser smoke: both desktop and tablet passed; no page JavaScript errors or horizontal page overflow.
- Frontend `npm run lint`: exit 0, no errors/warnings.
- Frontend `npm run build`: exit 0; compilation/Next's configured type checks passed, static generation 22/22.
- `node --check`: all 29 changed/new backend JavaScript files passed. Git diff whitespace check passed under the repository's Windows CRLF convention.

## Important modules changed

- Backend routes/controllers: `posRoutes`, `posController`, `posHeldSaleController`, `posShiftController`, `posOperationsController`, `posSaleHistoryController`, cancellation guard in `orderController`.
- Models: new `PosTerminal`, `PosSession`, `PosQuickItem`; extended `User`, `RestaurantSettings`, `Order`, `PosHeldSale`, `PosShift`, `CashMovement`, `Refund`.
- Services: `posTerminalService`, `posSessionService`, `posVoidService`, `refundRestorationService`; existing `posShiftService`, `refundService`, `rewardService`, `orderInventoryService`, `restaurantSettingsService` reused/extended; centralized permissions extended.
- Frontend: POS workspace/topbar/lock/shift/print controls; existing `PosTab`, grid, recent sales and receipt; new sale actions/shortcut help; `usePosDialog`, `posShortcuts`, `PosDeviceSettings` and existing restaurant settings; shared API/proxy and receipt exports.
- Tests: `posPhase2Integration`, existing operational `phase2Integration` terminal fixture; frontend `posShortcuts.test`, `posBrowserSmoke`; package scripts.

## Deliberate boundaries

No table management, online payment integration, tax/fiscal credit notes, biometric/device PIN service, role invention or duplicate order/refund/inventory system. Favourites are restaurant-wide; cashier-specific favourites are not added. Popular aggregation is cached in-process for five minutes per backend instance. Printing still depends on the browser popup/print permissions. Cash refunds require an open drawer even when ordinary shift enforcement is disabled. Nothing was committed, pushed or deployed.
