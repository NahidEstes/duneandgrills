# Customer conveniences — 12 October 2026

## Behavior and reused contracts

**Order again** is available on authenticated history cards and verified owner order details. The existing authenticated `POST /orders/:id/repeat` queries the order with both its ID and `req.user._id`; there is no guest repeat contract. Its response is `{ success, data: RepeatedLine[], warnings: string[] }`. Lines contain `_id`, `productType`, current `price`, `quantity`, `selectedAddOns` (IDs in `_id`), and `spiceLevel`.

The app re-fetches public menu/combos and applies existing `lineFor`/`addLine` rules: maximum 99 per configured selection and 100 selections. Historical item notes are stripped. Unavailable items, changed options, quantity violations and server warnings are reported. A populated cart asks **Merge with cart / Replace cart / Cancel**. Replacement is written only after confirmation and eligible lines exist; an empty result keeps the original cart. Successful repeat opens Cart with current prices and warnings for review. Checkout notes and coupon selection are reset; historical discounts, rewards and payments are never imported. Nothing places an order automatically. A shared action gate blocks duplicate taps; pending order recovery blocks cart writes. An expected-cart reference prevents a delayed repeat from overwriting a concurrent add. Responses/actions remain tied to their account and credential.

**Favourite foods** uses existing owner-authenticated endpoints:

| Endpoint | Actual response/behavior |
| --- | --- |
| `GET /profile/favorites` | `{ success, data: Product[] }`; menu items carry `productType: 'menuItem'`. The backend also returns available saved combos, which this mobile list intentionally filters out. |
| `POST /profile/favorites/:menuItemId` | 201 `{ success, data: item }`; validates availability and uses `$addToSet` for the current user. |
| `DELETE /profile/favorites/:menuItemId` | `{ success, data: id }`; removes only from the current user. |

One account-scoped in-memory provider supplies hearts on Home/Menu/details and `/favorites`, accessed through **Profile → Account → Favourite foods**. It refreshes on login, list focus, retry, and after mutations; successful writes update the shared UI, and failed writes retain its selection. Old-account GETs are aborted and late mutations cannot update another account. Authenticated favourites are not stored in AsyncStorage. Cards display current server prices; required customization opens the existing item detail loader, rather than using unpopulated favourite add-on references. Loading, empty, retry and unavailable-history explanations are included. The backend hides unavailable favourites without deleting their stored IDs; the app performs no cleanup DELETE. Combo favourites/history are unchanged.

A guest heart opens `/auth?favorite=<id>`. Sign-in returns to `/item/<id>?favorite=review` showing the selected account and requiring another explicit heart tap. Login itself never saves the item. Pending recovery retains priority in the login return flow.

**Share** actions on item, combo and offer details call React Native `Share.share`, without a new dependency. The message contains the actual title, a short public product description where useful, and one canonical HTTPS link. Offer editorial discount text is omitted; checkout confirms eligibility. No customer, authentication, private order/tracking credentials or API URL enter generated content. Dismissing the sheet is cancellation; no successful delivery notification is shown. Android's returned action is not proof that a message was sent.

## Routes and configuration

| Public link | Mobile route and fresh read | Website fallback |
| --- | --- | --- |
| `<website>/item/<id>` | `/item/[id]`, `GET /menu/:id` | Existing website item modal with current data |
| `<website>/combo/<id>` | `/combo/[id]`, `GET /combos/:id` | Existing website combo item modal with current data |
| `<website>/offer/<id>` | `/offer/[id]`, `GET /offers/:id` | Public offer, linked product and checkout disclosure |

IDs are bounded alphanumeric/hyphen strings; backend ObjectId validation remains authoritative. Invalid/malformed links produce a useful error or `/link-unavailable`, never an arbitrary return URL. Expired/unavailable offers disable their actions. The native screens re-fetch through the existing focus/foreground resource controller. The minimal new Next.js pages read public content only and require no installed app; their API calls omit cookies. Website POS/Kitchen/Admin/PWA behavior is unchanged.

Set `EXPO_PUBLIC_WEBSITE_URL` to the approved **HTTPS website origin**, independent of `EXPO_PUBLIC_API_URL`. Credentials, paths, query strings and fragments are rejected. Development/preview default to `https://duneandgrills-testing-six.vercel.app`; production requires an explicit approved website and API and rejects the known testing host. These are public build-time variables; set them in the matching build environment and restart Metro after changing them. The website's existing metadata-origin configuration should use that same approved deployment origin.

`scripts/build-config.cjs` preserves `com.duneandgrills.customer` and adds Android `VIEW`/`BROWSABLE`/`DEFAULT`, HTTPS host, `/item/`, `/combo/`, `/offer/` prefixes with `autoVerify: true`; iOS gets `applinks:<host>` in `associatedDomains`. `src/app/+native-intent.ts` uses one resolver for `initial: true` and `initial: false`, accepting only the configured HTTPS origin for public links; it also understands the existing `duneandgrills` scheme. OS delivery still depends on verified association.

## Remaining deployment/build prerequisites

