# Recipe Instructions — pilot review only

Private route: `/kitchen/recipes`. Existing kitchen capability is required on all APIs.
Admin/Manager may review B01, HB01 (alias S1) and T1 and explicitly save a draft,
review notes and an inventory-recipe mapping. Kitchen sees an honest empty approved
collection. There is **no approval endpoint** or regular-service authorization in this phase.

## Source and verified presets

Owner manual: English Kitchen Recipe Manual v1.3, dated 08 October 2026.
Printed pages match PDF page numbers (29 total).

| Code | Recipe pages | Supporting controls | Presets |
| --- | --- | --- | --- |
| B01 | 6 | 3, 11, 12, 14 | 1 / 10 servings |
| HB01 / S1 | 4, 16 | 3, 11, 15, 19 | 500 g / 1 kg |
| T1 | 5 | 3, 11 | Original batch only; estimated 250–300 g yield |

No HB02/HB03 substitution, arbitrary scaling, measured yield, approved photo or
recipe approval was invented. Timings/temperatures/process remain per source and
per-serving instructions. Source safety guidance requires owner/local authority
review, not certification by this software. Kitchen Guides is a supported category
with no imported guides in this pilot. No financial trial fields are imported.

## Persistence and limits

Source preview is backend-only bundled data; GET never seeds anything. The first
explicit **Save pilot draft to database** action copies just that pilot to a new
RecipeInstruction collection. Stable codes are separate from all inventory IDs.
S1 always resolves to HB01. Saves use a transaction, audit log, unique code and
revision conflict check. Formula/source editing and approval/version history are
deliberately not part of this phase. No migrations, seeds or environment variables
are required for preview. Draft saves require existing MongoDB transaction support.
No stock, costing, order, payment or historical snapshots are changed.

Inventory links use existing InventoryRecipe `_id`, with explicit selection and
bounded name search. A link is documentation only, not ingredient matching or a
replacement for the authoritative inventory recipe. Inactive and Do Not Track
options are labeled. No existing records are auto-linked.

## Manual and photos — owner prerequisites

No trusted private document/upload storage exists in this repository. View and
Download therefore show **unavailable**, not a public/developer-filesystem link.
Before enabling them, the owner must choose an authenticated private storage
adapter, upload the manual privately, and define kitchen access/redaction policy:
the full manual includes financial trial pages which must not reach ordinary
kitchen views. No production storage/configuration action was taken.
Owner-provided trial/plating photos are missing; neutral placeholders are shown.
No image upload capability or generated approved photo is claimed.

## Verification / owner walkthrough

1. Login as Admin/Manager; open Kitchen → Recipe Instructions.
2. Search B01, S1 or T1; filter categories. Follow sauce/onion links and Return to B01.
3. Compare B01 1/10 and HB01 500 g/1 kg ingredient quantities; process instructions
   stay unchanged. T1 has no unsupported extra preset.
4. Check warnings on every tab. Print preview contains all recipe sections and
   warnings, including an unapproved-service label on every printed page, but no
   management form, navigation or unsupported manual buttons.
5. Expand Manage pilot draft; search/select the exact inventory recipe, add notes,
   save only in your approved environment. Reopen to confirm persistence. Two
   editors on one revision must produce a reload conflict instead of a lost edit.
6. Kitchen login must see no unapproved pilot. Customer/cashier cannot use the route/API.
7. Check tablet/mobile, keyboard focus and browser Back/Forward.

Print page-margin warning labels are verified in Chromium. Browsers without CSS
page-margin box support may omit the repeated footer; the recipe's main trial
warning still prints. Verify print preview before use and prefer Chromium for
multi-page trial cards. No actual printer or Safari/Firefox/device lab was tested.

Targeted backend: `cd backend; node --test tests/recipeInstructionsIntegration.js`
(helper starts its own disposable replica set, no dotenv/production database).
Frontend unit: `cd frontend; node --test tests/recipeInstructions.test.js`.
Browser smoke: `node tests/recipeInstructionsBrowserSmoke.mjs` against a local
frontend, with API requests intercepted and dummy fixtures only. Requires existing
Playwright runtime via PLAYWRIGHT_MODULE; no dependency installation needed.

Later phases: owner trials/photos/safety decisions, approval and full version
workflow (Phase 3). Full manual import, production/prepared-batch tracking or
other Phase 4 scope needs separate requirements and authorization.

## Changed file map and verified results

Backend: `data/recipeInstructionPilot.js`, `models/RecipeInstruction.js`,
`services/recipeInstructionService.js`, `controllers/recipeInstructionController.js`,
`routes/kitchenRoutes.js`, `tests/recipeInstructionsIntegration.js`.

Frontend: `app/kitchen/recipes/page.jsx`, `src/api/recipeInstructionsApi.js`,
`src/components/kitchen/recipes/RecipeInstructions.jsx`, `RecipeContents.jsx`,
`RecipeDraftManager.jsx`, `recipePresentation.js`, `recipeInstructions.css`,
`src/components/admin/AdminShell.jsx`, `src/components/kitchen/KitchenDisplay.jsx`,
`tests/recipeInstructions.test.js`, `tests/recipeInstructionsBrowserSmoke.mjs`.
Documentation: this file.

Verified locally with disposable data / mocked browser APIs:

- Recipe integration: 14 passed, 0 failed (including wrapper test).
- Existing Kitchen/security/stock/purchasing/POS Phase 2 regressions: 65 passed,
  0 failed. No configured production database was used.
- Frontend unit suite: 97 passed, 0 failed; targeted recipe unit tests: 3 passed.
- ESLint: no errors/warnings; Next production build succeeded, 24 static pages,
  including `/kitchen/recipes`; build TypeScript step succeeded.
- Chromium browser smoke passed at 1536×1024, 820×1180 and 390×844: navigation,
  filters, quantities, draft save/conflict, access states, errors/retry, keyboard,
  responsive overflow and print section visibility. Screenshots visually reviewed.
- Three-page A4 B01 print rendered and visually reviewed. Every page contains the
  unapproved-service margin footer, with no overlap or trailing blank page.
- Source PDF pilot pages 4, 5, 6, 16 plus storage controls 11 and 19 rendered and
  visually checked against extracted text. Other relevant source pages read as text.
- `git diff --check` succeeded; only normal repository CRLF notices appeared.

No commit, push, deploy, seed, migration or production data/configuration operation
was performed. Manual storage and owner trial/plating photos remain prerequisites,
not simulated capabilities.
