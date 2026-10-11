# Dune & Grills customer mobile — Phase B

Work and verification: 2026-10-10, Asia/Riyadh. Continues the committed Phase A app (`85f8ac4`) on Expo SDK 57 / React Native 0.86. No scaffold reset, commit, push, backend deployment, OTA release, store submission, purchase or plan upgrade.

## Delivery status

Subsequent source UI work is documented in [Customer mobile visual redesign](mobile-redesign.md). The APK linked below is the historical Phase B artifact; it does not contain the 2026-10-11 redesign. No new cloud build was started for that task.

**Android APK: ready.** [Download the final preview APK](https://expo.dev/artifacts/eas/kC9ipPvEHEmM2CrtJaxEALjDx3MGtqSERpZRho7fq9E.apk) or open its [EAS build page](https://expo.dev/accounts/nahidestes/projects/dune-and-grills/builds/2e3edf3f-2e3b-4d51-85cb-505b5349cbd7). Version **1.0.0**, Android versionCode **5**, package **com.duneandgrills.customer**. The cloud build finished at **2026-10-10T19:28:50.524Z**. The preview embeds `https://duneandgrills-testing-six.vercel.app/api` and runs without Metro or Expo Go.

Local file: [dune-and-grills-preview-1.0.0-build-5.apk](<F:/My Projects/duneandgrills/mobile/artifacts/dune-and-grills-preview-1.0.0-build-5.apk>), **103,512,871 bytes** (98.7 MiB). SHA-256: `f23ff4000d92db6ce5e1ad946f08b058503cf85cb4d58a63d576571411dddff1`.

The real project is [@nahidestes/dune-and-grills](https://expo.dev/accounts/nahidestes/projects/dune-and-grills), ID `b21d6508-3510-4d0d-b04f-a2abb8e3f39c`, saved with owner in `mobile/app.json`. Existing projects/account identities were inspected; none used this app's Android package. Both accessible accounts had Free plan usage 0/30 before submission. Two cloud builds were completed on the free allowance; no purchase, upgrade, store submission or OTA publication occurred. EAS generated and retained the new app's managed Android signing key; private signing material was not downloaded.

The downloaded final APK passed an independent Node crypto check of the AOSP v2 signer signature and all signed content digests. Its certificate SHA-256 matches EAS public metadata: `4dab029aa9cca591ce2f58bcae345ae0c28744f154649c84275142c94527e92f`. Its actual binary manifest/configuration confirms version/package, non-debuggable release, preview environment/staging URL, project ID, Android minimum API 24 (Android 7.0), target API 36 and all four ARM/emulator ABIs. Only network permissions and the app-scoped AndroidX receiver permission remain. Camera, microphone, location, media/storage, notifications, vibration, overlays and unused biometric/fingerprint permissions are absent. Compiled backup rules exclude SecureStore from cloud backup and device transfer. Local report: `mobile/artifacts/apk-verification.json`.

The first completed build (versionCode 4) exposed SecureStore's unused biometric permissions during APK inspection. They were removed in Expo configuration and the final build 5 was rebuilt, downloaded and checked. Install the final artifact linked here.

**Native device execution is still unverified.** This host has no Android SDK/adb/emulator or attached phone, and no iOS IPA/device/simulator was produced. Source tests, browser fixture checks and artifact inspection cannot prove OS lifecycle, keyboard/back, native secure storage or install/start behavior. Valid deployed staging native login also remains unverified; no backend deployment or staging customer/order creation was performed.

## Audit findings and changes

- Checkout drafts previously disappeared after returning to Cart and reopening checkout. Customer/fulfillment/coupon/note drafts now live in the app provider, stay across ordinary navigation, and clear on confirmation/logout/account switch. They are memory-only; customer contact/address drafts are not written to plain cart storage. Review is deliberately recalculated when checkout is reopened.
- Session expiry previously retained an account cart only in memory; after the invalid credential was deleted, a restart could select the guest cart. A durable owner marker now retains the original account cart across restart. Checkout requires original-account sign-in or explicit clearing from Profile before guest checkout. The marker stores only an account ID, with no credential or contact fields.
- Logout and account switches previously retained protected account tracking caches. They now remove account tracking summaries/tokens and the outgoing cart, while preserving guest tracking. Unresolved requests still block logout/switching; same-account reauthentication preserves the immutable request and cart. Partial persistence failures return to the restore/retry screen, rather than exposing a new session before storage completes.
- A reorder or catalog refresh finishing after an account switch could apply its result to the new cart. Writes from these operations now check the original actor; order detail error/warning state is also scoped by account/order.
- Server/proxy/database error text could reach customer screens. HTTP failures now map to short customer messages for outages, expiry, access, throttling, stock, coupons and validation. Corrupt protected data does not display raw saved input. Missing native auth now shows a service availability message; deployment details remain in documentation.
- A background/resume race could leave multiple polling timers after an aborted read. The shared controller now owns one foreground generation, timer and read; obsolete results cannot update state or reschedule. It cancels on background/blur, refreshes on resume, honors cooldown, backs off, stops polling terminal orders and stops automatic unauthorized reads. Explicit user refresh remains available. Poll intervals remain 30 seconds for account history/details and 120 seconds for private tracking.
- Menu cards now use a bounded native `FlatList`, fixed-size images and restaurant-mark placeholders while loading or after image failure. Invalid image URLs fall back safely. Shared layouts wrap at small widths; controls retain system typography, text scaling, accessible roles/labels and 46–50 point targets. Quantity controls have spoken increase/decrease labels and disable during cart persistence. Cart changes use a synchronous duplicate-tap gate.
- Root/screen error boundaries and a branded missing-page route provide retry/navigation without showing stack traces or deleting saved orders. Native stacks retain default back behavior; Android tab back returns to Menu. Existing keyboard avoidance, resize mode and safe areas are retained. Actual OS keyboard/back/text-scaling behavior remains a phone-test prerequisite.
- Installed SDK-compatible `expo-dev-client ~57.0.19` for the development profile. Expo's Android prebuild generated ignored native files; no native source was edited by hand. Its script updates (`expo run:android`, `expo run:ios`) are retained.

No backend production code or frontend/PWA/POS/Kitchen/Admin code changed in Phase B. The existing isolated mobile integration test gained two-address default/edit/delete/ownership coverage and verifies that reorder uses a changed current price without rewriting the confirmed receipt.

## Order and security guarantees retained

The existing order engine remains authoritative for items, availability, customization, fees, minimums, coupons, stock, total, fulfillment and cash collection. Menu/cart/checkout logic revalidates current catalog data before review; COD remains pending until actual collection. Confirmation displays the server's receipt. Authenticated history/reorder/profile/addresses retain existing bearer authorization and shared rate limits; guests use private header-based tracking.

SecureStore holds bearer sessions, immutable pending payload/key/actor/origin and private tracking summaries. Passwords are not persisted. AsyncStorage holds cart selections and the owner marker, never tokens/passwords/private tracking credentials. The native pending request is durably written before sending; storage failure prevents submission. Timeout/outage/409/400/410 does not discard it or start a replacement. Retry/reconciliation use the original payload/key/actor and pinned API URL; same-account reauthentication can refresh the transport token. Confirmed tracking and cart clearing persist before pending deletion. Cancellation preserves the cart. There is no automatic mutation retry or offline order/payment queue.

Preview/production configuration requires HTTPS; saved requests using a development HTTP origin require their original development environment to resolve. Do not change environments, clear app data or uninstall while a request is unresolved. The same identifiers are deliberately retained across profiles; installing another profile replaces the app rather than creating a separate environment. Resolve all saved requests before replacing it.

Android CNG inspection confirmed the app ID, scheme, brand assets, resize/back flags and SecureStore backup-rule references. The installed SecureStore library supplies backup and device-transfer exclusions for its encrypted preferences. The final merged APK manifest was also inspected: unused biometric/fingerprint permissions were removed after the first binary revealed them; final permission and compiled backup checks are recorded above. Development retains the overlay permission used by native developer tooling.

## Build profiles and public environment

`mobile/app.json` retains **Dune & Grills**, slug `dune-and-grills`, scheme `duneandgrills`, version `1.0.0`, Android application ID and iOS bundle ID **`com.duneandgrills.customer`**, restaurant icon/splash assets and existing tablet support.

`mobile/app.config.js` adds validated configuration through `scripts/build-config.cjs`; existing owner/EAS project metadata is preserved when linked. `mobile/eas.json` defines:

| Profile | API | Android | iOS |
| --- | --- | --- | --- |
| development | Explicit HTTPS staging; change development configuration to an owned local/test API when rehearsing | Internal development client APK; Metro required | Internal development client; registered devices/signing required |
| preview | Explicit `https://duneandgrills-testing-six.vercel.app/api` | Internal release APK, runs without Metro | Internal/ad hoc signed build, registered devices required |
| production | Approved `EXPO_PUBLIC_API_URL` must be supplied through the EAS production environment | AAB for future Play submission | Store-distribution archive for future submission |

Build environment and profile must match. Configuration rejects missing production URL, HTTP release URLs, credential/query/fragment URLs, invalid `/api` suffixes, an alternate preview destination, and the known staging host in production. No production backend URL is invented. API URLs are public app configuration. Do not put private credentials in `EXPO_PUBLIC_` values or app config.

EAS remote version management is enabled. Native versionCode/buildNumber seed at `1`; preview and production builds auto-increment the remote platform number. The final APK uses Android versionCode 5. Build 4 was superseded by the permission cleanup; two earlier preparations stopped before queuing after incrementing the remote counter. Marketing version `1.0.0` changes explicitly for a future release. Reuse this project's managed Android signing key for subsequent builds and installations.

The repository-root `.easignore` archives only the self-contained `mobile/` app. It excludes frontend/backend files, environment secrets, credentials, generated native projects, dependencies and diagnostic artifacts. The actual EAS shallow-copy implementation copied 122 entries with only `mobile/` at the archive root, required source/config/lockfile/helpers present, and excluded apps/secrets/generated directories absent. A Windows directory-filter issue with trailing-slash exceptions was corrected before queuing; the real upload is 1.5 MB. `credentials.json` is also Git-ignored. EAS CNG generates native projects in the cloud; the local generated `android/` is not uploaded or tracked. Keep signing material in EAS's supported credential system.

The optional local automatic fingerprint step stalled on Windows. The submitted job used `EAS_SKIP_AUTO_FINGERPRINT=1`, supported by the installed EAS CLI. No OTA update or fingerprint-based runtime policy is used here. Both aborted preparations stopped before any cloud build job was created.

## Android APK build and install

Run all commands from the app directory:

```powershell
Set-Location 'F:\My Projects\duneandgrills\mobile'
npm ci
npx eas-cli@latest login
npx eas-cli@latest whoami
npx eas-cli@latest project:info
```

The project is already linked to `@nahidestes/dune-and-grills`. `app.config.js` preserves the actual `extra.eas.projectId` and owner in the base `app.json`; do not initialize a second project or replace this signing identity for subsequent builds.

Inspect available free build allowance in that account's EAS dashboard. Inspect/reuse the Android signing setup using `npx eas-cli@latest credentials --platform android`, selecting preview. If this is a new unpublished app, EAS can generate/manage its Android keystore securely during the interactive first build. Preserve the same key for later installations/updates; do not commit/download credentials into source files. Then build:

```powershell
$env:EAS_SKIP_AUTO_FINGERPRINT = '1' # Optional local fingerprint stalls on this Windows host
npx eas-cli@latest build --platform android --profile preview
```

This uploads/builds only; it does not submit to a store or publish an OTA update. Do not add `--auto-submit`. No paid resource class is requested. If free allowance is unavailable, wait for it to renew rather than upgrading. On success EAS provides the build page and APK download link. The completed final build and verified APK are linked above. Signing certificate SHA-256: `4dab029aa9cca591ce2f58bcae345ae0c28744f154649c84275142c94527e92f`. Public metadata only was inspected; private keystore/passwords were not downloaded.

Open the APK download link on the Android phone, download it, allow installation from that browser when prompted, and install. The preview app runs without Expo Go or Metro. Restore the browser's normal installation permission afterwards if desired. A future AAB cannot be installed directly like an APK. With Android SDK/USB debugging configured, the equivalent is `adb install -r <downloaded-apk-path>`; do not uninstall an app holding unresolved orders to resolve a signing mismatch.

For native development/isolated rehearsal:

```powershell
npx eas-cli@latest build --platform android --profile development
# After installing that development APK:
npx expo start --dev-client --lan
```

SDK 57's SecureStore, Crypto and AsyncStorage modules are bundled in matching Expo Go, so Go can perform initial functional checks. A development/native build is needed to verify this app's icon, splash, OS settings, permissions, signing and any future custom native modules. It is separate from the standalone preview APK.

Local Android compilation is an alternative after Java/Android Studio SDK/device setup: `npx expo run:android`. It produces a local development build, not the EAS-signed preview deliverable. Do not hand-edit the generated native directory; change Expo config/plugins and regenerate.

## iOS and deployed API prerequisites

iOS bundles compile and the profiles retain the original iOS identity. No IPA, signing operation, simulator or device test was produced. Physical-device EAS preview requires an existing Apple Developer membership, access to this bundle ID, distribution signing/provisioning and registered device UDIDs. `npx eas-cli@latest device:create` registers test-device information; then `npx eas-cli@latest build --platform ios --profile preview` can create an ad hoc build. Registering additional devices requires a new/re-signed provisioning build. No membership purchase is authorized here. Local iOS compilation requires macOS and SDK-57-compatible Xcode; this Windows host cannot run Xcode/iOS Simulator.

Native account login/register still requires the Phase A additive backend `POST /api/auth/mobile/login` and `/api/auth/mobile/register` routes to be deployed. Repository auth/proxy behavior is proven locally with owned data; the deployed staging revision and valid staging sign-in were not verified. No backend deployment or staging customer/order creation occurred. Existing browser authentication is unchanged. Preserve transaction/index readiness, stable JWT secret, active/sessionVersion validation and rate limiting from Phase A.

## Verification evidence and reproduction

| Check | Evidence |
| --- | --- |
| Mobile tests | 37 passed: cart/customization/checkout; API error/timeout/cancellation; chunked protected persistence; immutable request/retry/restart/concurrency; expiry versus outage; owner retention/logout/switch storage failures; polling lifecycle/cooldown/terminal states; build environment and safe customer messages |
| TypeScript / Expo lint | Passed; final lint has no warnings/errors |
| Expo dependency compatibility | `npx expo install --check`: up to date |
| Expo Doctor | 21/21 passed |
| Android CNG | `npx expo prebuild --platform android --no-install`: passed for development and preview; generated source inspected, no Gradle APK compilation |
| Preview public config | Name/identity/version/environment/HTTPS staging validated; real EAS project linked |
| EAS profile schema | Installed EAS CLI's schema/resolver validated all three profiles for Android and iOS without account access |
| Android + iOS + web export | Hermes bundles and 16 static routes compiled in preview environment |
| Owned backend regression selection | 49 tests including nested counts: mobile native auth/proxy, owner address defaults, current-price reorder, shared order engine/inventory/COD, security and selected existing regression tests |
| Browser fixture runtime | Chrome at 320/390/768 pixels; outage/retry/safe error text/image failure/search/required choices/cart reload/checkout navigation draft/coupon/native secure-write gate/auth validation; no page errors or remote writes; typography asserted and screenshots inspected |
| Android/iOS runtime | **Not tested on physical device/emulator.** Browser rendering and pure controller tests cannot prove OS lifecycle, keyboard/back, native storage or install/start behavior |
| Android APK / iOS IPA | Signed Android preview APK built/downloaded/verified, versionCode 5; no IPA or device execution |
| Dependency audit | 29 advisories: 11 moderate, 18 high, zero critical; detailed local report `mobile/artifacts/dependency-audit.json`. Suggested fixes include incompatible Expo/RN downgrades or Router major changes; no forced upgrade/downgrade applied |

Reproduce locally:

```powershell
Set-Location 'F:\My Projects\duneandgrills\mobile'
npm test
npm run typecheck
npm run lint
npx expo install --check
npx expo-doctor
$env:EXPO_PUBLIC_APP_ENV = 'preview'
$env:EXPO_PUBLIC_API_URL = 'https://duneandgrills-testing-six.vercel.app/api'
npx expo export --platform all
$env:PLAYWRIGHT_MODULE = 'C:\Users\Mohammed Nahid\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node tests/browser-smoke.cjs
```

The fixture script intercepts API/image requests, owns/stops a loopback static server and Chrome, and only simulates coupon validation. Web protected storage still prevents auth/order writes. Screenshot/log/config/audit artifacts and exports are ignored by Git/EAS; they are diagnostics, not binaries.

From `backend/` with local `mongod` available:

```powershell
$env:MONGOD_BINARY = 'C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe'
node --test tests/mobilePhaseAIntegration.js tests/orderEngine.test.js tests/orderEngineIntegration.js tests/stagingSecurity.test.js tests/stagingSecurityIntegration.js tests/phase3bReorder.test.js
```

These tests create/stop helper-owned temporary loopback MongoDB replica sets and Express services. They do not read/reset application databases. No Metro/API/emulator verification service was left running.

## Remaining acceptance work

After obtaining the actual APK, rehearse on a physical Android phone against owned fixtures/isolated development data: native secure persistence, cold start, register/login/profile/address operations, delivery/pickup/customizations, one COD order, private tracking/account history, reorder, cash/status updates through the restaurant workflow, airplane mode, lost response/app restart/reconciliation, session expiry/reauthentication, account isolation, foreground/background, Android back/keyboard and enlarged text. Use the development profile with an owned API for this rehearsal; do not create automated test customers/orders in staging/live restaurant data. A separate actual-user staging acceptance can follow the deployed auth readiness check.

Resolve compatible dependency advisories before production release, retain the verified signing identity and provide the approved production URL before using the production profile. Complete iOS device verification/signing when an existing Apple account/device is available. There is no measured native cold-start/frame/memory performance claim.

Future extension points remain the existing API/domain/provider/controllers. Rewards UI, advanced offers, push notifications, online payment, multilingual work and store publication are excluded from this phase; they must not bypass the shared order engine or its recovery guarantees.

Official references used: [SDK 57](https://docs.expo.dev/versions/v57.0.0/), [build profiles](https://docs.expo.dev/build/eas-json/), [APK build/install](https://docs.expo.dev/build-reference/apk/), [remote build versions](https://docs.expo.dev/build-reference/app-versions/), [internal iOS distribution](https://docs.expo.dev/build/internal-distribution/), [monorepo builds](https://docs.expo.dev/build-reference/build-with-monorepos/), [EAS archive exclusions](https://docs.expo.dev/build-reference/easignore/), [SDK 57 DevClient](https://docs.expo.dev/versions/v57.0.0/sdk/dev-client/), [SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/), [Router error boundaries](https://docs.expo.dev/router/error-handling/) and [AOSP APK v2 signature format/verification](https://source.android.com/docs/security/features/apksigning/v2).
