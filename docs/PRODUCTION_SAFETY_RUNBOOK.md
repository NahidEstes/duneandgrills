# Production safety runbook

## Required production configuration

- Use MongoDB Atlas or a replica-set deployment with transactions enabled.
- Set `NODE_ENV=production`; never set `ALLOW_NON_TRANSACTIONAL_INVENTORY=true` in production.
- Set `JWT_SECRET` to a long randomly generated secret stored in the hosting provider's secret manager.
- Set `CLIENT_ORIGINS` to a comma-separated allowlist of exact HTTPS frontend origins.
- For same-site frontend/API subdomains keep `COOKIE_SAME_SITE=lax`. For genuinely cross-site deployment use `none` only over HTTPS after validating the CSRF/origin controls.
- Confirm `/api/readiness` reports `transaction.ready: true` before routing traffic.

## Backup and retention

1. Enable daily automated database backups, plus point-in-time recovery where the provider supports it.
2. Keep daily backups for at least 35 days and monthly backups for 12 months; adjust to the restaurant's legal/accounting retention policy.
3. Encrypt backups and restrict backup/restore credentials to designated operators. Never store database URIs or backup keys in Git.
4. Record the responsible owner, restore RTO/RPO, and an escalation contact in the private operations handbook.

## Restore drill (staging only)

1. Select a recent backup and restore it into an isolated staging database with separate credentials.
2. Point a staging API instance at the restored database; never overwrite production.
3. Verify order counts, newest order number, inventory totals/batches, movement ledger links, users, expenses, and audit logs.
4. Run read-only reconciliation queries and the focused integration suite.
5. Delete the temporary restored database securely after the drill and record timing/results.
6. Perform this drill quarterly and after material schema or provider changes.

## Release and rollback checklist

1. Take/verify a fresh backup and record its restore point.
2. Verify transaction readiness, exact CORS origins, HTTPS cookie behavior, CSRF requests, and login/logout in staging.
3. Verify website, POS and kitchen orders share `DG-YYYYMMDD-NNNN` numbers without changing historical orders.
4. Verify guest tracking requires its secret token and never returns customer PII.
5. Verify deactivated staff sessions are rejected and role permissions are enforced by the API.
6. Smoke-test a stock receipt, sale deduction and inventory count conflict in staging.
7. Roll back the application version if health/readiness or reconciliation fails. Restore data only under the documented incident procedure—never as an automatic deployment step.

