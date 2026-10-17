# Dune & Grills Rider

Private Expo SDK 57 / React Native app for the restaurant's employed riders in Riyadh. English UI, SAR amounts, Asia/Riyadh timestamps, and the approved charcoal/amber design. The Android application ID is `com.duneandgrills.rider`; the existing customer app and its package/signing project are separate.

## Implemented

- Staff rider sign-in, native secure session restoration, expiry handling and sign-out.
- Home: availability, server-wide active/delivered-today counts, current assignments and a new-assignment banner after refresh.
- Deliveries: own assignments, Awaiting pickup/Picked up/Issues filters, paginated completed history, order-number search, Riyadh date ranges and cash-state filters.
- Details: restaurant pickup instructions, order items/add-ons/notes, saved recipient/address/pin, explicit native phone and Google Maps links.
- Confirm Pickup only when the restaurant order is Ready; Confirm Delivery only after pickup and customer handover.
- Issue reporting pauses fulfillment until existing manager resolution. Only rider-visible timeline events are displayed.
- Cash report once after delivery; authoritative outstanding amount, two-decimal validation and a required reason for lower/zero collection. Reported receipts, discrepancies, manager acknowledgment and cashier-confirmed timestamps remain distinct.
- Cash overview groups Needs report/Awaiting cashier/Discrepancy tasks and links to filtered history.
- Completed views hide customer names, addresses, phone numbers, delivery notes and item notes. Cashier confirmation remains a website/POS action and uses the existing backend accounting rules.
- Foreground/focused 30-second polling, manual/pull-to-refresh, stale/error/loading/empty states and safe-area bottom tabs.

No personal earnings, marketplace acceptance, automatic dispatch, background GPS, in-app map/ETA, push notifications or delivery OTP/photo flow is added.

## API integration

Uses existing `/api/rider/portal`, `/api/rider/workflow/availability` and `/api/rider/workflow/deliveries/:id/:action` routes. Availability is not automatic assignment. Normal app reads/writes require the existing saved Admin → Settings → Delivery Rider activation; the app never changes this setting or uses rehearsal/preview flags against restaurant data.

One backend addition is required before real mobile sign-in works:

`POST /api/auth/mobile/rider/login` with `{ email, password }`

This returns a rider-only bearer session without browser cookies. The existing customer mobile login still rejects staff, public registration still provisions customers only, and browser login remains unchanged. The existing Next API proxy already forwards the new endpoint and bearer header. The native client never shares browser cookies.

**The backend change has not been deployed. No real staff credentials, restaurant orders or live database were used during development.** A saved operational activation state was not changed or inspected.

## Connection loss and restart

Before a mutation can be sent, its original account/server, payload, revisions and idempotency key must be saved to the device's encrypted SecureStore. A storage error prevents the request. A lost response, timeout, 401 or server error retains the request across restart. An unresolved request blocks new mutations, account switching and sign-out.

The recovery banner lets the rider inspect the delivery and explicitly retry the exact saved payload/key. The server returns an existing result for a stored action; changed contents or revisions are rejected. No reconnect/background event automatically replays a mutation. A definitive 400/403/404/409/422 rejects and clears the saved request; current server data must then be refreshed/reviewed. If server success is received but local cleanup fails, the saved request stays safely replayable.

When a session expires with an unresolved request, the original rider must sign in again. Do not uninstall, clear app storage or change its API environment while an action remains unresolved. If an administrator disables the Rider module during recovery, restaurant assistance may be needed before replay can be resolved.

## Run locally

From PowerShell:

```powershell
Set-Location 'D:\My Projects\duneandgrills\rider-mobile'
npm ci
Copy-Item .env.example .env
npm start -- --clear
```