The website pages are implemented and verified in a local production build; **they have not been deployed** to the testing host. Shared links on that host need deployment of these routes before the fallback is available there. Read-only checks on 12 October found both association endpoints below returning **404**. Automatic Android/iOS app opening is **unverified**.

Publish the website routes and real association files on the configured host after separate authorization. Templates below are documentation only: replace placeholders with the actual signing identity, never deploy them unchanged.

Android: serve `/.well-known/assetlinks.json` over HTTPS as JSON. Use the certificate fingerprint of the installed build, including the Play app-signing certificate for Play-distributed builds. Keep the existing package:

```json
[{ "relation": ["delegate_permission/common.handle_all_urls"], "target": {
  "namespace": "android_app", "package_name": "com.duneandgrills.customer",
  "sha256_cert_fingerprints": ["<ACTUAL_SIGNING_CERTIFICATE_SHA256>"]
} }]
```

iOS: serve `/.well-known/apple-app-site-association` as JSON without a file extension; use the actual Apple Team ID, the existing bundle identifier and matching entitlement/provisioning:

```json
{ "applinks": { "apps": [], "details": [{
  "appID": "<ACTUAL_APPLE_TEAM_ID>.com.duneandgrills.customer",
  "paths": ["/item/*", "/combo/*", "/offer/*"]
}] } }
```

Both documents must be public and reachable without login/redirects. Build/install a matching native app after configuration changes; Expo Go and JavaScript exports cannot establish production domain association. On actual Android/iOS devices test links from another app with the app stopped and already running, each content kind, unavailable/expired IDs, share open/dismiss, and browser behavior without the app. Validate Android domain verification and iOS entitlements/association, including the vendor cache/reinstallation behavior. No certificate fingerprint, Apple Team ID, production domain or deployment is assumed.

Reference: [Expo Android App Links](https://docs.expo.dev/linking/android-app-links/), [Expo iOS Universal Links](https://docs.expo.dev/linking/ios-universal-links/), [Expo native-intent](https://docs.expo.dev/router/advanced/native-intent/), [React Native 0.86 Share](https://reactnative.dev/docs/0.86/share).

## Verification

- Mobile TypeScript and lint: passed. **65 mobile tests** passed, including current-price customization, skipped/changed options, safe empty replacement, merge limits, public URL safety, real native-intent entry in cold/warm mode, pending/idempotency/account-storage regressions and native configuration checks.
- Actual Expo Android/iOS Hermes and web exports: passed. These are JavaScript bundles, not installed APK/IPA builds.
- Fixture Chrome diagnostics: conveniences, Profile, Offers, Active Order, and design/cart/checkout scripts passed. They exercise actual routes/providers with all API writes intercepted. Only native secure storage/dialer/share adapters are substituted in an isolated ignored copy. Conveniences cover cancel/merge/replace, current-price customized lines, duplicate/pending locks, concurrent-cart preservation, favourites CRUD/write failure/hidden history, explicit guest login return, delayed old-account response, canonical item/combo/offer shares and cancellation, expired/unavailable states, 320/390px and enlarged web text. Existing design checks additionally cover 768px.
- Website lint and production Next.js build: passed. **11 selected frontend tests** passed. Built website browser checks passed for the three public routes without an app, current data/price, linked product, malformed/unavailable/expired/retry states, 320/390px and no automatic API writes.
- Backend source is unchanged. Existing owner repeat/profile favourites contracts were inspected; no live/staging test customers or orders were written.
- **No native-device/emulator runtime test, verified domain association, commit, push, deployment, publication, APK/IPA or cloud build occurred.** Native share UI/cancellation and OS cold/warm delivery remain device checks; fixture adapters and routing unit tests do not prove these.

Reproduce with `npm test`, `npm run typecheck`, `npm run lint` in `mobile`; lint/build plus `node --test tests/publicSharedContent.test.mjs tests/pwaSecurity.test.mjs` in `frontend`. For browser scripts set `PLAYWRIGHT_MODULE` to an installed Playwright module with Chrome available. `node tests/profile-harness.cjs` in mobile creates the isolated browser export; then run `conveniences-smoke.cjs`, `profile-smoke.cjs`, `offers-smoke.cjs`, `active-order-smoke.cjs` in that tests directory. Run `design-smoke.cjs` with `MOBILE_EXPORT_DIR=../artifacts/profile-harness-dist`, or use the ordinary diagnostic web export. Website `node tests/public-shared-smoke.cjs` starts/stops its own built Next server on port 3106. Fixture scripts use the existing ignored `mobile/artifacts/catalog-snapshot.json` and need no live writes.

Main implementation: `domain/repeat.ts`, `hooks/useOrderAgain.ts`, `components/order-again.tsx`, `state/FavoritesProvider.tsx`, `components/favorite.tsx`, `app/favorites.tsx`, `services/sharing.ts`, `domain/public-links.ts`, `components/share.tsx`, `app/+native-intent.ts`, `app/offer/[id].tsx`, the existing customer screens/provider, native build configuration, and the three minimal frontend public pages/`PublicSharedContent.jsx`.
