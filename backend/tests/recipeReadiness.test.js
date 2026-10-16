import assert from "node:assert/strict";
import { test, mock } from "node:test";
import RecipeInstruction from "../models/RecipeInstruction.js";
import Revision from "../models/RecipeInstructionRevision.js";
import Trial from "../models/RecipeInstructionTrial.js";
import { recipeWorkflowReadiness } from "../services/recipeInstructionWorkflowService.js";
import { RECIPE_LIBRARY } from "../data/recipeInstructionPilot.js";
import { CHECKS } from "../services/recipeInstructionRules.js";

test("read-only recipe readiness shares exact trial rules, dependencies, publication checks and manager access", async () => {
  const content = structuredClone(RECIPE_LIBRARY.find(r => r.code === "B01"));
  let anchor = { code: "B01", revision: 4, publishedRevision: 3, workflowVersion: 8 }, status = "trial_required", approval = null, checklist = {}, pins = [];
  let trials = [], dependencies = [];
  const query = value => ({ then: (resolve, reject) => Promise.resolve(value).then(resolve, reject), lean: async () => value, session: () => query(value), select: () => query(value) });
  const revisions = () => [{ code: "B01", revision: 4, content, status, approval, checklist, dependencyPins: pins }, ...dependencies];
  mock.method(RecipeInstruction, "findOne", filter => query(filter.code === "B01" ? anchor : dependencies.find(r => r.code === filter.code) ? { code: filter.code, publishedRevision: dependencies.find(r => r.code === filter.code).revision } : null));
  mock.method(Revision, "findOne", filter => query(revisions().find(r => r.code === filter.code && r.revision === filter.revision && (!filter.status || r.status === filter.status)) || null));
  mock.method(Revision, "exists", async filter => revisions().some(r => r.code === filter.code && r.revision === filter.revision && r.status === filter.status && r.approval));
  mock.method(Trial, "find", filter => { assert.deepEqual(filter, { code: "B01", revision: 4 }); return query(trials); });
  mock.method(RecipeInstruction.prototype, "save", () => { throw new Error("Readiness must never write"); });
  const actor = { role: "manager" }, read = () => recipeWorkflowReadiness("B01", actor, { revision: "4" });
  try {
    await assert.rejects(() => recipeWorkflowReadiness("B01", { role: "kitchen" }, { revision: "4" }), error => error.status === 403);
    let result = await read(); assert.equal(result.approve.allowed, false); assert.match(result.approve.reasons.join(" "), /qualifying passed trial.*HB01 must/s); assert.equal(result.publishedRevision, 3);
    const record = { outcome: "passed", safety: "passed", ingredients: [{ basis: "measured" }], usableYield: { basis: "estimated" }, preparation: "Actual preparation", cooking: "Actual cooking", batch: { unit: "servings", value: 10 }, taste: { tested: true, score: 4 }, texture: { tested: true, score: 4 }, portionConsistency: { tested: true }, presentation: { tested: true } };
    trials = [{ _id: "trial4", record }]; result = await read(); assert.deepEqual(result.qualifyingTrialIds, []);
    record.usableYield.basis = "measured";
    dependencies = ["HB01", "T1"].map(code => ({ code, revision: 2, status: "published", approval: { at: new Date() }, content: { code, linkedPreparationCodes: [] }, dependencyPins: [] }));
    result = await read(); assert.equal(result.approve.allowed, true); assert.deepEqual(result.qualifyingTrialIds, ["trial4"]); assert.deepEqual(result.dependencies, [{ code: "HB01", revision: 2 }, { code: "T1", revision: 2 }]); assert.equal(result.publish.allowed, false);
    record.batch.value = 1; assert.equal((await read()).approve.allowed, false); record.batch.value = 10;
    status = "approved"; approval = { at: new Date() }; checklist = Object.fromEntries(CHECKS.map(key => [key, true])); pins = [{ code: "HB01", revision: 1 }];
    result = await read(); assert.equal(result.publish.allowed, false); assert.match(result.publish.reasons.join(" "), /Pinned HB01/);
    pins = [{ code: "HB01", revision: 2 }]; assert.equal((await read()).publish.allowed, true);
    anchor = { ...anchor, revision: 5 }; result = await read(); assert.equal(result.currentWorking, false); assert.equal(result.publish.allowed, false);
  } finally { mock.restoreAll(); }
});
