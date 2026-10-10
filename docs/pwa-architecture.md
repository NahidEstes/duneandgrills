# Combined Phase B — PWA and security architecture

This phase extends Phase 1, Phase 2 and Combined Phase A. Existing order contracts, recipe workflows, inventory accounting, expenses and attendance remain in place. The starting working tree had 85 uncommitted paths; their hashes were recorded outside the repository in `%TEMP%/dg-pwa-phase-b-20261010/starting-changes.json`. No commit, push, reset, checkout, stash, production-domain change or deployment was performed.

## Installed applications

| Application | Manifest | ID / start URL / scope | Display |
| --- | --- | --- | --- |
| Customer | `/manifest.webmanifest` | `/` | standalone |
| Cashier | `/pos/manifest.webmanifest` | `/pos` | standalone + explicit fullscreen control |
| Kitchen | `/kitchen/manifest.webmanifest` | `/kitchen` | standalone + explicit fullscreen control |

Scopes deliberately include their launch URL without a trailing slash: Next's existing routes normalize to `/pos` and `/kitchen`. POS customer display and Kitchen recipes remain inside their respective path prefixes. Distinct manifest IDs allow separate installations on browsers that support multiple applications on one origin. Browser/OS installation policy still varies. Safari uses Share → Add to Home Screen; Chromium's install event is captured only when the browser offers it. No prompt is forced on page load.

The 192px/512px regular, 512px maskable and 180px Apple PNGs are rasterized from the **existing `public/logo2.svg` restaurant mark**, with an opaque amber background and centered safe-zone padding. Actual dimensions and rendering are checked; the old generic favicon is no longer the metadata/install icon. No invented/generated placeholder artwork is used.

## Worker, cache and update lifecycle

`/sw.js` is served as JavaScript with `no-store` and root worker scope. A build wrapper compiles a fresh public build identifier into the worker for every `npm run build`, even when uncommitted builds share a Git SHA. A unique explicit `PWA_CACHE_VERSION` or Vercel deployment ID can override it. The worker registers with `updateViaCache:none`, checks on focus and hourly, waits after installation, and activates on a deliberate user action. Activation removes only older `dg-pwa-*` caches and claims clients.

| Resource | Policy |
| --- | --- |
| Offline fallback, real icons, offline CSS/JS | Pinned static cache |
| Same-origin `/_next/static/*` | Cache first; bounded to 180 additional entries |
| `GET /api/menu`, `/api/categories`, `/api/combos` with only category/type parameters | Network first; only responses explicitly marked `X-DG-Public-Catalog:1`; at most 40 entries; 24-hour expiry |
| HTML, authenticated staff pages and React server payloads | Network only; navigation gets a generic offline fallback if the network fails |
| Authentication, private order/tracking/history, kitchen SSE/queue, coupons, rewards, settings | Network only; never added to Cache Storage |
| POST/PUT/PATCH/DELETE and payment/status operations | Network only; **no Background Sync, mutation queue, automatic financial replay or fake payment** |

Cache keys are reconstructed from public URLs without authorization/cookie headers. Saved catalog responses carry their acquisition timestamp; stale responses have `X-DG-Stale:1`. The fallback can display the saved menu read-only. Prices/availability, delivery minimum/fee, coupon and points calculations are always rechecked by the existing server engine before capture. A successful public menu fetch clears stale-menu state. The customer app warms the public menu once after becoming controlled, including pages that initially received their menu through SSR.

Update UX checks active Axios writes and persisted `dg-submission:*` records in both browser storage areas. An unresolved request blocks activation/reload. Storage-access denial also fails safely. Controller change checks again, so a financial write that starts during activation prevents automatic reload. Other tabs receive a manual reload opportunity after another tab activates the new worker; they are not automatically reloaded. The confirmation instructs staff to save/hold edited drafts first. An update does not silently resend any saved operation. Session/cart/request recovery stays in the existing Phase A mechanisms.

## Reliability and operational surfaces

The app provides offline/reconnecting/stale-menu banners, explicit update/install/permission controls and a printer-hidden app toolbar. Registration failure is explained within app options, without automatically covering checkout dialogs. Kitchen retains SSE invalidations with polling fallback, one mutation per ticket, expected-status conflicts and server timestamps; online events refresh immediately. A server-requested polling fallback retries SSE after 30 seconds, and offline/online events close/reopen the stream. Revoked queue access clears tickets/stops polling instead of retaining an authorized-looking queue. Clock offset uses the midpoint of the request round trip and ignores invalid timestamps. Existing refresh controllers retain data on failure, cancel superseded requests, back off and stop on revoked access. Request creation fences, transactional stock movement, points source keys, refund restoration and payment recording remain the Phase A engine; regression tests exercise their duplicate/concurrency behavior.

