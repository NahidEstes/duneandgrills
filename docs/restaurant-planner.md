# Restaurant Planner

Open **Admin → Planner** at `/admin/planner`. Access follows the existing
Admin-panel policy: admins and managers. Customer, kitchen, cashier, rider,
inventory and accountant accounts cannot access its APIs or page.

The three screens use the existing dark/amber design and English UI:

- List: Today, Upcoming, Overdue and Completed, with summary cards and Coming up.
- Calendar: month navigation, Today control and a selected-day task panel.
- Add/Edit task: category, date/time, priority, repetition, optional responsible
  person and record reference, checklist and notes.

## Reminder-only isolation

Planner writes only its own `PlannerTask` and `PlannerSeries` collections.
Business models are queried only to identify optional references. References and
responsible-person selections never perform work, send messages, or update the
referenced records. There are no amount/payment/stock fields or financial service
calls. Marking “Pay supplier” Done does not record a supplier payment.

The Planner page uses the existing read-only session endpoint so opening it does
not invoke customer points reconciliation or cart restoration. Existing pages
retain their usual authentication behaviour.

No changes are made to expenses, invoices, payments, refunds, cash, inventory,
orders, rewards, attendance, shifts, payroll, staff permissions, offers or menus.

## Time, counts and recurrence

- Dates and times are interpreted in `Asia/Riyadh`.
- Today counts non-cancelled reminders due on the current Riyadh day, including
  Done reminders. Completed counts all non-deleted Done reminders. Overdue counts
  Pending/In Progress reminders whose due time has passed.
- Reminders refresh every minute while the panel is visible and when it becomes
  visible again. This is an in-app reminder tool; it does not send email, SMS,
  WhatsApp or operating-system notifications while the panel is closed.
- Daily, weekly and monthly schedules generate Planner occurrences independently
  of completion. Reopening prepares missed reminders and at least 62 days ahead.
  Viewing a later month extends that window. Planning supports two years ahead.
- Monthly recurrence retains the original day number: January 31 → February's
  last day → March 31. Future occurrences start with unchecked checklist items.
- “This occurrence” changes one reminder. “This and future reminders” replaces
  pending future occurrences and preserves completed/cancelled history. Changing
  Repeat to Does not repeat with that scope stops the repeating schedule.
- Deleting a reminder removes that occurrence only and prevents it being
  regenerated. Deletion is recorded inside Planner. Task history retains the
  latest 100 events; completed tasks remain stored until explicitly deleted.
- Optimistic revisions prevent stale edits; creation and future-schedule edits
  use request IDs to prevent duplicate saves.

## Deployment

No new dependencies or business-data migration are needed. The two new Planner
collections need their declared indexes. The release-readiness check verifies
their unique indexes. If deployment disables automatic index creation, provision
these additive indexes before using Planner; do not drop or rebuild existing
business indexes. Planner schedule changes require MongoDB transactions, as do
the existing order/inventory flows.

Optional links open the existing permission-protected read-only record summary.
Deleted references remain readable as saved labels and can be cleared or changed.

## Verification

From `backend`, set `MONGOD_BINARY` to an installed MongoDB executable, then run:

```powershell
node --test tests/plannerRules.test.js tests/plannerIntegration.js
```

The integration test owns a temporary replica set and compares every
non-Planner collection before and after the workflows. It never uses the
configured application database.

For browser verification, first build `frontend`, set `RUN_PLANNER_BROWSER=1`
and `PLAYWRIGHT_MODULE` to an available Playwright package directory, and run
`tests/plannerIntegration.js` again. It uses installed Chrome and disposable
frontend/backend servers. It checks desktop/mobile views, typing, failed saves,
checklists, status changes, calendar navigation, deletion, read-only session
verification and unchanged business data. Screenshots go to the OS temporary
directory under `dg-planner-review`, or `PLANNER_ARTIFACT_DIR` when provided.
