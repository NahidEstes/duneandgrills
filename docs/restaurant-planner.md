# Restaurant Planner

Open **Admin → Planner** at `/admin/planner`. Access follows the existing
Admin-panel policy: admins and managers. Customer, kitchen, cashier, rider,
inventory and accountant accounts cannot access its APIs or page.

The three screens use the existing dark/amber design and English UI:

- List: Today, Upcoming, Overdue, Completed, Cancelled and All Tasks. Summary cards
  open Pending Today, Overdue and Completed Today lists. Rows/cards include the
  responsible person, checklist progress, recurrence, snooze and paused labels.
- Search title, notes, checklist and linked-record labels; combine category,
  priority and responsible-person filters with status/date views. Search is a
  literal bounded string, never a raw regular expression. Lists paginate on the
  server; month/week ranges are capped at 1,000 rows with a truncation notice.
- Calendar: month navigation, Today control and a selected-day task panel. Week
  view provides Sunday–Saturday agenda cards, This week and previous/next controls.
  Switching to a calendar view selects All Tasks; subsequent filters apply to
  that range. Summary cards use all dates relevant to their label and the active
  search/category/person/priority filters; clicking one returns to List view.
- Add/Edit task: essential title/date/time and checklist appear first. More
  options contains category, priority, recurrence, responsible person, linked
  record, notes, status and history. Existing optional values remain available
  when editing. Save/Cancel stay visible while fields scroll.
- Four editable starter templates: Opening Checklist, Closing Checklist, Deep
  Cleaning and Equipment Check. Selecting one replaces the title/category and
  checklist in the unsaved form; it does not create a task. Each item starts
  unchecked. These are built-in presets, not an external template service.
- The separate Planner bell appears in the shared Admin header for admins and
  managers, alongside the existing independent order controls.

## Reminder-only isolation

Planner writes only its own `PlannerTask`, `PlannerSeries` and
`PlannerNotificationState` collections.
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
- Pending Today counts today's Pending/In Progress reminders. Completed Today
  counts reminders whose completion timestamp is today, even if due earlier.
  Overdue counts Pending/In Progress reminders whose original due time passed.
  The Today tab retains non-cancelled tasks due today, including Done. Completed
  retains all historical Done tasks. Cancelled and All Tasks are searchable.
- Reminders refresh every minute while the panel is visible and when it becomes
  visible again. This is an in-app reminder tool; it does not send email, SMS,
  WhatsApp or operating-system notifications while the panel is closed.
- Daily, weekly, monthly, quarterly, yearly and custom schedules generate occurrences independently
  of completion. Reopening prepares missed reminders and at least 62 days ahead.
  Viewing a later month extends that window. Planning supports two years ahead.
- Monthly recurrence retains the original day number: January 31 → February's
  last day → March 31. Quarterly/yearly/custom-month schedules use the same rule.
  A February 29 yearly anchor returns to February 29 in leap years. Custom
  schedules support every 1–52 weeks with selected weekdays, anchored to the
  initial due date's Sunday-based week, or every 1–24 months. A newly scheduled
  weekly custom due date must be one of its selected weekdays; moving a single
  occurrence does not change the repeating pattern. Future occurrences start
  with unchecked checklist items.
- “This occurrence” changes one reminder. “This and future reminders” replaces
  pending future occurrences and preserves completed/cancelled history. Changing
  Repeat to Does not repeat with that scope stops the repeating schedule.
- Deleting a reminder removes that occurrence only and prevents it being
  regenerated. Deletion is recorded inside Planner. Task history retains the
  latest 100 events; completed tasks remain stored until explicitly deleted.
- Optimistic revisions prevent stale edits; creation and future-schedule edits
  use request IDs to prevent duplicate saves.
- Historical occurrences from a replaced schedule remain individually editable.
  They cannot replace future reminders again: use an occurrence from the current
  schedule instead. This prevents overlapping schedules in the same group.
- A failed list refresh explicitly labels retained results as stale and disables
  their actions until a successful retry. Initial failures never claim that no
  tasks exist. Permission failures discard retained list/notification data.
- Leaving a task deep link while its details are loading clears that loading
  state. Failed Pause/Resume requests keep the form and unsaved entries open;
  successful actions retain the existing confirmation about discarding drafts.
- Searching reference options preserves the selected person's/record's label;
  clearing or changing the linked record hides its previous read-only link.

## Snooze, Undo and pausing

- Snooze supports 30 minutes, 1 hour, tomorrow at 09:00 Riyadh, custom date/time
  and Clear snooze. It changes only `snoozedUntil`, not `dueDate`/`dueAt`, status or
  business records. An overdue task stays overdue. Retries use the same request
  ID and do not repeatedly extend a snooze. Only active tasks can be snoozed.
- Complete/Cancel from the task list offers Undo for 15 seconds. Undo restores
  the exact previous status/completion timestamp. Tokens are single-use and
  revision-bound; any intervening edit/progress/snooze/delete invalidates Undo.
  Both the status change and undo stay in history. This does not undo payments
  or any business operation. Form status edits retain the existing save workflow.
- Pause is a schedule state, independent of individual task statuses. It stops
  occurrence generation and all alerts for that series. Previously generated
  tasks remain visible, labelled Schedule paused, and can be reviewed/edited.
  They can still be overdue; pause does not move deadlines or hide unfinished work.
- Resume skips missing dates before the resume time and suppresses earlier
  alerts. It keeps already-generated records and their history. It generates
  future occurrences normally without duplicates or a catch-up notification flood.
  Future schedule edits inherit paused state and alert cutoff; completed and
  cancelled records stay intact. Schedule actions are revision checked and logged.

## In-app notifications

- The bell includes active reminders due within 15 minutes and overdue reminders.
  A snoozed alert appears only when its snooze expires and its original due time
  is within that window. Paused schedules and pre-resume alerts are excluded.
- The badge counts unread actionable alerts. The dropdown shows up to 20, with
  an explicit total and an Open Planner action. Opening an item acknowledges it
  and deep-links to the exact task; Dismiss alert removes only that notification
  cycle. It does not cancel or complete the task. Read/dismiss state is per admin,
  with a unique `(user, task)` index. Due-time/snooze changes define a new cycle;
  unrelated edits and minute refreshes do not generate new notification cycles.
- The bell silently refreshes at most once per minute while visible, on visibility
  return, after Planner actions and when opened. Abortable reads discard stale
  responses. BroadcastChannel informs other open tabs about acknowledgements;
  no task/credential data is persisted in localStorage, and no popup or sound
  repeatedly fires on refresh. Tabs without BroadcastChannel converge by polling.
- No background delivery, browser permission, email, SMS, WhatsApp, OS notification
  or external scheduler is installed. Closing the Admin panel stops its polling.

## Deployment

No new dependencies or business-data migration are needed. Existing Planner tasks
and simple repeat values remain compatible. Added fields have safe defaults; no
business records or historical schedules need rewriting. Planner collections
need their declared indexes, including the new unique
`PlannerNotificationState { user: 1, task: 1 }` index and additive task query indexes
for completion date and responsible person. The release-readiness check verifies
Planner unique indexes. If deployment disables automatic index creation, provision
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
verification and unchanged business data. The extended API checks cover literal
search/combined filters/pagination, completion-day counts, custom recurrence,
snooze retry/conflict behavior, stale/expired Undo, paused pre-generated records,
resume without backfill, and per-admin notification acknowledgements. All
non-Planner collections are compared before/after API and browser flows.
Screenshots go to the OS temporary
directory under `dg-planner-review`, or `PLANNER_ARTIFACT_DIR` when provided.
