# Delivery Rider — saved Admin activation

The owner-authorized operational workflow now runs on ordinary authenticated site
routes, without `?rehearsal=1`, when **Admin → Settings → Delivery Rider → Enable
delivery rider → Save Rider Setting** is enabled. The setting defaults to disabled,
including for existing records lacking the new optional fields. No migration or
new environment variable is required. `RIDER_DELIVERY_ENABLED` is not authoritative;
domains, `NODE_ENV` and client flags cannot activate the normal workflow.

Only Admin may change activation. The existing private settings API exposes
`riderDelivery.enabled` and its revision. Its narrowly scoped PATCH
`/api/settings/rider-delivery` requires staff auth, settings permission, Admin role,
strict boolean/expectedRevision, existing CSRF handling and an atomic audit record.
Ordinary settings saves cannot overwrite this field. Public settings omit it.

## Use

1. Admin provisions an existing Staff account with role Rider. Rider signs in and
   opens `/rider`, setting their own availability to Available.
2. Admin/Manager opens `/admin/deliveries`, looks up the exact existing eligible
   website/phone/POS delivery order and explicitly enrolls it with a reason, then
   assigns an available rider. Takeaway, platform/prepaid aggregator, historical,
   cancelled/voided and inventory-restored orders remain excluded. This does not
   create a new order, dispatch notification or inventory deduction.
3. Assigned rider opens details, picks up only a Ready order, then confirms delivery.
   Only the assigned rider sees private contact/address details. Delivered history
   hides customer contact/name/address. Issue reporting and same-rider resolution
   preserve existing fulfillment/payment rules.
4. Rider reports actually collected cash; it remains unconfirmed. Cashier confirms
   eligible full cash through their own open POS shift/terminal. Existing payment
   ledger, shift movements, idempotency and audit history remain authoritative.
   Partial balances/shortages require existing authorized handling; this update does
   not invent a new financial reconciliation or payment gateway.

Normal lists refresh every 30 seconds while visible, on focus and manually. Reads
are abortable and private/no-store. Actions never queue offline. Server permissions,
rider scopes, revision claims and durable idempotency protect every action.

Disabling blocks availability, enrollment, assignment, pickup, delivery, issue and
cash-confirmation writes, including stale screens/direct API calls. Existing orders,
deliveries, cash reports, payments and stock are never deleted/cancelled/refunded.
Re-enable to resume outstanding deliveries or reconciliation. The setting and every
operational action write the same settings document inside their MongoDB transaction:
an action already serialized before disable may finish first, but no action can
commit against stale enablement after the disable commit. No public/CDN cache.
Transactions require a replica set; standalone fallback is rejected.

Customer checkout delivery options are unchanged. No GPS, automatic assignment,
SMS/OTP, payment gateway, public rider registration or third-party delivery dispatch
is added. Actual deployment and activation remain the owner's responsibility.

## Isolated verification (never production)

`cd backend` then `node --test tests/riderActivationIntegration.js
tests/riderWorkflowIntegration.js tests/riderPortalIntegration.js
tests/riderPortal.test.js tests/restaurantSettingsService.test.js` runs owned
temporary loopback MongoDB fixtures, not `.env` or production server configuration.
With a local `mongod` replica-set-capable binary and the frontend production build,
`node tests/riderWorkflowBrowser.mjs --operational` tests the normal UI including
Admin activation, assignment, pickup, delivery, cash confirmation and disabling.
`PLAYWRIGHT_MODULE` may point to an existing Playwright module directory; no runtime
dependency is added. `--manual --operational` holds the same disposable sandbox open
until Ctrl+C. Existing explicit isolated preview/rehearsal flags remain test-only
and are neither required nor recommended for normal operational activation.
