# Customer frontend usability handoff

## Scope and completed milestones

Implemented on `main`, preserving existing public branding, product assets, fonts,
pricing authority, guest tracking, original-request recovery and staff workflows.
No commit, deployment, production configuration/database operation or migration.

### A — Navigation, contact, footer and availability

- Header Menu opens `/menu`; Contact opens `/#visit` on every public page.
- Home/About/Offers anchors use real destinations. DOM-ready anchor handling and
  public-only scroll margins clear the fixed header without a timeout.
- Mobile navigation has expanded/controls semantics, initial focus, Escape/focus
  return and outside-click dismissal; essential header controls fit 320px.
- Public restaurant settings and ordering config are shared and deduplicated.
  Failed ordering-config reads do not assume ordering is enabled; checkout offers
  Retry. Disabled ordering is explained before checkout, with honest menu CTAs.
- Shared footer uses configured address, phone and grouped business hours, and
  omits bogus social/legal links and the inactive newsletter signup.
- Public metadata/install description no longer promises delivery unconditionally.

### B — Cart, checkout, controls and accessibility

- Item, cart and nested login use named native modal dialogs with keyboard focus,
  Escape, focus return and reference-counted background scroll locking. Closed cart
  controls are absent from keyboard/accessibility navigation.
- Touch controls, persistent labels, autocomplete, telephone fields, error
  associations, readable notes and safe-area-aware actions have been improved.
- Cart/checkout consistently show unit price, quantity, line total, subtotal,
  discount, configured fee and total; returning to cart retains a valid discount.
- Eligible menu-item cart lines reuse ItemModal for editing. Exact-line updates
  preserve quantities, including existing add-on quantities; conflicting/stale
  configurations fail instead of silently merging. Rewards/combos are excluded.
- Guest edits use existing local persistence. Authenticated edits extend the
  existing cart PATCH, resolve catalog prices server-side, check ownership and use
  an atomic revision/line predicate. No stock/order/payment write is added.
- Cart changes invalidate coupon validation; account changes cannot apply a late
  coupon response belonging to the previous account.
- Uncertain checkout uses customer-facing recovery wording and blocks a new
  submission while an original request remains unresolved. The original payload,
  actor scope and idempotency key are reused. Closing is not cancellation.
- The existing App options control is placed in public footer/login layout slots
  to avoid covering customer actions. Staff placement and install/update logic are
  unchanged; connectivity warnings remain in their existing location.

### C — Menu, consistency and verification

- Local search/sort/price filters remain; result counts, reset controls and distinct
  loading/error/real-empty/filtered-empty states are added. Home menu has Retry.
- Categories have selected-state semantics and mobile scrolling; sorting reuses
  the shared DarkSelect. Unavailable products remain unavailable.
- Important customization/cart/contact/tracking text is brighter and larger.
  Existing image optimization, gallery handling and approved assets are retained.

## Important files

- `frontend/src/context/PublicRestaurantContext.jsx`, `frontend/app/providers.jsx`
- `frontend/src/components/PublicHashNavigation.jsx`, `Navbar.jsx`, `Hero.jsx`,
  `HomePageClient.jsx`, `VisitUs.jsx`, `LandingFooter.jsx`, `Footer.jsx`
- `frontend/src/components/offers/{OfferCard,FeaturedOffer,OffersSection}.jsx`,
  `frontend/src/components/BlogSidebar.jsx`
- `frontend/src/hooks/useCustomerDialog.js`,
  `frontend/src/utils/{customerDialog,cartEditing}.js`
- `frontend/src/components/{ItemModal,CartDrawer,LoginPromptModal,AuthPage}.jsx`
- `frontend/src/context/CartContext.jsx`, `frontend/src/api/api.js`,
  `backend/controllers/cartController.js`
- `frontend/src/components/{FullMenuPage,MenuSection,MenuCard,GuestOrderTracking}.jsx`
- `frontend/src/components/pwa/PwaExperience.jsx`, `frontend/src/pwa/config.js`,
  `frontend/app/{globals.css,layout.jsx}`
- `frontend/tests/publicUsability.test.mjs`, `publicUsabilityBrowser.mjs`,
  `orderingInterfacesBrowserSmoke.mjs`,
  `backend/tests/customerCartEditingIntegration.js`

