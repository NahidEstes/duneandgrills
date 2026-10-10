# Recipe Instructions Phase 4 — full manual and controlled rehearsal

## Scope and status

Existing `/kitchen/recipes`, private kitchen APIs, immutable revisions, exact trial/approval/publication, restoration and pinned dependencies are reused. The read-only catalog has 22 records: 7 main dishes, 10 preparations, 5 shared guides. GET does not seed. New explicit imports create **Draft**, never approval/publication. Software verification is not operational approval.

All 29 pages of the owner's English manual v1.3 (08 October 2026) were read. Multi-page B02 and CS01 tables/controls were also rendered and visually checked. PDF SHA-256: `b1e6b46424c7a4bbbe4422e391aab064af959662707d1688f2c580daf4ddec2f`. Recipe codes are not inventory SKUs. Internal `GUIDE-*` identifiers identify shared source sections, not invented manual recipe codes.

## Source-to-record verification checklist

Every row below has transcribed source quantities/process/weight-basis reviewed. No row has real kitchen trial, owner approval or operational publication performed by this implementation.

| Record | Source PDF pages | Presets / checks |
|---|---|---|
| B01 Double Beef Cheeseburger | 3,6,11,12,14 | 1/10 servings; raw beef, prepared HB01 and T1; original pilot verified unchanged |
| B02 Crispy Chicken Burger | 3,4,7,8,11,12,13,14 | 1/10; combined assembly, marinade and coating; 448 g marinade/851 g coating allocations, not retention |
| S01 Grilled Chicken Sandwich | 3,4,9,11,12,13,14 | 1/10; decimals incl. 1.82/18.2 g salt; inline marinade, S3 default |
| S02 Beef Cheese Sandwich | 3,4,5,10,11,12,13,14 | 1/10; raw ribeye, inline seasoning, prepared HB01/T2 |
| A01 Dynamite Shrimp | 20,21,22,23,28,29 | 1/10; thawed/drained edible input, dusting distinct from batter, DS01; estimated yield only |
| F01 Classic French Fries | 20,24,28,29 | 1/10; frozen input, 1.5 g salt, purchased ketchup default; optional HB01 is replacement, not extra dip |
| F02 Cheddar Cheese Fries | 20,24,25,26,27,28,29 | 1/10; frozen input, 1 g salt, 60 g warm CS01; no ketchup/extra dip |
| HB01 / S1 Classic House Burger Sauce | 3,4,11,15,16,19 | ONE record/alias; 500 g/1 kg; original pilot unchanged |
| S2 Spicy Chicken Sauce | 3,4,11 | Original source 500 g batch; fixed hot sauce |
| S3 Garlic Herb Sauce | 3,4,11 | Original 500 g; powder, not raw garlic |
| S4 Crunchy Slaw | 3,4,11 | Original 500 g; drained vegetables, same-shift texture |
| T1 Caramelized Onion | 3,5,11 | Original raw-onion preparation; estimated 250–300 g, not measured; pilot unchanged |
| T2 Sauteed Onion and Bell Pepper | 3,5,11 | Original preparation; estimated 450–500 g, not guaranteed |
| HB02 Premium House Burger Sauce | 3,15,17,19 | 500 g/1 kg; optional 25 g variant, never automatic substitution |
| HB03 Secret Signature House Burger Sauce | 3,15,18,19 | 500 g/1 kg; optional 20 g variant, never automatic substitution |
| DS01 Dynamite Sauce | 20,23,28,29 | 500 g/1 kg; cold blend; usable transfer yield unmeasured |
| CS01 Cheddar Cheese Sauce | 20,26,27,28,29 | 500 g/1 kg; combined cooking/holding/cooling/reheat; measured evaporation only, no replacement of lost solids |
| GUIDE-SPECS Ingredient Specifications | 3,15,20 | Shared purchased bases, weights, brands, equipment, product standards |
| GUIDE-PASS Preparation, Assembly and Dispatch | 12,20,22,24,25,28 | Shared pass/delivery checks; full dish cards still required |
| GUIDE-SAFETY Food Safety, Storage and Labeling | 11,14,19,27,28,29 | Source house limits, earliest dates, labels, cooling, no local certification claim |
| GUIDE-ALLERGENS Allergens and Cross-Contact | 11,16,17,18,22,23,25,28 | Supplier labels, dedicated shrimp fryer including filtration, actual cross-contact disclosure |
| GUIDE-TRIAL Trial and Exact-Version Approval Checklist | 1,13,14,29 | Actual cooking trials, delivery/holding measurements, exact review; financial fields omitted from kitchen library |

Cover/table of contents (1–2) establish trial status/navigation. Page 14/29 references remain source assertions, not independently verified endorsements/local law. No internet recipe substitutions. Inline marinades/coatings/seasoning preserve their source headings through ingredient **weight basis**, not invented component codes or duplicated recipes.

## Controlled import

