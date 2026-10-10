import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import User from "../models/User.js";
import Instruction from "../models/RecipeInstruction.js";
import Revision from "../models/RecipeInstructionRevision.js";
import AuditLog from "../models/AuditLog.js";
import StockTransaction from "../models/StockTransaction.js";
import Order from "../models/Order.js";
import Expense from "../models/Expense.js";
import PurchaseOrder from "../models/PurchaseOrder.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import { RECIPE_LIBRARY, pilotByCode } from "../data/recipeInstructionPilot.js";
import { importRecipeManual, validateManualCatalog } from "../services/recipeInstructionImportService.js";
import { getRecipeInstruction, listRecipeInstructions, saveRecipeInstruction } from "../services/recipeInstructionService.js";
import { recordRecipeTrial, recipeLifecycle } from "../services/recipeInstructionWorkflowService.js";
import { CHECKS, qualifyingTrial, validateTrial } from "../services/recipeInstructionRules.js";

// Independently transcribed table values, not generated from production catalog.
const grams = {
  B01:[160,1.6,0.3,80,30,25,15,20,5], HB01:[300,80,50,50,10,5,3,2], T1:[500,20,3,50],
  S2:[350,80,30,20,10,5,5], S3:[360,100,20,6,4,7,2,1], S4:[360,70,50,12,5,3], T2:[350,250,20,3,1],
  HB02:[340,35,35,30,25,15,10,4,3,2,1], HB03:[300,80,35,25,25,12,10,5,4,2,1,1],
  B02:[160,80,25,30,10,5,25,15,2.2,1,1,0.3,0.3,60,20,1.2,1.2,0.8,0.8,0.3,0.5,0.3],
  S01:[140,100,25,25,12,30,10,6,14,3.5,2.1,2.1,1.82,1.12,0.28,0.28], S02:[150,100,30,40,20,6,1.5,0.3,0.4,0.5,3],
  DS01:[330,90,40,20,15,3,2], CS01:[270,200,6,4,20], A01:[150,8,12,12,30,0.4,1.2,0.4,0.2,35,2], F01:[200,1.5,25], F02:[200,1,60],
};
test("import CLI rejects remote/unsafe databases, missing actor and invalid arguments before connecting", () => {
  const script = fileURLToPath(new URL("../data/importRecipeInstructions.js", import.meta.url));
  const actor = "012345678901234567890123";
  for (const [uri, actorId, args, message] of [
    ["mongodb://example.invalid/dg_recipe_test", actor, [], /Remote\/production import is disabled/],
    ["mongodb://127.0.0.1/restaurant", actor, [], /Only explicitly named local/],
    ["mongodb://127.0.0.1/dg_recipe_test", "", [], /Explicit RECIPE_IMPORT_MONGO_URI/],
    ["mongodb://127.0.0.1/dg_recipe_test", actor, ["--publish"], /Use --dry-run/],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout: 15000, env: { ...process.env, RECIPE_IMPORT_MONGO_URI: uri, RECIPE_IMPORT_ACTOR_ID: actorId } });
    assert.equal(result.error, undefined); assert.notEqual(result.status, 0); assert.match(result.stderr, message);
  }
});
test("complete source tables, pages, aliases, presets and allocation meaning", () => {
  validateManualCatalog(RECIPE_LIBRARY); assert.equal(RECIPE_LIBRARY.length,22);
  assert.equal(RECIPE_LIBRARY.filter(r=>r.category === "Main Recipes").length,7);
  assert.equal(RECIPE_LIBRARY.filter(r=>r.category === "Kitchen Guides").length,5);
  for (const [code,quantities] of Object.entries(grams)) {
    const row = pilotByCode(code); assert.deepEqual(row.ingredients.map(i=>i.quantities[0]),quantities,code);
    if(row.presets.length === 2) assert.deepEqual(row.ingredients.map(i=>i.quantities[1]), quantities.map(q=>Number((q*(row.category === "Main Recipes" ? 10 : 2)).toFixed(6))),code);
    assert.equal(row.servingPhoto,null); assert.ok(row.source.pages.length); assert.ok(row.warnings.some(w=>/NOT approved/.test(w)));
  }
  assert.deepEqual(pilotByCode("S1"),pilotByCode("HB01")); assert.equal(RECIPE_LIBRARY.filter(r=>r.aliases.includes("S1")).length,1);
  assert.ok(pilotByCode("B02").source.pages.includes(7) && pilotByCode("B02").source.pages.includes(8));
  assert.ok(pilotByCode("CS01").source.pages.includes(26) && pilotByCode("CS01").source.pages.includes(27));
  assert.ok(pilotByCode("B02").ingredients.some(i=>i.basis === "dry coating allocation"));
  assert.match(pilotByCode("CS01").cooking.join(" "),/8–12 minutes.*12–18 minutes/);
  assert.match(pilotByCode("CS01").cooking.join(" "),/Spills.*cannot be replaced/);
  assert.deepEqual(pilotByCode("F01").linkedPreparationCodes,[]); assert.match(pilotByCode("F01").serving.join(" "),/one dip only/);
  assert.deepEqual(pilotByCode("B02").linkedPreparationCodes,["S2","S4"]); assert.deepEqual(pilotByCode("F02").linkedPreparationCodes,["CS01"]);
  assert.throws(()=>validateManualCatalog([...RECIPE_LIBRARY,RECIPE_LIBRARY[0]]),/Duplicate/);
  const bad = structuredClone(RECIPE_LIBRARY); bad[1].aliases.push("B01"); assert.throws(()=>validateManualCatalog(bad),/Duplicate/);
});