For native testing use matching SDK-57 Expo Go or a development/native build. Set `EXPO_PUBLIC_API_URL` to the approved deployed API or an owned local test backend. A physical phone needs the PC's LAN address, not `localhost`; an Android emulator can use `http://10.0.2.2:5000/api`. HTTP is permitted only for `EXPO_PUBLIC_APP_ENV=development`. Never put credentials in public environment variables.

The default URL is the existing staging API, **not an assumed production API**. Real login requires deployment of the new backend route first. Sign in using an active Staff account with role Rider; a customer/admin account is not accepted by this login.

Web builds are a diagnostic preview: staff sign-in and protected writes require native secure storage, with no localStorage fallback.

## Read-only design preview

An explicitly development-only fixture mode displays sample accounts/orders without making any API calls. Actions, external customer/restaurant links and sign-out are disabled. A visible banner identifies sample data; it never simulates a successful delivery or payment.

```powershell
$env:EXPO_PUBLIC_APP_ENV='development'
$env:EXPO_PUBLIC_RIDER_DEMO='1'
npx expo start --web --clear
```

Unset `EXPO_PUBLIC_RIDER_DEMO` and restart the bundler before testing actual staff sessions. The mode and API URL are taken from the validated app manifest. Staging/production configuration rejects fixture mode; production also requires an explicit approved HTTPS API URL and rejects the known staging host.

## Build an APK later

`eas.json` includes an internal Android APK profile and a production profile. Link **a new Rider EAS project**, with separate managed signing credentials; do not reuse the customer app's EAS project ID, Android package or signing configuration. No EAS project was created or linked in this change.

```powershell
npx eas-cli@latest login
npx eas-cli@latest init
npm run build:apk
```

No cloud build, APK, store submission, OTA update, backend deployment or paid service was initiated. Android/iOS Hermes exports are compilation checks, not installed-device verification. Real Android/iOS SecureStore behavior, mobile connectivity, phone/maps integration and the end-to-end cashier flow must be checked on a device with the deployed backend before rollout.

## Verification

Local verification on 17 October 2026: 10 app tests and 17 selected backend tests passed; TypeScript, ESLint, SDK dependency compatibility and Expo Doctor (21/21) passed. Android/iOS Hermes and web exports succeeded. The read-only screen workflow and browser native-login gate passed at 320/390/820px, without external requests, page errors or horizontal overflow. Home, pickup, cash and profile screenshots were visually inspected. These fixture results do not replace real-phone/API/database acceptance testing.

```powershell
npm test
npm run typecheck
npm run lint
npx expo install --check
npx expo export --platform all --clear
```

The 10 domain/journal/config tests cover assignment/kitchen state, cash precision/shortages/duplicates, issue constraints, stale-state fingerprints, map privacy, server-scoped recovery, persistence-before-send, response loss, explicit idempotent replay, local cleanup failure and release configuration. The backend `riderMobileAuth.test.js` executes real auth/JWT/HTTP/proxy code using mocked database lookups; it does not claim MongoDB transaction coverage. Existing delivery unit regressions were also run. The local `mongod` executable is unavailable, so a new real-Mongo end-to-end mobile test has not been run.

Browser fixture smoke tests and screenshots:

```powershell
# PLAYWRIGHT_MODULE can point to the bundled Playwright package.
node tests/browser-smoke.cjs
$env:EXPO_PUBLIC_APP_ENV='development'
$env:EXPO_PUBLIC_RIDER_DEMO='1'
npx expo export --platform web --output-dir artifacts/demo-dist --clear
node tests/browser-smoke.cjs --demo
```

Browser checks run only on a disposable loopback static server; external requests are blocked. They check the native-login gate and the fixture screens at 320/390/820px. Generated exports, screenshots and local dependency folders are ignored by Git/EAS.

Initial dependency installation reported transitive audit advisories (10 moderate, 18 high). SDK-compatible versions are pinned in the lockfile; no incompatible forced upgrades were applied. Review compatible dependency remediation before production distribution.

References: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo Router](https://docs.expo.dev/router/introduction/), [native SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/).
