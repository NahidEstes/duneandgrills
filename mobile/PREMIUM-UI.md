# Dark Premium customer UI

Implemented on 17 October 2026 from the approved Home/Menu/Item and Offers/Cart/Profile/Orders design concepts in `../output/ui-designs/`.

## Screens

- **Home:** shared brand header with the actual cart count, delivery/pickup selection, selected address, existing active-order card, orange-accent headline, photographic menu hero, category shortcuts and product cards.
- **Menu:** searchable, virtualized two-column product grid with equal-height cards, real catalog prices, favourites and quick add. Uses one column when native font scaling exceeds 135%.
- **Item details:** large catalog image, favourite/share actions, visible base price, grouped portion/add-on choices when configured by the catalog, spice/note fields and quantity. A measured footer keeps the add-to-cart action visible. Required customization and unavailable items still block adding.
- **Offers:** a real fifth navigation tab, combo photography, coupon cards, existing eligibility/expiry disclosures, filtering and details. Selecting a coupon continues through the existing server validation and sign-in rules.
- **Cart:** compact item rows, quantities/removal, address selection, coupon confirmation, server-configured fee and summary, and a persistent checkout footer. Distance-based delivery shows “At checkout” until checkout obtains a quote, instead of presenting a static fee/total.
- **Profile:** shared header, existing identity/avatar, real rewards balance, account shortcuts and grouped settings/help. Arabic/English switching and logout/recovery protection remain available.
- **Orders:** current/past sections, item previews, actual fulfillment-specific progress, status badges, private guest tracking and the existing reorder flow. Estimates appear only when supplied by the server; no delivery ETA is invented.

The bottom navigation is Home, Menu, Offers, Orders and Profile. Cart remains an existing route reached through the shopping bag and menu cart bar. The Arabic Profile label wraps at narrow widths instead of truncating.

## Data and scope

The application continues to use its existing catalog, offers, orders, account and rewards APIs. Mockup names, prices, coupons, account balances and sample orders are **not** seeded or hardcoded into application screens. The existing logo is retained. No dependencies, authentication/storage contracts, order submission engine or backend endpoints were changed.

Screenshots prefixed `artifacts/premium-` are browser diagnostics of the actual components using isolated fixtures, not live customer data. Native protected-storage and sharing substitutes exist only in the diagnostic copy created by `tests/profile-harness.cjs`.

## Verification

Passed: 75 mobile tests, TypeScript, lint, Android/iOS/Web exports, and eight browser diagnostics (premium UI, offers, conveniences, profile, points, active orders, protected checkout and responsive design). The final small cart-count copy correction was additionally checked with TypeScript/lint.

## Component screenshots

These are real rendered components with isolated sample data and cached catalog photography:

- [Home](artifacts/premium-home-390.png)
- [Menu](artifacts/premium-menu-390.png)
- [Item customization](artifacts/premium-item-options-390.png)
- [Offers](artifacts/premium-offers-390.png) and [coupon](artifacts/premium-coupon-390.png)
- [Cart](artifacts/premium-cart-390.png) and [summary](artifacts/premium-cart-summary-390.png)
- [Profile](artifacts/premium-profile-390.png)
- [Orders](artifacts/premium-orders-390.png)
- [Arabic menu at 320px](artifacts/premium-menu-ar-320.png)

## Reproduce

Run from `mobile/`:

```powershell
npm test
npm run typecheck
npm run lint
npx expo export --platform all --output-dir artifacts/premium-export --max-workers 2
node tests/profile-harness.cjs
```

With Playwright and Chrome available (`PLAYWRIGHT_MODULE` can point to an installed package), run:

```powershell
node tests/premium-ui-smoke.cjs
node tests/offers-smoke.cjs
node tests/conveniences-smoke.cjs
node tests/profile-smoke.cjs
node tests/points-smoke.cjs
node tests/active-order-smoke.cjs
$env:MOBILE_EXPORT_DIR = '../artifacts/premium-export'
node tests/browser-smoke.cjs
```

The premium UI diagnostic covers all seven screens, five navigation tabs, the two-column/search menu, required customization, coupon arithmetic, purchase footers, offer/order filters, real rewards presentation, distance-priced delivery totals and Arabic RTL at 320/390/768px. Other diagnostics cover existing profile/address, reorder, offer, rewards, active-order and protected checkout behavior. All writes are intercepted fixtures.

This is a source/UI update with local bundle exports. It does not produce a new signed APK, install an update on a device, publish an OTA update or deploy backend changes. The previously linked build 9 predates this work.
