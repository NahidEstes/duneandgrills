# Admin Dashboard Phase 5: live attention and POS shifts

## Conditions and definitions

The private, read-only `GET /api/admin/operations-overview` is independent of the
dashboard financial reporting period. It does not scan/create Purchasing Actions,
acknowledge records, approve, pay, close shifts, notify, or change stock.

| Category | Matching records | Destination |
| --- | --- | --- |
| Pending too long | Live `pending` orders with creation time strictly before `now - pendingAttentionMinutes` | `/admin?tab=orders&attention=pending_age` |
| Preparation overdue | Live pending/confirmed/preparing/out-for-delivery orders with a recorded deadline strictly before now | `/admin?tab=orders&attention=preparation_overdue` |
| PO approval | `submitted` purchase orders | `/inventory/purchase-orders?status=submitted` |
| Invoice review | `review_required` supplier invoices | `/inventory/supplier-invoices?status=review_required` |
| Overdue payable | `posted` supplier invoices, positive remaining amount, Riyadh due-day strictly earlier than today | `/inventory/supplier-invoices?status=overdue` |

Historical/manual delivery entries, voids, and terminal orders do not qualify as
live order attention. Ready orders have completed preparation under the existing
preparation rules. Missing deadlines are not invented. Invoice remaining balance
uses total minus recorded paid halala; completed payment reversals update that
balance through the existing service. Due today remains current until Riyadh
midnight. There are no additional finance/reporting changes.

Counts are unique records **within each category**, not quantities. The same order
may have two separate actionable reasons. Lists show at most three records per
category; ties sort by `_id`. Order links fetch the exact authorized order through
the existing details UI. PO/invoice links use status plus readable-ID search.
Financial period and recent-order selections are preserved on order navigation.

`preparation.pendingAttentionMinutes` defaults to **5**, configurable from Admin
Settings → Preparation (integer 1–240). This changes only attention visibility,
not order status, preparation deadlines, or notification timing. Existing stored
settings receive the default in the read-time merge; no backfill is required.

## Shift overview

Uses `pos.shift.manage`; existing Admin/Manager permissions are unchanged.
Open count includes open/closing/reopened shifts with `isOpen: true`. Shows up to
three most recently opened and three most recently closed shifts. All closed-list
records have `isOpen: false` and status `closed`; a reopened shift's prior close
snapshot is never shown as a current count.

Open expected drawer cash is the signed cash ledger, including opening cash,
cash sales/refunds/voids and manual cash in/out/payout/corrections. It is **not**
net cash from sales and does not sum card or aggregator-prepaid order totals.
Ledger totals are batched for the displayed shifts, not loaded per shift.
Missing legacy opening information or a missing positive-opening ledger entry
produces an unavailable value, not invented cash.

Closed expected/counted/difference values are the stored closing snapshot.
An absolute recorded difference above the current configured variance threshold
is labelled approved if a manager approval was recorded, otherwise review
required. Equality is within threshold. This is a review signal, not a new
approval workflow; all actions remain in the existing shift screen. Unknown
differences remain unavailable. Cashier blind-close restrictions are unchanged.

`/pos?shiftHistory=open|closed|all&shift=<Mongo ID>` opens the existing shift
modal/history after the existing POS unlock flow, for an Admin/Manager actor.
History is filtered and paginated (10 per page), and an exact shift is fetched
independently of that history page. No shift is automatically opened or changed.

## Freshness, failure and privacy

- Reuses Phase 2's 60-second summary scheduler, focus/manual refresh, hidden-tab
  pause, in-flight deduplication, bounded backoff, offline recovery and cleanup.
- Relevant existing mutation callbacks refresh operations. Returning from another
  screen loads a fresh snapshot; changing financial period does not refetch it.
- Source failures produce an explicit unavailable category, without a verified
  zero. Whole-request failures retain the prior snapshot with a stale warning.
- Last snapshot time is displayed in Asia/Riyadh. Restricted categories have no
  count or data. Session/access failure hides retained financial rows and stops
  unauthorized retry. No shared response cache is introduced.
- The endpoint, shift details and history use `private, no-store`. No customer
  contacts, staff secrets, payment references or complete documents are returned
  by the operations endpoint.

## Local verification

Use dummy data and an isolated local database, never production. Backend
integration files below own their temporary loopback MongoDB replica sets and
clean up only their own files; they do not use an external database URI.

```powershell
cd backend
node --test tests/adminOperationsIntegration.js tests/dashboardPeriodService.test.js tests/dashboardPeriodsIntegration.js tests/dashboardPerformanceIntegration.js tests/recentOrdersIntegration.js tests/adminInventoryHealthIntegration.js tests/adminReportingAccuracyIntegration.js tests/stockRecipeAccuracyIntegration.js tests/purchasingSafetyIntegration.js tests/restaurantSettingsService.test.js tests/posPhase2Integration.js
```

```powershell
cd frontend
node --test tests/*.test.mjs tests/*.test.js
npm run lint
# Process-only overrides avoid production API calls during build:
$env:BACKEND_API_URL='http://127.0.0.1:59999/api'
$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:59999/api'
npm run build
```

Manual checks in a local dummy-data environment:

1. Log in as Admin/Manager, open `/admin`, change Today/Month. Attention and shifts
   stay independent of the period; test Refresh and offline/stale/recovery.
2. Configure a one-minute pending threshold. Create a live pending order and a
   recorded overdue preparation order. Check counts, exact order links, View All,
   browser back and keyboard links. Historical and completed orders must not flag.
3. Submit a dummy PO and a review-required invoice; resolve them in their existing
   authorized screens. Return/refresh dashboard and verify removal. Test invoice
   due today versus yesterday, partial payment, full payment and reversal.
4. Enable shifts in existing Settings. Open a dummy shift with SAR 100; record
   cash sales, a card sale and cash movements. Compare drawer ledger against the
   dashboard; then close normally and compare the stored counted/difference.
   Follow open/closed history links, unlock with Admin/Manager, paginate history,
   and check the exact selected shift. Test a cashier with blind close enabled.
5. Test mobile widths, long IDs/names, Tab/Enter/Escape, and simulated category
   API failure. Unavailable is never represented as zero or "all clear".

No migration, new environment variable, dependency upgrade or production index
operation is required. Production latency and real-browser visual testing remain
environment-specific; isolated measurements are not a production cost claim.
