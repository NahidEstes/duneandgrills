# Offers and Combo Details

Implemented in the existing Expo SDK 57 / React Native customer app. Home shows up to two current offers in the server's featured/sort order, with “See all”. `/offers` has All offers, Combo deals and Coupons filters and the existing four bottom tabs. Offers has no permanent tab button. `/combo/[id]` is a pushed detail screen accepting a combo ID or slug; `/item/[id]?type=combo` redirects there for compatibility. Menu/Home combo actions open this detail screen before adding.

The screens use the shared dark/orange native components, restaurant photography with the existing branded image fallback, rounded cards, grouped included items, quantity controls and a measured footer outside the scrolling content. No phone frame, simulated status bar or reference-image sample data is embedded in production code.

## Existing API and pricing contract

- `GET /offers` and `GET /offers/:id` supply the actual Offer DTO and populated `orderProduct`. Classification uses actual product/coupon fields; an offer with both a combo and a coupon appears in both filters. Active/date/usage checks hide inactive, future, expired and exhausted offers. Date text uses `Asia/Riyadh`. Member offers show their login/tier requirements; server validation decides individual eligibility.
- `GET /combos/:idOrSlug` supplies `items[].menuItem` and quantities, status/availability, `comboPrice` and catalog-calculated `regularPrice`. Included items are displayed without adding them as chargeable cart lines.
- `Combo.comboPrice` is the authoritative catalog price. `Offer.offerPrice`, `originalPrice`, `badge` and `discountText` are promotional metadata; the order engine does not honor an independent Offer price. The UI displays the actual catalog price and explains mismatched metadata instead of claiming it is payable. Strike-through/savings use only the Combo's calculated regular price. Coupon prices remain conditional, with minimum order, discount cap, applicable scope and membership conditions shown.
- Add re-fetches combo and offer before writing the existing cart. A changed price requires another Add action after reviewing the new total. Expired/missing/mismatched offer context requires “Continue at current price” before Add when the underlying combo remains available. Missing/unavailable included items disable Add. Checkout continues to re-fetch catalog/config, validate coupons, and submit through the existing ordering engine only after the customer explicitly places an order.
- Add creates one `productType: 'combo'` line with selected quantity and empty customization, retaining existing merge/99-quantity limits, account ownership and persistence. Unresolved-order recovery locks prevent cart/coupon changes. No ordering backend, Admin, POS, Kitchen, PWA or historical-order changes were necessary.

Combo-specific Special instructions are omitted: the current combo customization contract rejects customization and the order/Kitchen snapshot does not preserve a combo item note. Existing checkout-wide Kitchen notes remain supported. No unsupported field or hidden note overwrite is sent.

## Coupon flow

Use offer carries the Offer ID to Cart and re-fetches it. Cart fills the actual code, automatically validates it when items are present, and uses the existing authenticated `POST /offers/validate-coupon` with actual serialized selections. Only a successful server response shows Applied. Current catalog is checked before validation; a price change updates the cart and requires review/re-application. Cart, coupon, account/session identity and selected-offer changes invalidate the displayed quote. Checkout validates again. No client coupon-discount engine or automatic order submission was added.

An empty cart retains a suggested code and offers “Browse eligible products”; Apply remains disabled until items exist. Product/category offers open their eligible product or menu category. Removal/manual replacement clears the selected offer context. Member-only intent goes through `/auth?offer=...` and optionally `combo`/`quantity`; login returns only to fixed Cart/Combo routes, re-fetching the offer instead of trusting a coupon/price query or carrying an old account's checkout draft across accounts. Tier, minimum and scope rejection remain server decisions. Sanitized coupon errors do not incorrectly direct customers to saved-order recovery.

CTA mapping prefers the actual eligible product/category, supports existing menu/offer/combo links, and opens valid credential-free HTTP(S) links with Expo Linking. Unsupported/internal admin destinations and unsafe protocols fall back to Menu; URL launch failures show a retryable message.

## Configuration and remaining device acceptance

A read-only staging check on 2026-10-11 returned **zero offers and zero combos**. Admin must publish available combos with valid included items/prices/photos and configure current active offers, their product references, truthful promotion fields, dates, eligibility and coupon rules. Home hides its section when there are no current offers; `/offers` shows its empty state. No sample records, test customers or orders were written to staging/live services. Native authentication still needs the existing mobile auth endpoints to be deployed/configured as described in the Phase A/B handoff; fixture login does not prove their staging deployment.

The existing preview APK predates these screens. This work does not build a new APK, trigger EAS, deploy or publish anything. Browser/Hermes checks do not establish native keyboard behavior, actual system text scaling, back gestures, lifecycle, Keychain/Keystore, device installation or Kitchen execution. Physical Android/iOS checks remain required on a future installed native build.

## Verification and screenshots

From `mobile/`:

```powershell
npm test
npm run typecheck
npm run lint
npx expo export --platform all --max-workers 2
node tests/profile-harness.cjs
# Set PLAYWRIGHT_MODULE to the installed Playwright package when outside this app.
node tests/offers-smoke.cjs
node tests/profile-smoke.cjs
node tests/design-smoke.cjs
```

The unit suite includes actual offer date/cap/classification/member/CTA behavior, combo availability, authoritative-price disclosure, one-line serialization, merge/quantity limits, revalidation and sanitized eligibility errors, alongside existing checkout/recovery/tracking/session tests. The local Android/iOS exports generate JavaScript/Hermes bundles, not installable binaries.

Verified locally: **49 mobile tests**, TypeScript, lint, Android/iOS Hermes and web exports, Offers fixture diagnostics, and existing Profile and Home/Menu/Cart diagnostics. Removing and selecting the same offer again validates afresh; reverting a quantity change does not revive an earlier quote. Credential expiry invalidates coupon results and requires sign-in for the preserved account cart rather than validating it as a guest.

The Offers browser diagnostic uses the existing isolated Profile harness: actual screens, navigation, AppProvider and protected-store logic, with only the unavailable native storage driver replaced in an ignored temporary copy. All API requests and writes are intercepted. Offers/combos/codes/prices are explicit fixtures based on the audited backend DTO, with a cached read-only catalog photo for illustration; they are never production sample data. The fixture verifies navigation/filter overlap, one combo line, checkout review without submission, empty coupon/category guidance, login return with actual bearer validation, membership rejection, account/logout cleanup, quote invalidation/removal, stale prices, expired offers with explicit continuation, unavailable included items, old combo deep links, pending-order locks, retry/empty states and measured footers at 320/390px with 130% browser text. Existing Profile and Home/Menu/Cart diagnostics check regressions separately.

Ignored screenshots under `artifacts/`:

- `offers-home-320.png`, `offers-home-390.png`
- `offers-list-320.png`, `offers-list-390.png`
- `offers-combo-320.png`, `offers-combo-390.png`
- `offers-combo-bottom-320.png`, `offers-combo-bottom-390.png`
- `offers-combo-large-text-390.png`
- `offers-empty-coupon-390.png`

SDK references: [Expo 57](https://docs.expo.dev/versions/v57.0.0/), [Router](https://docs.expo.dev/versions/v57.0.0/sdk/router/), [Linking](https://docs.expo.dev/versions/v57.0.0/sdk/linking/), [React Native AppState](https://reactnative.dev/docs/0.86/appstate).
