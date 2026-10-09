# Recipe Instructions Phase 3

## Lifecycle and access

`/kitchen/recipes`: Kitchen defaults to Published service instructions. Admin/Manager defaults to Manage revisions. `?view=trial` is an explicit authorized, unapproved trial workspace. Backend existing `kitchen.operate` gates all endpoints; only Admin/Manager can edit, submit, approve, publish or restore. Unauthenticated/other roles have no access. No new role or approval bypass.

Save explicitly persists the pilot; GET never seeds. Save may explicitly request a trial or leave a draft; Draft -> Trial Required via submit; Trial Required -> Approved via review; Approved -> Published via publication. Kitchen can append trials only to the latest Trial Required revision. Trials never auto-approve. Published history remains readable, but only the aggregate's single published pointer represents current service instructions.

## Trials and qualifying review

Append-only trial records retain actual timestamp (input Asia/Riyadh), authenticated staff snapshot, measured batch size, actual ingredient grams/brands, measured or explicitly estimated usable yield, optional measured waste, preparation/cooking observations/deviations, tested quality scores, actually-tested delivery intervals, safety outcome and reviewer comments. Unmeasured quantities/yield and untested results remain null; no invented scores or delivery results. No financial fields.

Qualifying trial: outcome passed; safety checks passed; all ingredient quantities measured; usable yield measured; preparation observations present and cooking observations if cooking applies; taste/texture/portion/presentation actually tested; core taste/texture mean >=4/5 (manual house guidance); main dish actual batch >=10 servings. Preparations use their own actual batch, not 10 arbitrary servings. Optional waste/delivery observations are not fabricated to pass. The reviewer must explicitly review delivery scope where relevant, including whether more tests are needed. Internal approval is not regulatory certification or validated shelf life.

Nine review checks are mandatory, including qualified/local safety review. Approval records exact revision and qualifying trial, actor/time/reason, checklist and direct published preparation pins. B01 must first have HB01 (S1 alias, one formula) and T1 approved/published. Missing references, duplicate/self links and cycles reject. HB02/HB03 are not imported substitutions.

## Revisions and material changes

Every save creates a new immutable content revision, including conservative handling of name/description/review-note/link changes. Ingredient names/brands/specifications/quantities/counts/basis, preparation/cooking/assembly, serving/delivery, allergens, storage, yield notes and preparation links are material. Even non-material edits never inherit approval/trials: exact-revision re-trial and approval are required. Source manual metadata, aliases, category and original safety warnings are not editable. Source presets remain explicit quantities, not automatic scaling of temperatures/times. Recipe source version remains 1.3; operational `rN` distinguishes subsequent revisions.

Current Published remains available while a new draft is reviewed. Publication atomically switches one aggregate pointer; old published content/trials/approval survive. Prepared recipe pins stay exact after later sauce publication; published list flags updates without changing the dish. All preparation links on approved/published cards open pinned revisions. Restore copies historical content to a NEW draft and records reason/origin; never rewinds the pointer or history.

Legacy Phase 2 records require no bulk migration. Their existing revision is preserved transactionally on the next explicit write/lifecycle action; GET history can show its read-only legacy record. No script, seed, environment variable or production data operation is required. New collections/indexes initialize through the project's normal Mongoose model mechanism. Mongo replica-set transactions are required (same as existing safe inventory operations); no nontransactional fallback.

## Reliability and operational boundaries

Transactions include aggregate/revision/trial and audit writes. Aggregate workflow version serializes trial/review/edit races; exact revision checks reject stale writes. Dependency aggregates are transactionally write-locked during approval. Content snapshots never change; approvals/publication mutate lifecycle metadata only. Stable request keys + payload/actor hashes make trial, edit/restore, submit/approve/publish retries idempotent. Reusing a key for a different payload rejects. Concurrent distinct actions conflict safely; reload before reviewing a new state. Audit records carry code/revision/actor/time/reason and qualifying trial/dependency references.