## Verification and safe reproduction

Frontend, from `frontend`:

```powershell
node --test tests/*.test.mjs tests/*.test.js
npm run lint
npm run build
# Requires Playwright and locally installed Chrome. Set PLAYWRIGHT_MODULE to the
# existing Playwright package directory if it is not available in module resolution.
node tests/publicUsabilityBrowser.mjs
node tests/runFunctionalBrowserRegressions.mjs
```

Backend, from `backend`:

```powershell
node --test tests/customerCartEditingIntegration.js tests/orderEngine.test.js tests/orderEngineIntegration.js tests/productionSafety.test.js tests/adminReportingAccuracyIntegration.js
```

These specific write-capable tests own disposable loopback MongoDB replica sets
through the existing isolated helper; `mongod` must be installed or the existing
`MONGOD_BINARY` test-only setting must point to it. They do not load application
database configuration. Do not substitute a production URI or run older
dotenv-based/destructive integration scripts without inspecting them separately.
Browser harnesses own loopback fixture/Next servers and all dummy mutations;
they do not use the application backend or real orders. Screenshots use the
existing local logo as an explicitly isolated product/photo placeholder, not a
replacement production food asset. Map content is a local placeholder.

Results recorded for this implementation:

- Frontend: 165 tests passed, 0 failed, 0 skipped.
- Backend targeted suite: 64 tests passed, 0 failed, 0 skipped.
- ESLint: exit 0, no errors/warnings.
- Production build and its TypeScript stage: exit 0, 31/31 generated pages.
  Existing React 18 deprecation warning remains; dependencies were not upgraded.
- Public browser journey: 320, 390, 768 and 1440px, reduced motion, keyboard,
  nested dialogs, local filters, guest cart edit/discount, close-during-submission,
  exact original-request recovery (one dummy order), private tracking, Contact,
  disabled ordering, home retry/empty and login/register labels. Selected rendered
  views pass axe WCAG 2 A/AA and 2.1 AA rule checks; this is not a site-wide
  accessibility certification. Header/toast separation and 460px-high checkout
  action reachability are asserted.
- Existing browser harness: customer/Kitchen/profile at 390/1440px;
  POS at 768/1440px; Admin reporting/Finance/cashier search at 390/1440px: exit 0.
- Backend syntax checks and `git diff --check`: exit 0.

## Manual journey

1. Home → Menu; search, sort, cap price and clear filters. Follow footer Contact
   from another public page and confirm Visit Us clears the header.
2. Customize a product with quantity, add-ons, spice and a note. Open cart → Edit
   options, save, reload and confirm quantity/line total. Rewards/combos should not
   offer the same Edit action.
3. Checkout as guest; verify name/phone labels, supported order types and payment
   wording. Apply a valid test coupon, return to cart and verify discount/total.
4. In an isolated environment only, simulate a lost order response. Close/reopen
   cart and use Check original order: same payload/key, one order, no cancellation
   implied. Verify private tracking requires its code, which never enters the URL.
5. Tab/Shift+Tab/Escape through item/cart/nested sign-in; test mobile short viewport
   and refresh while authoritative website ordering is disabled.

## Limitations and owner inputs

- No new migration, production seed, dependency or application environment variable
  is needed. Existing restaurant settings/order configuration remain authoritative.
- Supply approved real social-profile URLs and legal page content/URLs; current
  settings have no social/legal fields. No placeholder legal policies were created.
- Approve English/Arabic translations and RTL behavior before a broad language
  rollout. Verify allergens/dietary content with the restaurant; existing ingredient
  lists are not treated as allergen certification. Supply approved real restaurant
  photography if existing assets are to be replaced.
- Confirm configured phone/address/hours/directions are correct. Actual external
  map rendering, deployed production behavior, Safari/Firefox, screen readers and
  real iOS/Android keyboard/safe-area behavior were not verified here. Short Chrome
  viewport emulation is not a physical-device keyboard test.
- Authenticated exact-line edit/pricing/permission/concurrency is covered by the
  backend integration tests; the new full public browser journey uses a guest.
- No Admin/Inventory/POS/Rider workflow, staff polling, stock, reward reservation,
  payment accounting or delivery enablement policy was changed.
