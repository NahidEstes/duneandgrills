# Dune & Grills customer mobile

Expo SDK 57 / React Native customer app with native Home, Menu, Orders and Profile tabs and the existing Cart route. It uses the existing restaurant API, customer accounts and unified ordering engine.

Home now includes current offers, with an Offers list and pushed Combo Details screen. See [Offers behavior, pricing, routes and verification](OFFERS.md). These screens reuse the catalog, coupon validation and checkout APIs. No new installable/cloud build was started for this update.

The source now includes the dark/orange [customer UI redesign](../docs/mobile-redesign.md), implemented and verified locally on 2026-10-11. **The Phase B APK below predates the redesign and does not contain the new screens.** No cloud build or publication was started for the redesign.

**Android preview APK is ready:** [download version 1.0.0 / build 5](https://expo.dev/artifacts/eas/kC9ipPvEHEmM2CrtJaxEALjDx3MGtqSERpZRho7fq9E.apk). The signed APK uses the staging API and runs without Expo Go or Metro. [EAS build](https://expo.dev/accounts/nahidestes/projects/dune-and-grills/builds/2e3edf3f-2e3b-4d51-85cb-505b5349cbd7) · [local APK](<F:/My Projects/duneandgrills/mobile/artifacts/dune-and-grills-preview-1.0.0-build-5.apk>). Signing/content integrity, package/configuration, compiled SecureStore backup exclusions and required permissions were verified. No physical Android/iOS device execution or deployed staging native login has been verified. See [Phase B handoff](../docs/mobile-phase-b.md) for test evidence and remaining acceptance work.

## Build the installable Android APK

Run from `mobile/`:

```powershell
Set-Location 'F:\My Projects\duneandgrills\mobile'
npm ci
npx eas-cli@latest login
npx eas-cli@latest whoami
npx eas-cli@latest project:info
```

Reuse the linked project and its managed Android signing key. Inspect credentials with `npx eas-cli@latest credentials --platform android` and remaining free build allowance in the EAS dashboard before future builds. Keep keys in EAS's secure credential system; do not buy/upgrade a plan.

```powershell
$env:EAS_SKIP_AUTO_FINGERPRINT = '1' # Optional local fingerprint stalls on this Windows host
npx eas-cli@latest build --platform android --profile preview
```

Open the [final APK download](https://expo.dev/artifacts/eas/kC9ipPvEHEmM2CrtJaxEALjDx3MGtqSERpZRho7fq9E.apk) on an Android 7.0+ phone, download it, allow browser installation when prompted and install. It runs without Metro or Expo Go. Keep the same signing key for later updates; do not uninstall/clear an existing app holding unresolved orders to resolve a signing mismatch.

SHA-256: `f23ff4000d92db6ce5e1ad946f08b058503cf85cb4d58a63d576571411dddff1`. Size: 103,512,871 bytes. Package: `com.duneandgrills.customer`; minimum Android API 24, target 36.

## Profiles and environment

| Profile | Android output | API / behavior |
| --- | --- | --- |
| development | Internal development APK | Explicit HTTPS staging; Metro required. Configure an owned local/test API when rehearsing |
| preview | Internal release APK | Explicit `https://duneandgrills-testing-six.vercel.app/api`; runs independently |
| production | AAB for future Play submission | Requires the approved HTTPS `EXPO_PUBLIC_API_URL` in the EAS production environment; no production URL is assumed |

`app.config.js` validates environment/URLs and preserves existing project metadata. Release builds reject HTTP and production rejects the known staging host. `eas.json` uses remote build numbers with preview/production auto-increment; marketing version remains `1.0.0`. Android and iOS retain `com.duneandgrills.customer`; all profiles replace the same app, so resolve saved requests before changing environments. No store submission or OTA release command is configured/run. The repository `.easignore` uploads only mobile source and excludes credentials, env secrets, other apps, generated native projects and artifacts.

## Develop on a phone

```powershell
Copy-Item .env.example .env
npx expo start --lan
```

Use matching SDK-57 Expo Go on the same Wi-Fi and scan its QR. SecureStore, Crypto and AsyncStorage are bundled in matching Go. Standalone branding, permissions, OS settings/signing and future custom native modules require a development/native build:

```powershell
npx eas-cli@latest build --platform android --profile development
# Install that development APK, then:
npx expo start --dev-client --lan
```

For owned local development data, set `EXPO_PUBLIC_APP_ENV=development` and `EXPO_PUBLIC_API_URL=http://<PC-LAN-IPv4>:5000/api`; use `http://10.0.2.2:5000/api` on an Android emulator. Run the existing backend against a development replica set. Restart Metro after env changes. A phone's localhost is the phone, and a Metro tunnel does not expose the local API. Public Expo variables must never contain credentials.

Staging native account sign-in/register requires deployment of the Phase A backend `/auth/mobile/login` and `/auth/mobile/register` additions. Valid deployed native authentication was not verified, and no deployment or staging/live test customer/order writes occurred. Local owned integration tests exercise the real auth, proxy, addresses and ordering contract. Browser auth remains unchanged.

Local `npm run android` / `npx expo run:android` requires Java/Android Studio SDK and a device/emulator. iOS native compilation requires macOS/Xcode; physical-device EAS preview additionally requires an existing Apple Developer membership, bundle-ID access, registered UDIDs and signing/provisioning. No iOS binary/device test is claimed.

## Customer behavior

- Live menu/combos, customization-aware cart, quantities up to 99, current catalog revalidation and delivery/pickup COD checkout with server fees/minimums/coupons.
- Secure customer auth/session restoration, profile and owner-only addresses/default selection; history/private tracking and current-price reorder.
- Immutable pending payload/key/actor/origin persisted before submission. Explicit original-request retry or safe check/cancel across restart; no automatic offline order/payment queue. Cart clears only on confirmed success; cancellation preserves it.
- Expiry keeps the original account cart through restart; outages retain credentials. Account switching/logout clears account carts/tracking. Unresolved orders block switching; original-account reauthentication preserves recovery.
- Checkout drafts survive ordinary navigation in memory and clear on confirmation/account switch/logout. Protected contact/credentials/tracking are never written into plain cart storage.
- Branded image fallback, native virtualized menu, loading/error/retry/empty states, keyboard-aware forms, accessible controls, Android tab back to Menu, recoverable screen boundaries and foreground-only bounded polling.

The web export is a diagnostic preview. Protected auth/checkout writes require native storage; there is no insecure web fallback. Keep app data intact while an order outcome is unresolved.

## Verification

```powershell
npm test
npm run typecheck
npm run lint
npx expo install --check
npx expo-doctor
npx expo export --platform all
```

Verified: **37 mobile tests**, **49 selected isolated backend tests**, TypeScript/lint, compatible dependencies, Expo Doctor **21/21**, Android native generation/config inspection and Android/iOS Hermes/web exports. Fixture Chrome smoke passed at **320/390/768px**, including outage/retry, image failure, cart reload, checkout draft navigation, validation/coupons and the native-storage send gate. Run `node tests/browser-smoke.cjs` after export with `PLAYWRIGHT_MODULE` pointing to installed Playwright and Chrome available. The script starts/stops its own server/browser; screenshots/logs/config/audit artifacts are ignored.

**No physical Android/iOS or emulator runtime testing. No APK/IPA.** Export and browser checks cannot prove native secure storage, lifecycle, keyboard/back or installation. Dependency audit still reports **29 advisories (11 moderate, 18 high)**; incompatible forced fixes were not applied. Resolve compatible remediation before production release.

See [Phase B record and build/install handoff](../docs/mobile-phase-b.md) and [Phase A API/recovery design](../docs/mobile-phase-a.md). Rewards, advanced offers, push, online payment, multilingual work and store publication remain outside this phase.
