# Customer mobile visual redesign

Implemented 2026-10-11 in the existing Expo SDK 57 app. The supplied images are visual references: Home is the brand/hero/Popular picks screen; Menu is the searchable horizontal food-card list; Cart is the checkout preparation screen. All products, photography, prices and configuration come from the existing API.

## Design system

`mobile/src/constants/design.ts` defines background `#101010`, surfaces `#202020`, borders `#343434`, orange `#FF7A18`, primary text `#FAFAF8`, muted text `#B5B5B5` and dark button text `#17100B`. Muted text on cards has 7.95:1 contrast; dark text on orange has 7.22:1. System fonts preserve native text scaling, with 32px titles, 21px headings, 16px body and 14px captions. Spacing uses 4/8/12/16/20/24/32px increments; cards use 20px corners and controls 16px or pill corners.

Shared primitives in `components/ui.tsx` style existing item customization, checkout, authentication, profile, address editor, order confirmation/tracking and loading/error states. Commerce components provide fulfillment segments, food cards, category strips, address cards, cash payment information, order summaries and the cart footer. Outline icons use Lucide's public per-icon imports with SDK-compatible `react-native-svg`; the hero uses Expo LinearGradient. Both dependencies are supported in matching SDK-57 Expo Go. Dark system appearance, a light native status bar and dark splash background are configured through Expo; no generated native files were edited.

Touch targets are at least 48px (primary buttons 52px). Main tabs take the top safe area; stack screens use the native header. The bottom navigator owns the bottom safe area and its height grows with native font scaling. The Menu footer is outside the virtualized list and receives its own measured layout space, so enlarged footer text cannot cover the last item. Forms scroll with keyboard avoidance on iOS and Android's existing resize configuration. At native font scales above 1.35, Home switches to one-column cards and separates hero copy from its image; Menu cards stack their photo above the content. Text is allowed to wrap instead of being truncated.

## Screens and preserved behavior

- Home displays the existing logo/wordmark, Delivery then Pickup, an address entry point, real menu search, a catalog-photo hero, actual category shortcuts and Popular picks. Picks use available `isFeatured` products sorted by `featuredOrder`. If none are featured, the first four available products in catalog order are shown with “Explore a selection from our menu.” No popularity counts or unsupported rewards/favorites/notifications are added.
- Menu retains `/(tabs)` and `/`, with search/category route parameters, real restaurant/city metadata from `/settings/public`, efficient FlatList rows and a cart footer with real quantity/subtotal. Header/cart entry points keep the existing `/(tabs)/cart` route accessible. The four visible tabs are Home, Menu, Orders and Profile. Startup opens Home; existing item/cart/order/address links remain valid.
- Add buttons open the existing detail/customization flow when customization or add-ons exist. Plain available items use the existing `lineFor`/`app.add` logic, with a local operation gate, existing quantity/ownership limits and pending-order protection.
- Cart preserves the existing gated cart writes and device persistence, with thumbnails, customization details, quantity/remove actions, fulfillment, address selection, coupons, configured delivery fees, summary and cash payment information. Coupon validation uses the existing endpoint/payload and rejects a changed authoritative subtotal. Discount quotes are bound to actor, cart and coupon, so edits invalidate them. Checkout always validates again; Cart's estimate never authorizes submission.
- Address selection reuses `/profile/addresses`, the existing editor and memory-only checkout drafts. Guests can enter their delivery address/phone. Saved-address creation can return to the selector. Ordinary back/navigation preserves the draft; account boundaries retain the provider's existing reset rules.
- Checkout only replaces presentation: its authoritative menu/config/coupon review, contact/minimum validation, original payload, durable persist-before-send, idempotency, recovery/reconciliation and duplicate-order gates are retained. Authentication, owner-isolated carts, secure storage, history, private tracking, foreground polling, reordering and profile mutations retain their existing contracts.

## Verification and screenshots

Commands run from `mobile/`:

```powershell
npx expo start --offline --port 8082 # refresh generated route types after adding screens
npx tsc --noEmit
npx expo lint
npm test
npx expo-doctor
npx expo export --platform all --max-workers 2
```

The existing functional suite passes 39 tests covering customization, pricing, checkout rules, account isolation, secure chunked persistence, recovery/idempotency, session restoration and polling. Expo diagnostics pass 21/21. Local exports check Android/iOS Hermes bundles and the static web diagnostic render; they do not create an installable native binary.

Browser diagnostics use locally intercepted API fixtures and never create remote accounts/orders. To reproduce:

```powershell
# Set PLAYWRIGHT_MODULE to an available Playwright package if not locally installed.
node tests/capture-catalog.cjs # public GET-only snapshot/photos in ignored artifacts/
node tests/browser-smoke.cjs
node tests/design-smoke.cjs
```

The original smoke flow exercises outage/retry, safe errors, broken-image fallback, customization, cart restart, checkout draft/validation/coupon, browser secure-storage submission blocking and auth validation. The design flow checks Home search/category navigation, quick add, cart quantity/removal, coupon failure/retry and quote invalidation, Delivery/Pickup, guest address selection/draft, guest Orders/Profile/private-tracking guards, cart footer placement, empty-cart behavior and layouts at 320/390/768px. A long-list fixture checks the final row against the cart footer; enlarged web text is a layout stress check only.

Screenshots are generated under ignored `mobile/artifacts/`: `redesign-home-390.png`, `redesign-home-picks-390.png`, `redesign-menu-390.png`, `redesign-cart-390.png`, `redesign-cart-summary-390.png`, corresponding 320/768px views and `redesign-menu-large-text-320.png`. Main screenshots use a snapshot of the actual public catalog/settings and the catalog's actual remote image URL. Coupon responses/contact values and the separate lengthy-list fixture are explicitly local test data. The snapshot taken during this task contained one featured Beef Burger and no combos; screenshot content therefore differs from the reference's larger illustrative assortment.

**Native device execution remains unverified.** This Windows host has no Android SDK/adb/emulator/attached device or iOS simulator/device. No physical platform, native keyboard/back/OS lifecycle or Dynamic Type execution is claimed. Authenticated profile/address writes and live order tracking were not repeated on a device; existing contract/state tests remain their local regression evidence. The supplied real catalog photography differs from the reference and is intentionally preserved; failed images show the existing branded fallback.

No commit, push, deployment, publication or cloud build was started for this redesign. The previously delivered Phase B APK (versionCode 5) predates these changes and does not contain this UI. A future authorized native build is required to install the redesign as a standalone APK/IPA.
