# Customer web: tracking, Arabic/English and account email

## Tracking

`GET /api/orders/track/:orderNumber` continues to require the private
`X-Order-Tracking-Token` header. Never put this token in query parameters,
analytics, screenshots of real orders, error reporting or request logs.
The existing per-tab tracking storage is retained; API responses are private/no-store.

The old shared limit (30 requests / 15 minutes) conflicted with 10-second polling.
Budgets now distinguish proven capabilities from failed guesses:

| Budget | Limit | Key |
| --- | --- | --- |
| Lookup ingress | 120 / minute | Verified client IP |
| Invalid order/token | 30 / 15 minutes | Verified client IP |
| Valid order/token | 12 / minute | SHA-256 of IP + order number + token |

This supports ordinary polling without giving invalid guesses the same increased
budget. A valid capability still has an anti-flood limit. The outer ingress
budget can affect a heavily shared/abusive IP; it deliberately bounds lookup cost.
Production uses the existing MongoDB rate-limit buckets and authenticated proxy
IP handling. Persistence errors fail closed instead of returning unmetered data.

The browser honors both Retry-After seconds and HTTP-date headers, including
manual, focus, visibility and online events. Network/server failures use
exponential automatic retry (15 seconds to 5 minutes). The last successful data
and its Riyadh time remain visible with a stale notice. Polling pauses when the
page is hidden or tracking is collapsed and stops at delivered, cancelled,
failed, completed or refunded status. No estimated status is invented.

## Language and compatibility

Customer pages expose an Arabic/English switch. `dg.language.v1` in localStorage
persists the choice; unavailable storage falls back to the current visit.
The locale store rerenders existing components without keying/remounting forms,
cart or authentication providers. Arabic uses RTL, English LTR. Identifiers,
phone numbers and email addresses retain readable direction.

`frontend/src/i18n/ar.js` adapts the existing customer mobile dictionary;
`webArabic.js` adds website copy. Mobile source is unchanged. Catalog fallback is:
selected `translations.ar/en` field, then `translations.en`, then original field.
No external translation service is called. Missing catalog translations are
shown in their available language. Customer-entered names, notes and addresses
are preserved. Historical orders use stored translations when present; newly
created order lines snapshot server-owned product translations. Older order
snapshots remain readable without a data rewrite.

Prices use SAR; customer dates use the Gregorian calendar and Asia/Riyadh.
Restaurant opening times are localized without changing configured opening hours.
Staff paths (admin, POS, kitchen, inventory, rider, staff clock and recipe manual)
retain English/LTR and the existing shared currency behavior. Language choice is
not part of cart identity, order payload identity or payment calculations.

## Account email configuration — required before activation

No real provider credentials or production settings were changed. No email was
sent, cron enabled or live migration run during implementation.

Set these **backend-only** environment variables; never prefix them NEXT_PUBLIC:

| Variable | Required value/purpose |
| --- | --- |
| CUSTOMER_EMAIL_PROVIDER | `resend` |
| RESEND_API_KEY | Resend API credential authorized for the sending domain |
| CUSTOMER_EMAIL_FROM | Sender address on a verified domain (optionally `Name <address>`) |
| CUSTOMER_WEB_ORIGIN | Trusted customer web origin, HTTPS in production, no path/query/hash |
| CUSTOMER_EMAIL_TOKEN_SECRET | Separate stable random secret, at least 32 characters |
| CUSTOMER_EMAIL_WORKER_SECRET | Separate stable random worker credential, at least 32 characters |

Generate both secrets using a cryptographically secure generator. Keep them
separate from JWT/proxy secrets and each other. Local HTTP origins are accepted
only for localhost/127.0.0.1 outside production. Links are never based on a request
Host header. Retain existing JWT, MongoDB, origin and API proxy configuration.

Configure a trusted external scheduler to call the **backend**:

`GET /api/auth/email-jobs` with `Authorization: Bearer <CUSTOMER_EMAIL_WORKER_SECRET>`.

A one-minute cadence is suitable for the current small batch (up to three jobs
per invocation). This repository does **not** enable a scheduler or change
Vercel production configuration. Monitor aggregate worker responses and queue
states; provision capacity for actual signup/reset volume. Without the worker,
requests can be queued but emails will not be sent. Global availability checks
configuration presence, not actual provider credentials/domain health.

