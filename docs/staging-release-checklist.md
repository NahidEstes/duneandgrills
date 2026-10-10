# Combined Phase B — staging release checklist

Prepared 2026-10-10. This report covers local working-tree changes on top of the completed Phase 1/2/Combined Phase A. **No commit, push, deployment, production-domain change or production credential change was performed.** Review the complete existing working tree before an operator deploys a compatible frontend/backend pair.

## Release status and evidence

| Check | Result |
| --- | --- |
| Starting selected frontend/backend unit baseline | 102 / 75 passed; no observed starting failure |
| Final frontend unit tests | 121 passed, zero failed |
| Final backend unit tests | 83 passed, zero failed |
| Owned backend integration/regression suites | 122 passed, zero failed |
| Legacy Auth/security, CRM, delivery importer, customization, POS scripts | All five passed, using an explicitly owned temporary MongoDB URI |
| Focused reorder logging regression | 5 passed; only raw-error logging changed, no reorder calculations changed |
| Frontend lint | Passed, zero errors/warnings |
| Frontend production build | Passed, Next 16.4.0 / Node 24; original path routes retained |
| Real production-browser + real isolated API acceptance | 5 passed, zero failed: route protection, customer → Kitchen → completion → actual COD collection → points/report, POS queue/receipt, manifests/icons/CSP/private cache/offline/Kitchen reconnect |
| Existing customer/POS/Admin browser regressions | All three passed at both configured sizes: customer 390/1440px, POS 768/1440px, Admin reporting 390/1440px |
| Axe WCAG A/AA/2.1 AA and responsive checks | Eight acceptance screens, zero violations; no uncaught client errors or script-CSP violations; no document overflow |
| Client credential/config exposure scan | Zero server signing/proxy/database/backend-config keys in static chunks; zero secret-like public environment keys |
| Preservation / whitespace | No starting file removed; prior phase documents/engine/recipe source retained; `git diff --check` passed |
| Production dependency audit | Frontend: 0; backend: 0 |
| Full dependency audit | Backend: 0; frontend: 7 high build/development-tool advisories, described below |

Reproducible logs are outside the repository at `%TEMP%/dg-pwa-phase-b-20261010/`. Browser screenshots, `accessibility.json` and `performance.json` are at `%TEMP%/dg-pwa-phase-b-browser/`. These are local evidence, not proof of the deployed staging revision. Tests start/stop their own loopback servers, create their own replica-set DB and remove their own temporary data. They never seed/drop the configured application DB.

Failures discovered during this phase were separated from the passing baseline: an initially too-tight public-order rate budget rejected legitimate integration bursts (corrected to 60/minute); append-only audit protection blocked a test's fixture teardown (teardown now bypasses hooks only in its asserted owned DB); a legacy API mock lacked the new connectivity import; logged-in checkout fixtures tried to fill read-only account fields; Kitchen selectors missed the displayed `#` prefix; receipt load handlers were cleared by implicit document opening; install-registration failure notices obstructed a modal; and axe found account/filter accessible names and muted-text contrast. Actual application defects were fixed; fixture changes preserve the existing behavioral assertions. Final reruns, rather than an intermediate failing run, define the result.

The build still reports React 18 deprecation for a future Next 17 upgrade. React 18 remains supported by this installed release and current acceptance checks pass. Plan a tested React 19 migration separately.

Visual screenshot review additionally found the mobile Admin order number wrapping one character at a time. Only the order table received a readable minimum width inside a keyboard-accessible horizontal-scroll region; a browser assertion verifies legibility. Shared select/date components received accessible names/placeholder contrast only. No recipe, inventory, expense or attendance calculation/workflow was rewritten.

Performance review: the current build has 56 static JavaScript chunks totaling 2,285,780 uncompressed bytes across **all** routes, not one page's initial payload. Branded icons are 7.7–37.6KB. Selected loopback navigation TTFB ranged 43–549ms and DOMContentLoaded 67–762ms in the owned browser run; repeated viewports reuse a navigation and some script transfers are zero because they are cached. Do not interpret these as Internet/load benchmarks. Dynamic nonce rendering has an explicit SSR cost; hashed static assets/public catalog are bounded/cacheable while private/financial data stays network-only. Establish real staging network/cold-start/concurrency budgets before production.

## External configuration — never put real values in Git

