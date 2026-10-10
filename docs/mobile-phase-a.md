# Dune & Grills customer mobile — Phase A

Implementation and local verification: **2026-10-10, Asia/Riyadh**. Continues the existing `mobile/` scaffold; Expo 57.0.27, React Native 0.86.3, React 19.2.3 and Expo Router 57.0.25. Android is the primary target; iOS bundles also compile.

## Preservation and scope

Starting Git status contained only untracked `mobile/`. Its installed scaffold, lockfile, routes, assets, config and complete `AGENTS.md` were inspected. No previous create/install process was running. The PWA baseline, unified engine, functional ordering and PWA architecture documents were read. Browser/POS/Kitchen/Admin implementation and recipe/inventory files were preserved. The only existing backend changes are additive mobile auth in `controllers/authController.js` and `routes/authRoutes.js`.

No reset, checkout, stash, scaffold regeneration, commit, push, deployment, store publishing or EAS cloud build was performed. Database test writes used helper-owned temporary loopback MongoDB replica sets. No staging/live accounts or test orders were created.

## Implemented features

- Native Expo Router Menu, Cart, Orders and Profile tabs; item details, checkout, auth, order details and address editor stacks. Existing restaurant mark copied from `frontend/public/pwa/icon-512.png`; live existing catalog food images retained. Cream/green/amber theme, system typography, accessible controls, safe areas, scrolling, keyboard-aware forms and native back navigation. Loading, validation, empty/error and explicit retry states.
- Live menu and published combos, category filtering/search, SAR prices and availability; add-on quantities/prices, spice and optional item notes (240 characters when customization is enabled). Required groups and distinct-selection minimum/maximum rules match the backend, with a 20-add-on and 99-quantity limit.
- Device cart persisted in AsyncStorage, with deterministic product/customization identities, merge/quantity limits, removal, clear and subtotals. This cart does **not** synchronize with the browser `UserCart`. Signing in to a different actor or logging out clears the outgoing device cart and starts fresh. An expired session preserves work and requires reauthentication before account-owned submission; it never silently converts an account attempt into a guest order.
- Native customer email/password login and registration; SecureStore token/profile persistence; `/auth/me` validation and profile refresh. Only explicit invalid-session responses clear credentials. Network failures, timeouts, throttling and service outages preserve the saved session with an unvalidated state. No invented OTP/password-reset flow.
- Guest/authenticated delivery or pickup checkout with name/phone, optional email, manual/saved address, 500-character kitchen notes, server order configuration and coupon validation. COD only. Catalog and delivery settings are reloaded before review; changed prices require another review, unavailable/customization-changed lines require removal/reselection. Reviewed totals remain estimates until the restaurant confirms creation.
- Durable immutable order request, protected customer details, random UUID idempotency key, pinned API origin and actor identity saved before sending. A shared gate prevents concurrent creation/retry/reconciliation and blocks cart/session switching while unresolved. Every ambiguous/rejected attempt remains saved until explicit retry recovers its order or the server cancellation fence confirms cancellation. No automatic mutation retry or offline order queue.
- Server-confirmed number/total and separate COD payment status. Authenticated history/details; private guest tracking saved securely and reopened from Orders. Tokens travel only in `X-Order-Tracking-Token`, never URLs/logs/AsyncStorage. Account history uses 30-second polling; guest details use two-minute polling to respect the existing 30-per-15-minute tracking budget. Polling stops on blur/background/terminal status, refreshes on resume, cancels obsolete reads, avoids overlap, honors rate cooldown and backs off on errors.
- Owner-only reorder through the repeat endpoint, followed by local current-catalog/customization validation, reporting skipped lines. Profile name/email/phone updates; saved-address list/add/edit/delete/default controls, field limits and mutation refresh. Forms and read results reset by actor scope so another account's values cannot appear after a switch.

## API contracts

All paths below are relative to `EXPO_PUBLIC_API_URL`, including its `/api` suffix. The typed request client uses a 20-second bound, explicit cancellation, structured HTTP/network/timeout/response errors and `credentials: omit`. It never automatically retries writes.

