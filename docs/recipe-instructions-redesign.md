# Recipe Instructions workspace redesign — 16 October 2026

The current UI supersedes the entry defaults and control labels in the historical Phase 1–4 walkthroughs. `/kitchen/recipes` defaults to **Service Recipes** for Kitchen and Admin/Manager. Explicit `?view=trial` and `?view=manage` remain supported, as do `recipe` and exact `revision` query parameters. Kitchen has no management controls; server capability and manager-only mutation rules remain authoritative.

## Reading and management

- Desktop uses application navigation, an independently scrolling searchable library and a spacious reader. Categories display as Dishes, Preparations and Guides; the existing category values and alias matching are retained.
- Mobile separates the library from the selected recipe. All Recipes returns to the library; browser Back/Forward and exact preparation revision links remain available. The kitchen menu includes App options, so it does not float over step buttons.
- Verified presets change explicit ingredient quantities only. No automatic scaling, ingredient regrouping, altered instructions or fabricated empty steps was added. Guides have no production ingredient table or portion selector.
- Start Cooking / Read Steps follows only actual nonempty sections. Previous/Next and View All Steps support focused or complete reading. Checkboxes are local component state only, reset on recipe/revision changes and never write production/trial/stock records.
- Status and historical warnings remain prominent. Storage, allergens, original source warnings and yield notes are accessible together. Source/version/provenance and unavailable private manual information are in a separate disclosure. No media storage or approved plating image is fabricated.
- Printing includes the exact recipe/revision/status, selected quantity preset, all instructions, safety/source/yield guidance and pinned preparation revisions, including content hidden by step mode or closed disclosures. Management controls and local checkboxes do not print.
- Manage Recipes presents lifecycle, next action, service versus working revision, pinned dependencies/update warnings and server readiness. Edit, trial, review and history/restore forms remain explicit, collapsed actions. Current service publication never follows a new working draft or a later preparation publication automatically.

## Readiness API

`GET /api/kitchen/recipes/:code/readiness?revision=N` is private/no-store and Admin/Manager only. It reads without seeding or writing, uses the existing `qualifyingTrial` predicate across the exact revision's trials (not just the displayed page), returns required checklist keys and specific approval/publication blockers, and reuses dependency traversal with write locking disabled for the advisory read. Publication checks the existing frozen pins, not replacement preparations.

Readiness is advisory: the existing write transactions still enforce roles, current revision/workflow version, qualifying evidence, checklist, dependency locks, idempotency and audit writes. No transition validation was relaxed. Missing, failed or mismatched readiness blocks review; refresh retries workflow reads even when the recipe's workflow version has not changed. Existing save/trial/review/retry semantics are retained.

## Verification

No dependency install, cloud database operation, recipe import, real trial/approval/publication, production setting change, commit, push or deployment was performed.

- Frontend unit suite: 186 passed. Backend unit suite: 102 passed, including read-only readiness coverage for measured/estimated yield, dish batch size, missing dependencies, exact frozen pins, historical revisions and manager access.
- ESLint and Next production build pass.
- `frontend/tests/recipeRedesignBrowser.mjs` owns a temporary loopback Next server and isolated session fixture; all browser API requests are intercepted. It checks 1660/820/390/320px reading, library/search/categories, step/all-step modes, guide layout, exact links/Back/Forward, retained-data errors, offline/blocked review, private/empty states, full print and axe WCAG A/AA checks. It then runs the existing instruction, lifecycle and full-manual browser regressions at desktop/tablet/mobile sizes using dummy fixtures only.
- Browser lifecycle regressions cover trial recording, approval/publication (including an uncertain response retried with its original idempotency key), current published versus working draft, exact pins, new-draft restoration, editing/conflict, guide rehearsal and print state. Readiness reload recovery is checked without changing the workflow version. These simulate API writes; they are not a real Mongo transaction rehearsal or restaurant approval.
- Chromium A4 recipe print was generated, rasterized and visually inspected across all three pages: complete instructions, selected preset, safety details and exact status footer are retained. Screen captures were inspected for desktop, mobile library, reading and step mode.
- The existing Mongo lifecycle integration command was attempted but could not start: `spawn mongod ENOENT`. No local MongoDB executable is installed. Cloud MongoDB was not used as a substitute. Transaction/audit integration therefore remains unverified on this laptop.

Run from frontend with an existing Playwright runtime available as `PLAYWRIGHT_MODULE`:

```text
node tests/recipeRedesignBrowser.mjs
```

No real cooking, physical printer, Safari/Firefox print engine, private attachment delivery or production end-to-end session/database was verified. Private manual/photo storage and real exact-revision kitchen/safety review remain owner prerequisites as documented in Phase 3/4.

## Changed file map

- Reader: `frontend/src/components/kitchen/recipes/RecipeInstructions.jsx`, new `RecipeReader.jsx`, `RecipeContents.jsx`, `recipePresentation.js`, `recipeInstructions.css`.
- Management/accessibility: `RecipeWorkflow.jsx`, `RecipeDraftManager.jsx`, `RecipeTrialForm.jsx`, `GuideRehearsalForm.jsx` in the same directory; `frontend/app/providers.jsx` places App options in this page's navigation.
- Readiness contract: `frontend/src/api/recipeInstructionsApi.js`, `backend/services/recipeInstructionWorkflowService.js`, `backend/controllers/recipeInstructionController.js`, `backend/routes/kitchenRoutes.js`.
- Tests: new `backend/tests/recipeReadiness.test.js`, new `frontend/tests/recipeRedesignBrowser.mjs`, and updated recipe instruction/manual unit tests and the three existing recipe browser scripts.
- Documentation: this file. Pre-existing mobile README/APK build changes were left untouched.