History is bounded (20 revisions per page); trials 50 per page with Load older controls. Kitchen normal history exposes published revisions only and never shows unpublished diff content. API private/no-store. No inventory recipe, batch, stock transaction, order, purchasing or financial writes; instruction inventory links remain references only.

No trusted private media adapter exists: actual kitchen photo upload/reference attachment remains unavailable, with honest placeholders. Full manual download remains unavailable (developer Downloads paths are never served). These need owner-approved private object storage, authenticated media access and upload validation before enablement. No AI image is presented as an approved kitchen reference.

Print includes exact revision and state; published/approved pages have distinct footer labels in Chromium. Historical printed service cards are flagged superseded in their heading. Other browser margin-box support is not guaranteed; visible state/approval/revision still prints in the document. Kitchen history/trial management forms do not print.

## First trial / publication

1. Admin/Manager opens `/kitchen/recipes?view=manage`, explicitly saves HB01 and T1 with a change reason. Choose Trial Required or submit the draft using Request kitchen trial.
2. Kitchen opens `?view=trial`, selects the recipe and records actual measured trial results. Failed/incomplete trials remain historical; improve instructions by creating a new revision when needed.
3. Admin/Manager reloads, selects the qualifying passed trial, completes every actual review check, records reviewer reason and approves. Then explicitly publishes with a publication reason.
4. Repeat B01 using an actual 10-serving trial. Publish only after both preparations. Kitchen normal view now shows approved service cards; test pinned preparation links, print and browser Back/Forward.
5. Edit a published sauce to verify Kitchen still sees old service instructions; review/publish replacement, then inspect B01 update-available indicator. To adopt, create/retrial/approve/publish a new B01 revision.

Phase 4 still owns remaining PDF recipe import. Prepared-stock production/deduction and private media integration are not implemented in this phase.

## Verification commands (isolated dummy data only)

Backend: `node --test tests/recipeInstructionsIntegration.js tests/recipeInstructionWorkflowIntegration.js` uses helper-owned disposable local Mongo replica sets, never configured production URI. Existing kitchen/production-safety/stock-recipe/purchasing/POS regressions also use isolated fixtures.

Frontend: `node --test tests/*.test.mjs tests/*.test.js`, `npm run lint`, `npm run build`. Browser fixtures intercept ALL `/api/**` calls. Start the local production build on port 3008, then run `node tests/recipeInstructionsBrowserSmoke.mjs` and `node tests/recipeWorkflowBrowserSmoke.mjs` (set `PLAYWRIGHT_MODULE` only if using a bundled Playwright runtime). No browser fixture creates real trials/approvals or database data.

### Recorded local verification (9 October 2026)

- Recipe Phases 1-3 isolated backend tests: 30 passed, 0 failed. Includes legacy draft preservation, concurrent approval/publication/edit races, idempotent retries, cycle/missing dependency rejection, measured/untested trial validation, pin preservation, restore, equal-timestamp pagination, rollback and unchanged nonempty stock / financial / purchasing collections.
- Kitchen, production safety, stock-recipe accuracy, purchasing safety and POS Phase 2 regression command: 65 passed, 0 failed.
- Frontend unit/regression tests: 100 passed, 0 failed.
- Frontend ESLint: successful, no diagnostics. Production Next build and its TypeScript step successful; 24 static pages generated, including `/kitchen/recipes`.
- Both browser scripts passed at 1536x1024, 820x1180 and 390x844. API fixtures only, no real backend writes. Includes multiline editing, trial form, review/publish, exact revision navigation, restore/diff, privacy, errors, responsive/keyboard behavior and print state checks.
- Chromium print PDFs rendered and inspected: published B01 three pages, approved T1 three pages, draft T1 two pages. Recipe code/revision/status footer on every page, no clipping/overlap. No Safari/Firefox print verification or production deployment verification.
- Backend workflow/rules/service JavaScript syntax checks and `git diff --check` passed. Backend package has no dedicated lint script.