| Contract | Mobile use |
| --- | --- |
| `POST /auth/mobile/register`, `POST /auth/mobile/login` | **New additive endpoints**. Existing customer credential/password checks, sanitization, JWT signing and shared auth rate limit. Return `{success,user,token,expiresAt}`; expiry is epoch milliseconds. Never set browser cookies; mobile login rejects staff accounts. Registration remains customer-only even with a submitted role. |
| Existing `/auth/login`, `/auth/register` | Existing cookie responses remain compatible, without a new JSON token. |
| `GET /auth/me`, `PATCH /auth/me` | Existing bearer middleware validates signature, active user and sessionVersion; fetch/update own profile. |
| `GET /menu`, `/menu/:id`, `/combos`, `/combos/:id` | Existing public catalog/customization data and authoritative base prices. |
| `GET /orders/config` | Ordering enabled, delivery minimum/fees, available fulfillment types and COD availability. |
| `POST /offers/validate-coupon` | Existing server coupon pricing/eligibility, given product IDs/quantities/customizations and optional bearer. |
| `POST /orders` | Existing engine; payload contains customer, items, fulfillmentType, paymentOption `cod`, kitchenNotes, couponCode and idempotencyKey. No client price/status/payment/inventory/source/actor/order-number fields. Same key also supplied in `Idempotency-Key`. |
| `POST /orders/requests/cancel` | Exact original saved payload/key and original actor. Either returns the committed order/tracking token or atomically fences a never-committed attempt. Reconciliation can therefore resolve both lost success responses and rejected creation. |
| `GET /orders/my`, `/orders/:id`, `POST /orders/:id/repeat` | Existing owner-scoped history/details/current catalog reorder. |
| `GET /orders/track/:orderNumber` | Private tracking token header, safe order projection. |
| `/profile/addresses`, `/profile/addresses/:id`, `PATCH /profile/addresses/:id/default` | Existing own-address CRUD/default contract; label 40, fullAddress 300, phone 30 characters. |

Logout erases the bearer credential from this device and clears its account cart, matching the existing stateless credential model. It does not globally revoke other sessions or call the cookie logout endpoint. Server-side sessionVersion revocation still invalidates mobile tokens. Login/passwords are never persisted.

## Protected persistence and uncertain outcomes

SecureStore protects session, pending request and the latest 20 tracking summaries/tokens. Full order items and notes are fetched privately when tracking opens. Large values use bounded chunks (400 UTF-16 units each) with a generation manifest written last. Partial chunk/manifest failures retain the previous complete record, clean the failed generation and prevent sending. Corrupt/incomplete protected state fails closed. The native adapter uses `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; Android backup exclusion uses the SecureStore config plugin.

On confirmation, tracking is persisted first, the original actor's cart is durably cleared next, then the pending record is removed. Failure at any step retains a recoverable request. Reconciliation cancellation preserves the cart. A timeout, 409, 400, 410 or outage alone does not discard an uncertain request. Requests are capped at 90KB UTF-8 before saving/sending so both creation and reconciliation fit the server’s 100KB body limit; cart lines are limited to the existing server maximum of 100. A same-account fresh token can replace an expired transport token; actor/payload/key/origin remain fixed. Unresolved guest attempts prevent sign-in. Unresolved account attempts permit only original-account reauthentication and prevent logout/account switching.

Uninstalling/clearing app data or losing the device can lose recovery data; iOS Keychain retention after reinstall is platform-dependent. SecureStore is device persistence, not a remote backup. Do not clear app data while an outcome is unresolved. Changing the API URL does not redirect a saved request: its original API origin is retained. Keep the existing backend JWT secret stable while requests remain pending, as existing replay-derived guest tokens depend on it.

The web export is a **diagnostic preview**. Secure login/checkout deliberately require native storage. Web checkout cannot send an order without a successful protected save.

## Environment and opening on a phone

From PowerShell:

```powershell
Set-Location 'F:\My Projects\duneandgrills\mobile'
npm ci
Copy-Item .env.example .env
npx expo start --lan
```

The example points to `https://duneandgrills-testing-six.vercel.app/api`. Use Expo Go compatible with SDK 57 on your Android phone, connect phone and PC to the same Wi-Fi, open Expo Go and scan the terminal QR code. Restart Metro after changing `.env`. A VPN, guest Wi-Fi/client isolation or firewall can prevent LAN access; permit Node/Metro on the private network. `npx expo start --tunnel` is an optional Metro tunnel if LAN is unavailable; it does **not** tunnel a local backend API.