The request endpoint honestly acknowledges a queued request, never delivered
email. The worker records `accepted` only after an HTTP success with a provider
message ID; provider acceptance does not guarantee inbox delivery. Leases,
bounded exponential retries (five attempts) and stable provider idempotency keys
protect uncertain sends. Failed jobs require configuration/provider diagnosis
and a fresh link request. Unknown, inactive, staff or already-verified accounts
produce the same request acknowledgement but no eligible send job.

The outbox stores user ID, hashed email, language, kind and timestamps, without
plaintext capability or provider payload. A dedicated HMAC secret derives a
256-bit per-job capability for reproducible provider retries; only SHA-256 of
that capability is stored on the user. Rotating that secret prevents pending
jobs from matching; request fresh links. Already-sent links remain valid against
their stored hashes until use/expiry/replacement. Do not rotate JWT secrets as an
email configuration workaround.

References: [Resend send API](https://resend.com/docs/api-reference/emails/send-email),
[OWASP password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Lifecycle and legacy account policy

Pages: `/forgot-password`, `/reset-password`, `/verification-pending`,
`/resend-verification`, `/verify-email`. Request/consume endpoints use the same
names under `/api/auth`. `/api/auth/email-availability` exposes only a global
configured boolean. All account email/action responses use private/no-store.

Reset links expire in 30 minutes; verification links in 24 hours. Links carry
the token in a fragment, which is removed immediately by the page and never
sent to the server/referrer. GET never consumes a token; explicit POST and user
confirmation are required. The database atomically matches customer role,
active account, exact hash and expiry, then removes consumed token fields.
Replacement invalidates the previous capability of the same kind.

Successful reset hashes the new password and increments sessionVersion, so old
browser and mobile JWTs are invalid immediately on their next authenticated
request. It clears browser cookies and local customer state and requires sign-in.
It does not automatically verify email or sign the customer in. Verification
does not change role or grant staff access. Public registration ignores incoming
role/verification fields and always creates an unverified customer.

Rate limits: 20 email requests per IP / 15 minutes; shared normalized-email
cooldown of one minute and 3 requests / 15 minutes across reset/resend. The user
record also atomically enforces the one-minute cooldown, including signup email.
Token consume attempts are limited to 30 per IP / 15 minutes. Known/unknown/staff
addresses receive the same generic acknowledgement and cooldown behavior.
Invalid, expired and used tokens share a recovery message and new-link path.
Missing email configuration returns an explicit unavailable state, never “sent”.

**Legacy-safe policy:** absent/false emailVerificationRequired remains optional;
existing customers can continue using their accounts/orders without a live
backfill. New public customers (web or existing mobile registration API) require
verification before creating a new authenticated account order. Sign-in,
profile and cart remain usable. Existing uncertain-order idempotency recovery is
evaluated before this gate. Guest ordering remains available under existing
restaurant rules. Customer email changes invalidate previous capabilities and
require verification of the new address; staff verification is untouched.

Prepare the provider and worker before rolling out new required-verification
signups. Otherwise their account orders will remain blocked with an honest
verification notice. Legacy customers are not silently marked verified.
Schema changes add optional user fields, partial token-hash indexes and an
outbox collection with queue/TTL indexes. Review normal index provisioning in
staging; no live database migration or backfill has been executed here.

## Validation and known limits

From `backend`: `node --test tests/*.test.js`.
From `frontend`: `npm run lint`, `npm run build`, and
`node --test tests/customerLocale.test.mjs tests/refreshController.test.mjs`.

`frontend/tests/customerFeaturesBrowser.mjs` owns loopback fixture and production
Next servers. It tests English/Arabic desktop/mobile pages at 1440, 390 and 320px,
form/cart/session retention, private tracking headers, one-use link UI, provider
unavailable UI, axe checks, Retry-After recovery and terminal polling stop.
Use an installed Playwright or set PLAYWRIGHT_MODULE to its absolute module
directory. Build first; do not rebuild while the browser test is running.
`publicUsabilityBrowser.mjs` checks the existing customer ordering flow separately.

Account security tests use real controllers, schemas, JWT/bcrypt and owned model
stubs; browser tests use explicitly fake accounts/data/provider responses.
Actual MongoDB atomic writes/indexes/TTL and real provider deliverability still
need isolated staging verification with non-customer test inboxes. No local
MongoDB daemon was available, and existing integration scripts that may load
cloud database configuration were deliberately not run.

Historical note: the customer-account task found a Finance PDF assertion expecting
adjacent `Archived · Paid` text. The subsequent reporting task reproduced it and
corrected the test to assert payment/record states semantically, retaining 140.00
recognition checks. The export design was not changed. See
[profit and priority actions](profit-and-priority-actions.md).