| Project / variable | Staging requirement | Production separation |
| --- | --- | --- |
| Frontend Root Directory | `frontend`, Next.js framework, Node 24 | Separate approved project/environment settings |
| `BACKEND_API_URL` | Approved staging backend HTTPS URL, including `/api`; server-only | Production backend URL only in the future production environment |
| `SITE_URL` | `https://duneandgrills-testing-six.vercel.app` | Approved future `https://duneandgrills.com` origin only after domain approval |
| `SITE_ENV` | `staging` (noindex, disallow-all robots) | `production` only when public indexing is approved |
| `API_PROXY_SECRET` | Same independent random 32+ character secret on both projects; required operationally for per-browser IP limits through the proxy | Different production secret; never `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_ORDER_STATUS_POLL_SECONDS` | Existing customer polling configuration, e.g. `10` | No credentials in this public value |
| `PWA_CACHE_VERSION` | Normally leave unset; every build gets a fresh compiled ID | If overridden, it must be unique for every release/rollback |
| Backend Root Directory | `backend`, Express framework, Node 24, `NODE_ENV=production` | Separate environment and DB |
| `MONGO_URI` | Isolated staging Atlas/replica-set connection and least-privilege DB user; permit hosting network connectivity | Separate production DB/account/backups; no staging writes to production |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Independent random 32+ character secret; existing expiry default `7d` | Separate production signing secret; rotate with a session-revocation plan |
| `CLIENT_ORIGINS` | Exact staging frontend HTTPS origin(s), comma-separated without trailing slash | Explicit approved production origins; no wildcard/automatic arbitrary-preview allowance |
| `COOKIE_SAME_SITE` | `lax` with the same-origin frontend proxy; production cookies are Secure/HttpOnly | Reassess only for a genuinely cross-site client; CSRF must remain enabled |
| `TRUST_PROXY_HOPS` | `0` on Vercel; protected platform headers/shared proxy secret supply verified identity | Non-Vercel ingress requires an explicitly audited hop count |
| `ALLOW_NON_TRANSACTIONAL_INVENTORY` | `false`; production startup rejects `true` | Never enable as an outage workaround |

Examples are in `frontend/.env.example` and `backend/.env.example`. Actual `.env.*` and `.vercel` state are ignored. Server target/signing/proxy/database values must never receive a `NEXT_PUBLIC_` prefix. Vercel may provide `VERCEL_URL` and `VERCEL_DEPLOYMENT_ID`; do not pin the worker to a reused version. Preview domains that need authenticated browser access must be individually added to approved backend origins; a fixed staging alias remains simpler for smoke testing.

## Operator deployment steps

1. Review all uncommitted Phase A and Phase B changes together. Do not discard the pre-existing work or deploy only the PWA frontend against an older backend. Preserve the existing request-fence, inventory, coupon, points, refund and audit records.
2. Configure two staging projects/root directories and their environment values above. Use the supplied `frontend/vercel.json` / `backend/vercel.json`. Keep the application's default Next route handling: **do not add an SPA rewrite to `/index.html`**. `/pos`, `/kitchen`, `/admin` are real App Router routes; direct visits/refreshes are exercised locally. Express uses the existing default `server.js` export and Vercel adapter. See [Vercel Express deployment](https://vercel.com/docs/frameworks/backend/express).
3. Rehearse required schema/index rollout on a copy/isolated staging DB first. Confirm the model-defined unique indexes on order numbers/idempotency, cash movements, refunds and open shifts; the persistent request-fence `_id`; and rate-bucket TTL. `/api/readiness` reads actual indexes and checks transaction support. It does not repair/drop/synchronize indexes. Resolve duplicate historical records and index rollout deliberately; do not run destructive blanket `syncIndexes()` against existing data.
4. The operator deploys the approved compatible backend/frontend pair to **staging only**, with a 60-second function budget for the existing bounded 45-second SSE stream. Confirm the hosting plan permits the configured duration/streaming. Polling remains the operational fallback; it is not dependent on durable serverless process state.
5. Check `/api/health` (process liveness) and `/api/readiness` (transactions + indexes). A 200 health response alone is not readiness. Validate proxy/client-IP identity, cookies, CSRF, exact CORS origins and request/retry headers through the frontend alias. Confirm staff direct routes redirect/verify session instead of returning a 404 or granting access from cookie presence.
6. Run `manual-smoke-tests.md`, including the full customer/POS → Kitchen → completion/payment → points → Admin report flow, refunds, offline/reconnect, safe update activation and device installs. Capture the deployed revision and expected/actual results. Only then consider future production-domain/credential/indexing changes through a separate explicit release approval.

## Current remote snapshot (read-only)