For a local backend, start the existing Express service in a separate terminal using its configured **development replica-set database**:

```powershell
Set-Location 'F:\My Projects\duneandgrills\backend'
npm ci
npm run dev
```

Change `mobile/.env` to your PC's LAN IPv4 address:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.0.117:5000/api
```

`192.168.0.117` was this PC's Wi-Fi address during verification; DHCP may change it. Run `Get-NetIPConfiguration` to check. The phone's `localhost` is the phone. An Android emulator uses `http://10.0.2.2:5000/api`; a same-host iOS simulator can use localhost. Port 5000 must be reachable on the private LAN. Never expose JWT/database/proxy secrets through `EXPO_PUBLIC_` variables. Production uses HTTPS.

### Expo Go versus development builds

SDK 57's official docs mark [SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/), [Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/) and [AsyncStorage](https://docs.expo.dev/versions/v57.0.0/sdk/async-storage/) as included in Expo Go. This app does not request biometric authentication or add a custom native module, so Expo Go is suitable for the first functional phone check with a matching SDK. Expo Go does not verify our app icon/splash/identifiers, standalone OS settings or release behavior. Those require a development/native build.

Optional **local** Android build (Android Studio SDK/emulator or USB-connected phone required):

```powershell
npx expo run:android
```

Local iOS builds require macOS/Xcode:

```sh
npx expo run:ios
```