- `backend/data/importRecipeInstructions.js`, command `npm run import:recipe-instructions -- --dry-run` (default).
- Does **not** load `.env`. Explicit `RECIPE_IMPORT_MONGO_URI` and `RECIPE_IMPORT_ACTOR_ID` required. Active existing Admin/Manager actor only.
- This version deliberately rejects remote/production URIs. Only localhost/127.0.0.1 and databases named `dg_recipe_test` or `dg_recipe_rehearsal` (optional lowercase alphanumeric suffix) are accepted.
- Use a separately prepared disposable local replica-set database with dummy authorized user and existing schema indexes. Importer does not create indexes, users, seed/reset a database or start a fake scheduler. Missing unique indexes or non-transactional database must stop the run; request separate setup approval if needed.
- Example PowerShell, after explicitly selecting that disposable database and its dummy Admin ID:

```powershell
$env:RECIPE_IMPORT_MONGO_URI = 'mongodb://127.0.0.1:27018/dg_recipe_rehearsal?replicaSet=YOUR_LOCAL_TEST_REPLICA_SET'
$env:RECIPE_IMPORT_ACTOR_ID = 'EXISTING_DUMMY_ADMIN_OBJECT_ID'
cd 'F:\My Projects\duneandgrills\backend'
npm run import:recipe-instructions -- --dry-run
# Review all reported conflicts BEFORE choosing apply:
npm run import:recipe-instructions -- --apply
```

These example URI/ID values are placeholders; do not point them at restaurant data. No production import was run. No migration or new runtime environment variable is required for the application; these two variables are CLI-only.

Each revision/audit is atomic; the overall import is not an all-library transaction. Reported conflicts leave that recipe untouched while unrelated conflict-free source records may import. If interrupted, rerun: unchanged source is skipped; concurrency/retry keys, unique code/revision indexes and existing optimistic guards prevent duplicate writes. Inventory links and review notes are retained, immutable aliases checked. Approved/published historical content/pins/pointer remain intact.

Provenance on imported immutable revisions: catalog identifier, binary source fingerprint, manual version/date/pages, normalized structured-record hash, import time and authorized actor. Runtime does not read a developer Downloads path. Future source transcription changes must update the reviewed catalog/fingerprint together. No arbitrary external JSON import option is exposed.

Exact matching legacy pilot content is verified/skipped without adding a redundant revision. Legacy mismatches or restaurant-specific edits are conflicts requiring explicit owner comparison; importer never silently substitutes them. Source changes to an untouched import create a new Draft. Owner-specific content changes remain explicit revision history/diffs. For approved/published dishes, linked preparations are exact frozen revision pins; missing/unapproved preparations block approval/publication. Optional variants/default dip choices require a new reviewed dish card, never automatic switches.

## Guide review boundary

Shared guides contain no production ingredients, mass or taste scores. They use the SAME private trial record/approval lifecycle, but a typed `guide_rehearsal`: actual timestamp/observations, source review, actual staff rehearsal and qualified/local safety review. A failed/incomplete rehearsal cannot approve. Admin/Manager must additionally confirm every applicable review check; production quantity/yield fields are explicitly marked not applicable for pure guides, not fabricated. This review does not waive any actual dish/preparation trial requirement.

## Owner-friendly rehearsal (gradual publication only)

1. In a safe rehearsal environment, sign in as Admin/Manager; inspect B02 Draft, p.7–8 quantities, S2 and S4. Compare every input/basis/brand to source. Inspect shared guides and actual equipment/fryer separation.
2. Save necessary restaurant-specific revisions with a reason. Request trial for exact current revisions. Kitchen accesses explicit **Authorized trial view** only; printed Draft/Trial remains clearly unpublished on every page.
3. Perform REAL preparation trials, weigh actual usable yields and waste, log safe product temperatures, brands/process/delivery observations. For main dishes cook ten servings. CS01 additionally actual mass correction, heating/cooling/reheat/holding and 0/30/60/120-minute texture checks. Notes can record these measurements; they are not pre-filled evidence.
4. Record trial outcomes. Estimated/missing yields, unmeasured ingredients, failed safety/quality or an old revision's trial cannot approve. Review supplier allergens, actual storage/labels and qualified local safety applicability.
5. Authorized owner/chef review exact preparations; approve and publish them one at a time. Then review/approve/publish the dish with those exact dependencies. No bulk publication command exists.
6. Kitchen's normal **Published service view** must show only approved/published content; follow preparation buttons to frozen exact revisions, print and check code/revision/status/footer. Manager direct/history links and browser Back/Forward retain exact records.
7. Make a new draft revision with a reason. Confirm Kitchen still reads the previous published version. A new preparation publication shows an update warning, not a silent dish switch; adopting it needs a new dish revision/trial/review.
8. Proceed dish-by-dish. Automated dummy trials are software test fixtures only and never approval for restaurant service.

## Private media and unresolved operational decisions