Unauthenticated GET checks on the existing testing alias returned 200 for `/`, `/pos`, `/kitchen`, `/admin`, `/api/health` and `/api/readiness`, but all three new manifests returned **404**, and page CSP was absent. This is the older deployed revision, not this local Phase B code. The route 200s do not certify staff authentication; the deployed readiness response does not certify the new index checks. No remote account/order/payment/update was created. The web-reading tool could not open the testing alias; an ordinary bounded HTTPS GET probe supplied the status/header evidence at `remote-readonly.json`.

## Security findings and production gates

- Production Next/Axios and backend dependency advisories found at baseline were patched. Installed Next is 16.4.0, Axios 1.20.0; backend compatible patches are locked. Node's native watch replaces vulnerable nodemon development dependencies.
- Full frontend audit still reports seven high entries from one [braces stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), propagated through Tailwind 3/chokidar/micromatch/fast-glob/Next ESLint. The current compatible braces release is affected; npm's suggested force fixes entail an unrelated Tailwind 4 migration and a Next ESLint downgrade. Runtime audit is zero. Build/lint must accept only trusted source/config/pattern inputs; isolate untrusted PR CI from credentials. Production sign-off needs a reviewed risk decision or a compatible upstream fix/tested toolchain migration. Do not claim the full frontend audit is clean.
- Script CSP is nonce-based with no production `unsafe-inline`/`unsafe-eval`; inline **styles** remain for existing charts/print reports. Rendering is dynamic as a result. No private HTML/API/RSC is persisted by the worker; public menu fallback expires and is visibly stale. Browser static chunks are inspected for server config/secret key exposure.
- API/model audit hooks are append-only, but database owners can bypass them. Least-privilege DB users, retention, backup/restore, log access and monitoring are external operational gates. Raw API errors/credential-bearing query strings are not logged; the one existing reorder error logger also now omits its raw message without changing inventory/reorder behavior.
- All financial writes remain network-only, server-authoritative and idempotent. COD/manual card-terminal records are not gateway-confirmed transactions. Online payment remains deliberately unavailable until a provider, credentials, verified webhook signatures, settlement/reconciliation/refund rules and integration tests are supplied.

## Remaining external prerequisites / limitations

Required before rollout: Vercel project access/environment setup, the approved backend hostname, isolated replica-set DB credentials/network/index readiness, independent JWT/proxy secrets, deployed same-origin cookie/CORS verification, hosting streaming/concurrency rehearsal, and backup/restore/monitoring sign-off. No production secret is generated or saved in the repo.

Device gates: Android/iOS install/standalone behavior, physical POS/Kitchen kiosk touch/display/orientation, thermal-printer layout/driver, accessibility states beyond the sampled axe screens, and real network/performance/load behavior. Local screenshots/axe are responsive evidence, not physical-device certification or a penetration test. The existing customer-display transport pairs tabs in one browser session; cross-device pairing needs a separate authenticated transport. Background push is not enabled or promised; it requires push credentials/subscriptions/fanout as a later optional integration. Online gateway and background push are not prerequisites for the tested COD/manual-payment/foreground-alert staging flow.

## Re-run locally

Use Node 24, installed dependencies and a local MongoDB binary available to `tests/helpers/isolatedMongo.js`. Build the frontend first. Set `PLAYWRIGHT_MODULE` to an installed Playwright package directory and install its Chrome browser/channel; axe is a frontend dev dependency.

```powershell
# In frontend
$suiteFiles = @(Get-ChildItem tests -File | Where-Object { $_.Name -match '\.test\.(js|mjs)$' } | ForEach-Object { $_.FullName })
node --test @suiteFiles
npm run lint
npm run build
node tests/runFunctionalBrowserRegressions.mjs
npm audit --omit=dev
npm audit

# In backend
$suiteFiles = @(Get-ChildItem tests -File | Where-Object { $_.Name -match '\.test\.js$' } | ForEach-Object { $_.FullName })
node --test @suiteFiles
node --test --test-concurrency=2 tests/stagingSecurityIntegration.js tests/orderEngineIntegration.js tests/posPhase2Integration.js tests/launchReadinessIntegration.js tests/adminOperationsIntegration.js tests/adminReportingAccuracyIntegration.js tests/dashboardPeriodsIntegration.js tests/dashboardPerformanceIntegration.js tests/adminInventoryHealthIntegration.js tests/recentOrdersIntegration.js
npm run test:staging-browser
npm audit
```

Legacy standalone scripts require an **explicit owned `MONGO_TEST_URI`**, rather than the application URI. The local runner used for all five is recorded outside the repository; their existing test bodies remain intact. Database mutation tests must never target the configured staging/production DB.

## Phase B changed files

