# Dune & Grills customer mobile

Native customer ordering app built from the existing Expo SDK 57 scaffold. Menu, Cart, Orders and Profile use Expo Router and React Native components. It reuses the existing Express/MongoDB ordering engine, customer accounts, customization, coupons, addresses and private tracking.

## Open on your Android phone

```powershell
Set-Location 'F:\My Projects\duneandgrills\mobile'
npm ci
Copy-Item .env.example .env
npx expo start --lan
```

Install Expo Go compatible with SDK 57. Connect phone and PC to the same Wi-Fi, then scan the terminal QR in Expo Go. The example API is `https://duneandgrills-testing-six.vercel.app/api`. **Staging native login/register require deployment of the new backend `/auth/mobile/login` and `/auth/mobile/register` routes.** Browser auth continues to use its existing cookie contract.

For local development, run `npm run dev` from `backend/` with a development MongoDB replica set and set `.env` to the PC's LAN address, for example:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.0.117:5000/api
```

That Wi-Fi address was observed during implementation; verify it with `Get-NetIPConfiguration`. A phone's localhost is the phone. Android emulator: `http://10.0.2.2:5000/api`. Allow Metro and API ports on the private network. Restart Expo after changing `.env`. A Metro tunnel (`npx expo start --tunnel`) does not expose your local backend. Never put secrets in public Expo variables.

## Features and behavior

- Live dishes/combos, search/category filters, SAR pricing, item details, required customization groups, add-ons/spice/notes and quantities up to 99.
- Persistent device cart with customization-aware merging. It does not sync with the web cart. Sign-in/account switch/logout starts a fresh cart; unresolved orders block switching.
- Customer login/register, SecureStore token persistence, `/auth/me` restoration, expired-session handling and outage-safe credential retention.
- Guest/account delivery or pickup, manual/saved addresses, server delivery minimum/fee/ordering/COD rules, coupon validation and reviewed summary.
- Protected immutable pending payload/key/actor saved before submission; explicit original-request retry and server reconciliation/cancellation across restart. Unknown outcomes retain the cart and request. No automatic offline queue.
- Confirmed number/total, cash payment status, private saved guest tracking, authenticated history/details, foreground polling and current-price reorder with skipped-item reports.
- Profile updates and own-address add/edit/delete/default controls with field limits and refresh.

Only the existing backend auth controller/routes were extended, with an isolated integration test. No new ordering backend, schema migration or frontend proxy change. Mobile auth returns `{success,user,token,expiresAt}` without setting cookies and uses existing password/JWT/sessionVersion/rate-limit rules. Existing browser responses remain compatible. Native logout forgets this device's bearer credential; it does not revoke other sessions.

Protected session/pending/tracking data uses generation-based SecureStore chunks; plain AsyncStorage holds cart/catalog selections. Tracking secrets never enter URLs or logs. Web export is diagnostic only: secure login and order submission require native storage.

## Expo Go and local native builds

SDK 57 includes the added [SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/), [Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/) and [AsyncStorage](https://docs.expo.dev/versions/v57.0.0/sdk/async-storage/) modules in Expo Go; no biometric/custom native module is used. Expo Go is sufficient for initial functional checks with a matching SDK. App icon/splash/identifiers and standalone OS behavior need a development build.

```powershell
# Optional local Android build: requires Android Studio SDK and a device/emulator.
npx expo run:android
```

Local iOS builds use `npx expo run:ios` on macOS with Xcode. No cloud build/store publication/deployment was performed.

## Checks

```powershell
npm test
npm run typecheck
npm run lint
npx expo install --check
npx expo-doctor
npx expo export --platform all
```

Verified: 23 mobile logic/session/storage tests; TypeScript/lint; SDK dependency check; Expo Doctor 21/21; Android and iOS Hermes/web exports; 43 selected backend tests plus existing auth-security regression. Local browser fixture smoke passed at 390px and 768px without remote API writes. Run `node tests/browser-smoke.cjs` after export with `PLAYWRIGHT_MODULE` pointing to an installed Playwright package and Chrome installed. Screenshots are ignored under `artifacts/`.

Backend tests own temporary loopback MongoDB replica sets and require `mongod`:

```powershell
Set-Location 'F:\My Projects\duneandgrills\backend'
node --test tests/mobilePhaseAIntegration.js tests/orderEngine.test.js tests/orderEngineIntegration.js tests/stagingSecurity.test.js tests/stagingSecurityIntegration.js
```

**Not verified on a physical Android/iOS device or emulator.** Bundles and browser previews do not prove native keyboard/back/Keystore/Keychain behavior. Native staging login was not exercised; new backend auth must be deployed first. `npm audit` still reports 29 advisories (11 moderate, 18 high) in the dependency graph; forced SDK changes were not applied. Resolve compatible remediations before release.

See [the full Phase A record](../docs/mobile-phase-a.md) for API contracts, protected request guarantees, proxy evidence, verification boundaries, deployment requirements, file map and Phase B follow-up. Push, loyalty UI, advanced offers, online payments, multilingual work, cross-device cart sync and store submission are outside this phase.