test("isolated complete manual import and guide workflow", {timeout:180000}, async t => {
  await withIsolatedMongo(async () => {
    const admin = await User.create({name:"Isolated manual owner",email:"manual@test.local",password:"TestPassword123!",role:"admin"});
    const kitchen = { _id:admin._id, name:"Isolated kitchen",role:"kitchen" };
    const apply = records => importRecipeManual({actor:admin,apply:true,...(records ? {records} : {})});
    const get = code => getRecipeInstruction(code,admin);
    const act = async (code,action,extra={}) => { const row=await get(code); return recipeLifecycle(code,action,{revision:row.revision,workflowVersion:row.workflowVersion || 0,requestKey:randomUUID(),reason:"Isolated rehearsal only",...extra},admin); };
    const checks=Object.fromEntries(CHECKS.map(k=>[k,true]));
    await t.test("dry run has no writes; permission enforced",async()=>{
      const report=await importRecipeManual({actor:admin}); assert.equal(report.rows.length,22); assert.ok(report.rows.every(r=>r.action === "create_draft"));
      assert.equal(await Instruction.countDocuments(),0); assert.equal(await AuditLog.countDocuments(),0);
      await assert.rejects(()=>importRecipeManual({actor:kitchen,apply:true}),e=>e.status ===403);
    });
    await t.test("first apply/rerun/concurrent rerun preserve one alias and links, all unapproved",async()=>{
      const reports=await Promise.all([apply(),apply()]); assert.ok(reports.every(report=>report.conflicts ===0)); assert.equal(await Instruction.countDocuments(),22); assert.equal(await Revision.countDocuments(),22);
      assert.equal(await Instruction.countDocuments({status:{$in:["approved","published"]}}),0);
      const repeated=await Promise.all([apply(),apply()]); assert.ok(repeated.every(r=>r.rows.every(x=>x.action === "unchanged")));
      assert.equal(await Revision.countDocuments(),22); assert.equal(await Instruction.countDocuments({aliases:"S1"}),1);
      assert.equal((await get("S1")).code,"HB01"); assert.deepEqual(await listRecipeInstructions(kitchen),[]);
      const version=await Revision.findOne({code:"B02"}); assert.equal(version.importProvenance.manualVersion,"1.3"); assert.equal(version.importProvenance.recordHash.length,64);
    });
    await t.test("guide requires actual staff rehearsal, no fake cooking or yield; publish gated",async()=>{
      await act("GUIDE-SPECS","submit");
      await assert.rejects(()=>act("GUIDE-SPECS","approve",{trialId:"012345678901234567890123",checklist:checks}));
      const payload={revision:1,requestKey:randomUUID(),trialAt:new Date().toISOString(),preparation:"Isolated source review and actual staff rehearsal observations",reviewerComments:"Dummy verification, not real restaurant approval",safety:"passed",outcome:"passed",guideChecks:{sourceReviewed:true,staffRehearsal:true,localSafetyReviewed:true}};
      const trial=await recordRecipeTrial("GUIDE-SPECS",payload,kitchen); assert.equal(trial.record.kind,"guide_rehearsal"); assert.equal(trial.record.batch,undefined);
      assert.ok(qualifyingTrial(trial.record,pilotByCode("GUIDE-SPECS"))); assert.equal(qualifyingTrial({...trial.record,guideChecks:{}},pilotByCode("GUIDE-SPECS")),false);
      assert.throws(()=>validateTrial({...payload,batch:{value:500}},pilotByCode("GUIDE-SPECS")),/Invalid/);
      await act("GUIDE-SPECS","approve",{trialId:trial.id,checklist:checks}); await act("GUIDE-SPECS","publish");
      assert.equal((await listRecipeInstructions(kitchen))[0].code,"GUIDE-SPECS");
      assert.equal((await getRecipeInstruction("GUIDE-SPECS",kitchen)).importProvenance,undefined);
    });
    await t.test("source change creates reviewable draft; published exact revision intact",async()=>{
      const changed=structuredClone(RECIPE_LIBRARY); changed.find(r=>r.code ==="GUIDE-SPECS").description="Source correction queued for qualified review";
      const report=await apply(changed); assert.equal(report.rows.find(r=>r.code ==="GUIDE-SPECS").revision,2);
      const row=await get("GUIDE-SPECS"); assert.equal(row.status,"draft"); assert.equal(row.publishedRevision,1);
      assert.notEqual((await getRecipeInstruction("GUIDE-SPECS",kitchen)).description,row.description);
      assert.equal((await apply(changed)).rows.find(r=>r.code ==="GUIDE-SPECS").action,"unchanged");
    });
    await t.test("restaurant-specific edit conflict reported, never overwritten",async()=>{
      const old=await get("B02"); await saveRecipeInstruction("B02",{revision:old.revision,workflowVersion:old.workflowVersion || 0,status:"draft",reviewNotes:"Owner pending review",inventoryRecipe:null,content:{description:"Restaurant-specific edit"},requestKey:randomUUID(),reason:"Isolated owner change"},admin);
      const report=await apply(); assert.equal(report.rows.find(r=>r.code ==="B02").action,"conflict"); assert.equal((await get("B02")).description,"Restaurant-specific edit");
    });
    await t.test("concurrent source update produces only one new revision",async()=>{
      const changed=structuredClone(RECIPE_LIBRARY); changed.find(r=>r.code ==="DS01").description="Reviewed source correction pending trial";
      const result=await Promise.all([apply(changed),apply(changed)]); assert.equal(await Revision.countDocuments({code:"DS01"}),2); assert.ok(result.some(r=>r.rows.find(x=>x.code ==="DS01").revision ===2));
    });
    await t.test("failed import audit rolls back revision and retries once without duplicates",async()=>{
      const source=structuredClone(pilotByCode("CS01")); source.description="Isolated source update for rollback verification";
      const old=await get("CS01"), createAudit=AuditLog.create;
      try {
        AuditLog.create=async()=>{ throw new Error("Isolated audit storage failure"); };
        await assert.rejects(()=>apply([source]),/Isolated audit storage failure/);
      } finally { AuditLog.create=createAudit; }
      assert.equal((await get("CS01")).revision,old.revision);
      assert.equal((await get("CS01")).description,old.description);
      assert.equal(await Revision.countDocuments({code:"CS01"}),1);
      assert.equal((await apply([source])).rows[0].revision,2);
      assert.equal((await apply([source])).rows[0].action,"unchanged");
      assert.equal(await Revision.countDocuments({code:"CS01"}),2);
    });
    await t.test("missing preparations block dish approval; no stock/order/purchasing/finance mutations",async()=>{
      await act("F02","submit");
      const row=await get("F02"), tested={tested:true,score:4,notes:"Isolated fixture"};
      const trial=await recordRecipeTrial("F02",{revision:1,requestKey:randomUUID(),trialAt:new Date().toISOString(),batch:{value:10,unit:"servings",basis:"measured"},ingredients:row.ingredients.map((r,index)=>({index,quantity:r.quantities[1],brand:"Dummy"})),usableYield:{value:2300,unit:"g",basis:"measured"},preparation:"Actual preparation log fixture",cooking:"Measured fryer log fixture",taste:tested,texture:tested,portionConsistency:tested,presentation:tested,delivery:[],safety:"passed",outcome:"passed"},kitchen);
      await assert.rejects(()=>act("F02","approve",{trialId:trial.id,checklist:checks}),/CS01 must be approved/);
      for(const model of [StockTransaction,Order,Expense,PurchaseOrder,SupplierInvoice]) assert.equal(await model.countDocuments(),0,model.modelName);
    });
  });
});