Comparison with the starting fingerprints: 85 starting changed files; 73 byte-identical; 12 extended in place for this scope; 0 removed. This phase changed or added 92 files, listed below. Original Phase 1/2/Combined A documents and the canonical engine/recipe workflows are retained.

- `backend/.env.example`
- `backend/.gitignore`
- `backend/config/environment.js`
- `backend/controllers/authController.js`
- `backend/middleware/auth.js`
- `backend/middleware/security.js`
- `backend/models/AuditLog.js`
- `backend/package-lock.json`
- `backend/package.json`
- `backend/routes/authRoutes.js`
- `backend/routes/offerRoutes.js`
- `backend/routes/orderRoutes.js`
- `backend/server.js`
- `backend/services/auditLogService.js`
- `backend/services/posSessionService.js`
- `backend/services/releaseReadinessService.js`
- `backend/services/reorderService.js`
- `backend/tests/adminReportingAccuracyIntegration.js`
- `backend/tests/stagingBrowserIntegration.js`
- `backend/tests/stagingSecurity.test.js`
- `backend/tests/stagingSecurityIntegration.js`
- `backend/utils/httpCookies.js`
- `backend/vercel.json`
- `docs/manual-smoke-tests.md`
- `docs/pwa-architecture.md`
- `docs/staging-release-checklist.md`
- `frontend/.env.example`
- `frontend/.gitignore`
- `frontend/app/actions/revalidate-content.js`
- `frontend/app/admin/layout.jsx`
- `frontend/app/api/[...path]/route.js`
- `frontend/app/blog/[slug]/page.jsx`
- `frontend/app/blog/page.jsx`
- `frontend/app/kitchen/layout.jsx`
- `frontend/app/kitchen/manifest.webmanifest/route.js`
- `frontend/app/layout.jsx`
- `frontend/app/manifest.js`
- `frontend/app/menu/page.jsx`
- `frontend/app/page.jsx`
- `frontend/app/pos/layout.jsx`
- `frontend/app/pos/manifest.webmanifest/route.js`
- `frontend/app/providers.jsx`
- `frontend/app/robots.js`
- `frontend/app/sitemap.js`
- `frontend/app/sw.js/route.js`
- `frontend/next.config.mjs`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/proxy.js`
- `frontend/public/offline.html`
- `frontend/public/pwa/apple-180.png`
- `frontend/public/pwa/icon-192.png`
- `frontend/public/pwa/icon-512.png`
- `frontend/public/pwa/maskable-512.png`
- `frontend/public/pwa/offline.css`
- `frontend/public/pwa/offline.js`
- `frontend/scripts/build.mjs`
- `frontend/src/api/api.js`
- `frontend/src/components/admin/AdminShell.jsx`
- `frontend/src/components/admin/DashboardDataStatus.jsx`
- `frontend/src/components/admin/finance/financeExports.js`
- `frontend/src/components/admin/pos/PosProductGrid.jsx`
- `frontend/src/components/AuthPage.jsx`
- `frontend/src/components/Footer.jsx`
- `frontend/src/components/JsonLd.jsx`
- `frontend/src/components/kitchen/KitchenDisplay.jsx`
- `frontend/src/components/kitchen/useKitchenAlerts.js`
- `frontend/src/components/kitchen/useKitchenQueue.js`
- `frontend/src/components/Navbar.jsx`
- `frontend/src/components/OrdersTab.jsx`
- `frontend/src/components/pos/PosTopBar.jsx`
- `frontend/src/components/ProtectedRoute.jsx`
- `frontend/src/components/pwa/PwaExperience.jsx`
- `frontend/src/components/ui/DarkDatePicker.jsx`
- `frontend/src/components/ui/DarkSelect.jsx`
- `frontend/src/config/site.js`
- `frontend/src/context/AuthContext.jsx`
- `frontend/src/pwa/config.js`
- `frontend/src/pwa/network.js`
- `frontend/src/pwa/workerSource.js`
- `frontend/src/security/policy.js`
- `frontend/src/security/serverSession.js`
- `frontend/src/utils/adminExports.js`
- `frontend/src/utils/persistedSubmission.js`
- `frontend/tests/adminReportingBrowserSmoke.mjs`
- `frontend/tests/dashboardApi.test.mjs`
- `frontend/tests/helpers/fixtureSession.mjs`
- `frontend/tests/orderingInterfacesBrowserSmoke.mjs`
- `frontend/tests/posBrowserSmoke.mjs`
- `frontend/tests/pwaSecurity.test.mjs`
- `frontend/tests/runFunctionalBrowserRegressions.mjs`
- `frontend/vercel.json`
