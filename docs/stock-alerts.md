# Item-specific stock alerts

The existing `/inventory/low-stock-alerts` page now has **Current Alerts** and **Alert Rules** tabs. No new sidebar destination is added. The inventory header bell shows the signed-in recipient's inbox. Inventory readers can read alerts; inventory writers manage rules. Accountants can open this read-only page without gaining inventory-write permission.

## Operator workflow

1. In Alert Rules, select a stock item, enter its usable-stock threshold, select low/zero-stock conditions and recipients, and save. Existing inventory items remain unwatched until a rule is explicitly enabled.
2. Choose Stock check + repeat (15, 30, 60, 120 or 240 minutes), or Daily scheduled check at a Riyadh time. Daily mode sends only at the daily check, without interval reminders.
3. Low means usable quantity is positive and at or below the rule threshold. Zero usable quantity is Out of stock, if enabled. The purchasing reorder level remains a separate setting.
4. Replenish through the normal stock/production workflow. Fresh usable stock above the enabled condition resolves the incident. A later shortage starts another incident. Alerts never create stock, purchases, expenses or payments.
5. Read/dismiss affects only that notification and recipient. Snooze affects only that recipient and incident. It does not stop other recipients or resolve the stock condition.

The inbox displays the latest event per incident, with earlier reminder events retained in the database. Old or resolved events do not inflate unread counts. Expired, damaged, quarantined and unknown-expiry quantities follow the existing stock eligibility rules. Batch history and legacy fallback behaviour are unchanged.

## Deployment configuration (required for automatic delivery)

This implementation does not deploy a scheduler or enable real staff rules. Code completion is not evidence that background delivery is running.

Backend environment variables:

| Variable | Purpose |
| --- | --- |
| `STOCK_ALERT_WORKER_SECRET` | Dedicated random secret of at least 32 characters for the worker endpoint. Never put this in a public frontend variable. |
| `STOCK_ALERT_VAPID_PUBLIC_KEY` | Public key generated once for this deployment's Web Push application. |
| `STOCK_ALERT_VAPID_PRIVATE_KEY` | Matching private key; server-only. |
| `STOCK_ALERT_VAPID_SUBJECT` | Valid contact `mailto:` address or HTTPS URL for VAPID. |
| `CRON_SECRET` | Separate random secret of at least 32 characters, required only for the Vercel Cron adapter. |

From the backend directory, generate private deployment settings once:

```sh
npm run setup:stock-alerts -- --subject https://your-frontend-domain
```

Use the actual frontend origin or a monitored `mailto:` contact. The command writes the ignored `backend/.env.stock-alerts.local` file with a VAPID pair and distinct worker/cron secrets. It prints only the file path, never credentials. Repeating the command reuses an existing complete file without changing keys. An incomplete or invalid file is rejected without being overwritten. Use a separate private file (`--out`) for each environment; do not copy production keys to testing. This command prepares settings; it does not upload them or activate a scheduler.

Before generating or uploading settings, inspect the intended backend's existing Stock Alerts/VAPID/`CRON_SECRET` configuration. Retain existing valid keys and any `CRON_SECRET` already used by other jobs; do not replace them with a newly generated file. Add missing values to the **backend project's** environment settings for the intended deployment. Keep existing database, JWT, proxy and origin settings. No private key or worker/cron secret belongs in frontend variables, source control, command arguments, logs or chat. The public key is supplied to an authenticated browser by the options API; no frontend secret is required. Keep the original private settings securely so redeployments retain existing browser subscriptions.

Run `node data/ensureStockAlertIndexes.js` from the backend directory against the intended environment before release. It adds collections/indexes only. Do not use `syncIndexes`, wipe collections or enable rules as a migration. The release-readiness check verifies the new unique indexes.

Choose one scheduler for the intended backend deployment:

- **Vercel Pro/Enterprise:** `backend/vercel.stock-alerts.json` includes the existing Express deployment settings plus a once-per-minute schedule for **GET** `/api/jobs/stock-alerts/cron`. Vercel automatically sends `Authorization: Bearer <CRON_SECRET>`. Deploy the backend with this configuration (CLI: `vercel --prod --local-config vercel.stock-alerts.json` from the backend directory after linking the correct project), or apply its `crons` entry to the backend's active `vercel.json` before a Git deployment. A deployment made with the ordinary `vercel.json` does not activate this schedule. Vercel Cron runs only on that project's production deployment, including when the project itself is dedicated to a testing site.
- **Other hosting or Vercel Hobby:** configure a trusted external scheduler to **POST** to the backend's `/api/jobs/stock-alerts` once per minute, with `Authorization: Bearer <STOCK_ALERT_WORKER_SECRET>` and no cookies. Keep Vercel's ordinary configuration without a minute-level cron. Hobby supports only daily Vercel jobs and cannot provide the repeat/reminder timing promised by this feature.

The two job routes use separate secrets and reject browser cookies. HEAD probes cannot run the cron job. Do not call the frontend API proxy: the job secret is intentionally not forwarded through ordinary user endpoints. No in-memory interval is used. The opt-in cron file is deliberately not the default while the destination project and hosting plan are unconfirmed.

