# Delivery management redesign

`/admin/deliveries` now separates Active Deliveries, Cash & Settlement and History.
Admin/Manager enter Active by default, across **all time**, including unfinished
previous-day deliveries. Cashier enters Cash & Settlement and may review its
authorized delivered cash reports in History; Active, assignment, rider directory,
rider filters and enrollment are absent from the cashier UI and read requests.

## List and filters

Active has four compact summaries: Rider Needed (unassigned records), Awaiting
Pickup, On the Way and Needs Attention. Counts are server-wide and independent of
the list page/filters. Blocked records remain available for review. Needs Attention
uses a new unique server aggregate over active attention conditions, not their sum.
The matching `needs_attention` filter uses the same predicate. The eight original
alert conditions live in View all alerts; cash-alert clicks open the Cash tab.
A compact delivery-issue link remains visible even when filters hide issue rows,
and also includes issue records whose underlying order requires eligibility review.

The toolbar contains order search, the management rider picker, More Filters and
Apply. More Filters contains the applicable stage, attention/cash, date and sort
options. Chips show only applied non-default constraints, with removal and Clear
filters. Drafts never fetch. Apply/Enter, tabs, summary/alert clicks, chips, reset,
pagination and explicit Refresh do; confirmed writes still revalidate once.
Tab/summary changes clear unrelated filters and reset to page 1. Successful results
remain tied to the last applied query while a new query is loading or fails.

Desktop Active rows contain Order/Customer, separate kitchen/delivery statuses,
Rider, Stage Duration and Action. Mobile uses cards. Duration uses the server
snapshot time and the actual recorded ready/pickup/assignment/issue clock; unknown
or future clocks show Timing unavailable. It does not update on a client timer.
Cash explanations are confined to the Cash workspace and details. Cash and History
default to completion date basis, all time, recently delivered first.

## Drawers and safety

The details drawer prioritizes the relevant assignment, issue resolution, shortage
acknowledgment or cashier receipt workflow. Only applicable reason/terminal inputs
are shown. Customer details, Order Summary and Timeline start collapsed. Closing
and reopening the same selection or refreshing retains draft choices, reasons,
terminal and expanded sections. Native dialogs retain keyboard containment,
Escape, focus return and busy protection. Add existing order opens the original
eligible-order enrollment form in a separate dialog, preserving its lookup draft.

Same-rider assignment and unavailable riders remain blocked. Assignment confirmation
captures the reviewed selection; revision conflicts require explicit refresh/review.
Role/account/mode changes remount private workspace state. Failed refresh retains
the last successful timestamp with a stale warning; authorization denial clears data.
There is no polling, focus refresh, automatic assignment or new sale creation.

Historical customer contact/address, delivery notes and item notes remain hidden.
Rider-reported cash is distinct from payment and must not be collected again.
Acknowledged shortages remain discrepancies. Only the existing authorized cashier
terminal/shift/payment ledger flow confirms a receipt. Mutation authorization,
revision/idempotency, transaction and audit rules are unchanged.

## Read API changes

Management reads accept `workspace=active|cash|history|all`. Omitted workspace keeps
legacy API behavior. Cash/History require delivered records; Active excludes them.
Stage-sort constraints intersect the workspace rather than overriding it. Rider
endpoints do not accept the new workspace filter. Cashier cannot request Active.
Recent/oldest completion and oldest enrollment sorting are supported with stable
ID tie-breakers and missing clocks last. `health.activeAttentionCount` is computed
in the same authorized aggregation as the other summaries.
The Cash workspace uses `health.deliveredCash`, across all authorized completed
records, so active customer balances cannot inflate the cash-report task summaries.
The legacy `health.cash` aggregate is preserved for existing readers. Confirmed
Today also requires a delivered record and its recorded Riyadh confirmation date.
The issue projection
includes its stored `reportedAt` for honest stage timing. No schema, migration,
index, production setting or payment mutation was added.

Frontend and backend read-contract changes should be released together through
the project's normal deployment process. This task does not commit, push, deploy
or change delivery activation.

## Verification

`frontend/tests/deliveryManagementBrowser.mjs` owns loopback HTTP fixtures and a
Next server, and uses the real serializer, query/date/sort and timeline helpers.
Its assignment, enrollment and cash responses are simulated fixture mutations,
not MongoDB or real payment transactions. It checks 320/390/820/1440 px, tabs,
summary/chip filters, explicit reads, pagination, stale failures, drawer focus and
drafts, availability/revision/duplicate protection, separate cash/discrepancy states,
cashier scope and enrollment. Axe WCAG 2A/2AA/2.1AA and layout checks run on tested
views. Screenshots are written to the OS temporary directory.

The existing `backend/tests/riderWorkflowBrowser.mjs --management` and
`backend/tests/deliveryManagementIntegration.js` were updated for the workspaces,
dialogs and unique aggregate. Their disposable replica-set tests require local
`mongod`, which is unavailable on this laptop; **the actual Mongo aggregation,
transaction and ledger integration were not rerun**. No cloud database is used
as a substitute. Physical mobile keyboard/safe-area behavior and production
latency/configuration also remain outside these checks.

Verified on 14 October 2026: 184 frontend unit tests and 95 backend unit tests
passed, together with four existing pure date/timeline/cash cases, frontend lint,
production build, edited backend syntax checks and `git diff --check`. The HTTP
fixture browser suite passed at all four widths above, including every active/cash
summary click, Arrow/Home tab navigation and focus retention after its read,
cashier terminal rejection/recovery, enrollment and the other listed workflows.
Tested axe checks returned no violations. Actual mobile/tablet/desktop screenshots
were inspected. These results do not include the unavailable Mongo integration.