No native project was generated, no EAS/cloud build was triggered, and no simulator/device was connected during this implementation. Matching references: [SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Router tabs](https://docs.expo.dev/router/advanced/tabs/), [Router stacks](https://docs.expo.dev/router/advanced/stack/), [development builds](https://docs.expo.dev/develop/development-builds/introduction/).

## Deployment prerequisites and proxy evidence

Deploy the two backend mobile auth routes and shared controller changes before expecting staging native login/register to work. No frontend proxy change or database migration is needed. Retain the existing replica-set transaction readiness, unique order/idempotency indexes, request-fence collection, shared auth rate limiting, active/sessionVersion validation and stable JWT secret.

The current Next catch-all proxy forwards Authorization, JSON bodies, Idempotency-Key, private tracking and request/rate headers. Origin checks allow native requests without a browser Origin header. Its upstream timeout is 15 seconds: a proxy failure remains an unknown outcome, even though the native bound is 20 seconds.

Read-only staging checks returned `/orders/config` 200, `/auth/me` without bearer 401 `Not authenticated`, and the same request with an intentionally invalid dummy bearer 401 `Invalid or expired token`. This demonstrates that the deployed proxy forwards bearer credentials to authentication. A GET probe of `/auth/mobile/login` was 404; GET is not its new POST contract and is not a native-login acceptance test. Real valid-token issuance/restoration through the complete repository proxy handler was verified **locally**, using the isolated database. No valid staging credential was used and native staging login was not exercised.

## Verification results

| Check | Result |
| --- | --- |
| `npx expo install --check` | SDK-compatible dependencies; passed |
| `npx expo-doctor` | 21/21 passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero errors/warnings after repairing form state and scaffold hydration |
| `npm test` | 23 mobile logic/storage/session tests passed |
| `npx expo export --platform all` | Android/iOS Hermes bytecode and web/static route export passed |
| New mobile + existing order-engine/security integration/unit selection | 43 passed, no failures, owned temporary replica sets |
| Existing standalone auth-security regression | Passed under explicit owned temporary test URI |
| Local fixture browser runtime | Passed at 390px and 768px; search, customizations, cart reload, checkout validation/coupon totals, native-storage send gate and auth validation; no page errors or remote writes |
| Physical Android/iOS/emulator, OS Keychain/Keystore and real keyboard/back behavior | **Not performed**; no attached device/Android SDK on this host |
| `npm audit` | Not clean: 29 reported advisories (11 moderate, 18 high), including Expo/RN dependency chains. Suggested forced SDK changes/downgrades were not applied. Review SDK-compatible remediations before release. |

Initial introduced TypeScript/lint issues and browser-test selector ambiguity were repaired. The first UI attempt ran before the export had finished and was rerun after export completion. Final checks above supersede those attempts. Bundle/export success is compilation evidence, not device or store-release verification.

Reproduce from `mobile/`:

```powershell
npm test
npm run typecheck
npm run lint
npx expo install --check
npx expo-doctor
npx expo export --platform all
# Requires Playwright and installed Chrome. It starts/stops an owned local
# static server, intercepts every API call and writes ignored artifacts/ PNGs.
$env:PLAYWRIGHT_MODULE = 'C:\Users\Mohammed Nahid\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node tests/browser-smoke.cjs
```

Backend owned integration selection from `backend/`:

```powershell
node --test tests/mobilePhaseAIntegration.js tests/orderEngine.test.js tests/orderEngineIntegration.js tests/stagingSecurity.test.js tests/stagingSecurityIntegration.js
```

These tests require local `mongod` (or `MONGOD_BINARY`) and own their temporary replica sets. Never give legacy reset/drop-database scripts the application or staging URI. The existing auth regression was run inside `withIsolatedMongo` with its URI passed as `MONGO_TEST_URI` to a child process.

## File map

- `mobile/src/app/`: native routes and tabs; old scaffold index/explore redirect into Menu.
- `mobile/src/domain/`: typed contracts, cart/customization/checkout validation and lifecycle labels.
- `mobile/src/services/`: typed API/catalog/image adapter, session validation, secure chunk storage and durable request manager.
- `mobile/src/state/AppProvider.tsx`: scoped session/cart/tracking state and controlled transitions.
- `mobile/src/hooks/useResource.ts`, `mobile/src/components/ui.tsx`: cancellable focused reads/polling and common native UI.
- `mobile/tests/`: meaningful domain/API/session/storage/recovery tests and fixture browser smoke.
- `mobile/app.json`, `package.json`, `package-lock.json`, `.env.example`, `.gitignore`, `eslint.config.js`, `src/css.d.ts`, `src/hooks/use-color-scheme.web.ts`, `assets/images/brand.png`, `README.md`: branding/config/dependencies/diagnostics and handoff. Unused useful scaffold assets/components remain preserved.
- `backend/controllers/authController.js`, `backend/routes/authRoutes.js`, `backend/tests/mobilePhaseAIntegration.js`: additive native auth and isolated real proxy/order acceptance.
- `docs/mobile-phase-a.md`: this record.

## Remaining limitations and Phase B

Perform a matching-SDK Android phone rehearsal against an isolated development deployment first: login/register, session/network interruption, guest/account checkout, saved addresses, required customizations, lost-response app restart/reconciliation, stock shortage, coupon change, ownership, background/resume and Kitchen/Admin visibility. Validate actual Keystore/Keychain writes, Android back/keyboard/touch behavior and iOS compatibility on devices. Rehearse a local development build for standalone branding and OS settings.

Resolve dependency advisories with an SDK-compatible maintenance plan before release. Validate staging backend deployment and operational transaction/index/rate-limit readiness; local tests do not prove the deployed revision. No release build, signing, performance certification or store readiness is claimed.

Phase B can add push notifications, selected loyalty/advanced offers, internationalization, a real payment provider with settlement/webhook reconciliation, accessibility/performance instrumentation, and explicitly designed cross-device cart or tracking backup. Each should extend the existing backend. There is no online payment, staff mobile app, automatic offline order queue or fabricated account recovery in Phase A.