Axios has bounded requests, blocks offline mutations and emits connectivity/write state. The Next proxy has a 15-second upstream bound, extended to 60 seconds for the existing 45-second SSE stream. A timeout is an **unknown outcome**, not permission to create a new key. Reconcile the original request. Session restoration preserves saved work during outages; it does not convert a 503 into a logged-out guest. A failed logout remains unconfirmed and provides a recovery screen on protected surfaces.

`/pos/customer-display` remains public but loads no Auth/Cart/Favorites provider and receives only the Phase A public bill allowlist through the paired same-browser channel. It is not a cross-device broadcast service. Browser receipts retain escaped content; printing uses programmatic load handlers compatible with the script CSP. Physical thermal printer scaling remains a device smoke test.

Notification permission is requested only by a button. Denied/unsupported states explain browser settings. Kitchen can emit generic foreground-triggered notifications while its tab is hidden. Existing Admin alerts remain available. This phase does **not** advertise background push delivery: persistent push subscriptions, VAPID/provider credentials and push fanout are a separate integration.

## Security boundary

- Proxy performs cheap cookie-presence redirects; server staff layouts independently verify `/api/auth/session` with a 5-second uncached request. Cookie presence or decoded client claims never grant access. Invalid/revoked sessions redirect to login; unavailable authentication gives a retry screen. Expenses/record-search roles keep their existing allowances. The customer-display and public manifests are deliberate exceptions.
- Client guards and backend capability/ownership checks remain authoritative for UI and APIs respectively. Cookies are HttpOnly/Secure in production, CSRF uses a readable companion token and byte-safe comparison, and JWT authentication restricts the expected HS256 algorithm. Legacy bearer clients remain supported by the API.
- Browser mutations pass a same-origin check in the Next API proxy, then backend cookie CSRF and exact-origin CORS. No wildcard credentialed origin is used.
- Site HTML uses per-request nonce script CSP, `frame-ancestors:none`, `object-src:none`, restricted workers/connect/form targets, nosniff, frame denial, referrer policy, permissions policy and HSTS. Existing chart/print inline **styles** remain allowed; production script policy has neither `unsafe-inline` nor `unsafe-eval`. JSON-LD receives the nonce. Google Maps is the explicit iframe exception.
- Public order creation and coupon validation have 60-request/minute IP budgets, in addition to existing sensitive-operation limits. Retry/reset/request-ID headers survive the proxy. Production buckets are database backed; the TTL index is a release prerequisite. Arbitrary incoming `x-forwarded-for` is not forwarded. Only Vercel's protected client-IP header or the shared server-to-server proxy secret can establish forwarded identity; other hosts default to zero trusted hops.
- Operator/prototype JSON injection is rejected without rewriting customer notes. Production error responses remove `error`/`stack` and genericize server failures. Request logs omit query strings, request bodies, cookies and credentials. Audit snapshots redact sensitive keys at every retained depth; model updates/deletes/replacements/resaves are rejected. Audit storage owners can still bypass application hooks, so database permissions/backups are required operational controls.
- Production backend startup validates required DB/JWT/origins/cookie/fallback configuration. `/health` remains process liveness during DB outage; `/readiness` checks transactions and actual unique/TTL indexes without modifying indexes. Connection attempts are bounded and pools limited. Environment examples contain no real secret; `.env.*` and hosting link metadata are ignored.

Patched production dependencies replace the critical/high advisories found at baseline. Backend development uses Node's native watch instead of a vulnerable nodemon/braces chain. Frontend retains Tailwind 3 for compatibility, with a patched selector-parser override. Remaining build-tool-only braces advisories and full test evidence are recorded in the release checklist; do not force an unrelated Tailwind 4/Next 14 migration via `npm audit fix --force`.

## Deployment/performance decisions

All browser API calls remain relative `/api`; the backend target, site metadata origin and indexing environment are server configuration. Staging is noindex and has a disallow-all robots policy; enabling production indexing is an explicit separate environment change. No production origin is hard-coded in application metadata/JSON-LD/sitemap links.

Nonce CSP deliberately makes page rendering dynamic. Static JS/CSS/font assets remain hashed and cacheable; public catalog caching is bounded and private data never receives offline persistence. Build fonts still use the existing Next Google font pipeline, which requires build-time network access. Browser/device performance and serverless concurrency must be rehearsed on the deployed staging revision; local loopback measurements are not an Internet latency or load guarantee.

Implementation follows the completely read `frontend/AGENTS.md` and local Next 16 PWA, manifest, Proxy, CSP, headers and async request-header guides (reread after the security upgrade to Next 16.4). Primary deployment/reference sources: [manifest scope](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/scope), [Vercel protected request headers](https://vercel.com/docs/headers/request-headers), [Express deployment](https://vercel.com/docs/frameworks/backend/express), [Node 24](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