After migrating, configuring backend environment variables and deploying both backend/frontend, run the selected scheduler once and confirm a successful response. Then wait for at least two actual scheduled invocations: Alert Rules must show a recent healthy worker heartbeat. A manual **Check due rules now** click does not prove the scheduler works. Enable only operator-selected product rules with confirmed thresholds, recipients and timing. Confirm one genuine low-stock incident in the recipient's inbox without altering real inventory for testing. On each recipient's browser, use **Enable device alerts** and grant permission before checking actual background delivery. Test fixtures and push-provider acceptance alone are not proof of a real delivered device notification.

Provider references: [Vercel Cron request method and deployment scope](https://vercel.com/docs/cron-jobs), [authorization](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), and [alternate deployment configuration](https://vercel.com/docs/cli/global-options#local-config).

The worker scans at most 50 due rules per invocation within a 25-second evaluation budget, then dispatches bounded push work within a 40-second total budget. Scale invocation frequency/concurrency to clear due work within the advertised cadence. Atomic claims, database uniqueness and transactional rule fences make overlapping runs safe. Claims expire after a worker crash. Missed intervals are coalesced; downtime does not create a backlog storm.

First alerts are generated at the next successful evaluation, not synchronously with every stock movement. Expected latency is roughly one worker cadence plus delivery/UI refresh. Daily jobs catch up once with a fresh check when the worker resumes after the scheduled time. Resolution checks continue between daily notifications so a recovered incident does not remain active until the next day.

The page reports the latest actual worker heartbeat and warns if automatic checking is unconfirmed, stale, or has rules more than three minutes overdue. The explicit **Check due rules now** action performs bounded evaluation but does not make the automatic scheduler appear configured/running. GET/read endpoints never enqueue notifications. Saving an unchanged configuration preserves its incident and version; it does not reset recipients' snoozes or trigger another first alert.

## Browser push

The bell/inbox is durable and independent of browser notification permission. Background device delivery additionally requires the worker, VAPID configuration, supported browser/service worker and the recipient's explicit Enable device alerts action. Denying permission does not disable in-app alerts.

Subscriptions are bound to an account, session version and opaque HttpOnly device cookie. Logout revokes that device's subscriptions before reporting success. Outbound endpoints are restricted to the supported Chrome/Firefox/Apple/Windows push-service hosts. Keys/endpoints are not returned in list APIs or audits.

The push payload contains only a notification reference. On receipt, the service worker fetches the fresh authorized notification using the current session and displays it only while actionable. It does not cache private responses, expose a previous account's stock, or display stale stock while offline. Notification clicks open the relevant Current Alerts item; existing kitchen notifications still open Kitchen. Offline cache/update behaviour is unchanged.

Push acceptance by a provider is not proof the device displayed or the user read it. External delivery can be retried after ambiguous failures, so an absolute exactly-once guarantee is not claimed. A stable incident tag/topic coalesces device presentation. Recovered, snoozed, disabled, unauthorized or stale-version work is cancelled before sending. Temporary errors retry with bounded backoff; expired subscriptions are disabled.

## Validation

Backend tests: `npm run test:stock-alerts` (requires `mongod`, or `MONGOD_BINARY`, and uses a disposable local replica set). Includes credential generation/reuse, secret-free CLI output, additive migration reruns and both scheduler authentication paths.

Frontend: the stock alert browser fixture exercises the real controllers against isolated stock/users. No production database, real recipient subscriptions or external push delivery is used. Existing PWA security/cache tests must continue to pass.

### Verified locally

- Backend regression selection: 52 passing tests covering stock alerts, inventory health, multi-stage production, preparation updates and production safety. The final targeted deployment-setup/stock-alert run passes all 17 tests, including stable key generation, migration reruns, separate cron/POST authorization and safe HEAD probes.
- Frontend suite: 244 passing tests, including worker push/account changes, PWA caching/security, inventory health/workspace and notification settings.
- Real-controller browser fixture: passed at 1440px, 390px and 320px, including save/edit, notification bell/snooze, URL refresh/back navigation, read-only API/UI, failed-read states and unchanged Expiry Tracking. Mobile light/dark screenshots were inspected.
- Full frontend `npm run lint` passes; `git diff --check` is clean.
- Production-server browser regressions pass for ordering, guest tracking, kitchen handover, profile, POS and admin reporting, including desktop/mobile layouts and financial exports.
- `npm run build` passes with Next.js 16.4.3, completing all 41 page-generation tasks and exiting successfully. The framework and matching ESLint configuration were patched from 16.4.0; `sharp` resolves to 0.35.5. The framework security check remains enabled.
- Frontend `npm audit` reports zero vulnerabilities after also updating the existing transitive dependencies `follow-redirects` to 1.16.1 and `zod` to 4.6.7. React 18 still produces a deprecation warning for the future Next.js 17 upgrade; it does not fail this build.

Browser verification command from the frontend directory: `node tests/stockAlertsBrowser.mjs`, with `MONGOD_BINARY` and optionally `PLAYWRIGHT_MODULE` pointing to installed local test dependencies. Screenshots are saved in `output/stock-alerts-qa` at the workspace root and contain isolated fixture data.

No live rules, push subscriptions, scheduler or production migration were enabled. Actual background device delivery remains dependent on deployment configuration and browser permission.