No private PDF/attachment/photo storage adapter is configured. Authenticated UI honestly disables manual view/download; no PDF copied to public directories. Serving photos are honest placeholders; no generated plating evidence. Configure trusted private storage/access separately before attachment support; never serve Downloads from production. Actual signed/local safety review, food trials, product/supplier labels/brands, fryer capacity/recovery and truly separate shrimp filtration, actual yield/retention/oil pickup, storage validation and delivery performance remain owner/chef responsibilities. No measured yields, shelf lives or assurance of allergen absence are invented.

## Verification commands

```text
backend: node --test tests/recipeInstructionsIntegration.js tests/recipeInstructionWorkflowIntegration.js tests/recipeInstructionImportIntegration.js
backend: node --test tests/kitchenService.test.js tests/productionSafety.test.js tests/stockRecipeAccuracyIntegration.js tests/purchasingSafetyIntegration.js tests/posPhase2Integration.js
frontend: node --test tests/*.test.mjs tests/*.test.js
frontend: npm run lint
frontend: npm run build
frontend: npm run start -- -p 3008
frontend: node tests/recipeInstructionsBrowserSmoke.mjs
frontend: node tests/recipeWorkflowBrowserSmoke.mjs
frontend: node tests/recipeManualBrowserSmoke.mjs
```

Browser scripts require Playwright (or explicit `PLAYWRIGHT_MODULE` pointing to the installed bundled module) and Chrome. Every API request is intercepted with dummy fixtures. Database tests spawn their own temporary local replica set; never run any separate destructive legacy suite against a real database. Browser print/readability checks target Chromium; other print engines/private production storage are not validated by this rehearsal. No inventory/order/stock/purchasing/financial mutation service is called by instruction imports/edits; existing nonempty-stock and transactional regressions verify separation.

## Executed verification — 09 October 2026

| Check | Exact result |
|---|---|
| Recipe instructions + lifecycle + full import backend suites | 41 passed, 0 failed, 0 skipped; exit 0 |
| Kitchen + production safety + stock/recipe + purchasing + POS Phase 2 regressions | 65 passed, 0 failed, 0 skipped; exit 0 |
| Frontend `node --test tests/*.test.mjs tests/*.test.js` | 102 passed, 0 failed, 0 skipped; exit 0 |
| Frontend `npm run lint` | exit 0; no diagnostics |
| Frontend `npm run build` | exit 0; Next 16.3.2 compiled, TypeScript stage passed, 24 static pages generated |
| Three recipe browser scripts | all passed at 1536×1024, 820×1180 and 390×844 (9 suite/viewport combinations); all APIs mocked |
| Import/catalog syntax checks and `git diff --check` | exit 0; only Git's normal LF/CRLF notices |

Import tests additionally reject remote/unsafe CLI databases before connecting, check actual audit-failure rollback/retry, and verify Kitchen does not receive import actor provenance. Concurrency/dry-run/rerun/source-change/owner-conflict behavior was exercised against disposable Mongo replica sets, not application or production data.

Rendered visual QA inspected desktop/tablet/mobile CS01 and guide screens and all 20 pages across seven Chromium-generated A4 PDFs: B02 (3), CS01 (3), guide (2), trial B01 (3), published B01 (3), approved T1 (3), revised Draft T1 (3). Text/ingredient rows remained readable with repeated table headers; exact code/revision and unpublished/published status footer appeared on every page. These printouts contain dummy workflow evidence and are verification artifacts, not restaurant approvals. The browser rehearsal found duplicate draft panels after trial save caused by sibling React keys; unique component keys and a post-save single-panel assertion fix and cover that issue. All three scripts were rerun after the fix and passed; final guide screens were visually rechecked.

Final browser artifacts are in the local temporary directories `dg-recipe-visual-8HQloZ`, `dg-recipe-workflow-ueudkw`, and `dg-recipe-manual-QiFYp4`. No production browser/backend end-to-end integration, other browser print engines, physical printer, private storage delivery or real cooking was verified. No production import, deployment, commit, push or migration was performed.

## Changed implementation files

- Catalog/import: `backend/data/recipeInstructionManual.js`, `recipeInstructionPilot.js`, `importRecipeInstructions.js`; `backend/services/recipeInstructionImportService.js`; `backend/package.json`.
- Existing lifecycle/schema integration: `backend/models/RecipeInstruction.js`, `RecipeInstructionRevision.js`; `backend/services/recipeInstructionRules.js`, `recipeInstructionService.js`, `recipeInstructionWorkflowService.js`.
- Recipe UI: `frontend/src/components/kitchen/recipes/RecipeInstructions.jsx`, `RecipeContents.jsx`, `RecipeDraftManager.jsx`, `RecipeRevisionEditor.jsx`, `RecipeWorkflow.jsx`, new `GuideRehearsalForm.jsx` and `TrialRecordView.jsx`.
- Verification: `backend/tests/recipeInstructionImportIntegration.js`, `recipeInstructionsIntegration.js`, `recipeInstructionWorkflowIntegration.js`; `frontend/tests/recipeManual.test.js`, `recipeManualBrowserSmoke.mjs`, `recipeInstructionsBrowserSmoke.mjs`, `recipeWorkflowBrowserSmoke.mjs`; this checklist.
