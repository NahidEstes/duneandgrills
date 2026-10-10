import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RECIPE_LIBRARY } from "../../backend/data/recipeInstructionPilot.js";
// All API calls intercepted. No live database, real stock or restaurant approvals.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE,"index.mjs")).href : "playwright");
const browser=await chromium.launch({channel:"chrome",headless:true});
const origin=process.env.RECIPE_SMOKE_URL || "http://localhost:3008";
const output=await mkdtemp(path.join(tmpdir(),"dg-recipe-manual-"));
try {
  for(const viewport of [{width:1536,height:1024},{width:820,height:1180},{width:390,height:844}]) {
    const context=await browser.newContext({viewport}), page=await context.newPage(), errors=[],mutations=[];
    let role="admin",fail=false; const trials=[];
    const recipes=structuredClone(RECIPE_LIBRARY).map(r=>r.category === "Kitchen Guides" ? {...r,revision:1,persisted:true,status:"trial_required",workflowVersion:0,currentWorking:true} : r);
    page.on("pageerror",e=>errors.push(e.message));
    await context.route("**/api/**",async route=>{
      const req=route.request(), url=new URL(req.url()), resource=url.pathname.replace(/^\/api/,"");
      let status=200,payload={success:true,data:[]};
      const code=resource.split("/")[3], row=recipes.find(r=>r.code ===code);
      if(resource ==="/auth/me") payload={user:{_id:"444444444444444444444444",name:"Isolated Reviewer",role}};
      else if(resource ==="/cart") payload.data={items:[],coupon:null};
      else if(resource ==="/kitchen/recipes") {
        if(fail) {status=503;payload.message="Isolated manual load failure";}
        else payload.data=role ==="kitchen" && url.searchParams.get("view") !=="trial" ? [] : recipes;
      } else if(resource.endsWith("/manual")) payload.data={available:false,message:"Private manual storage is not configured."};
      else if(resource.endsWith("/inventory-options")) payload.data=[];
      else if(resource.endsWith("/history")) payload.data={rows:[],nextBefore:null};
      else if(resource.endsWith("/trials") && req.method() ==="GET") payload.data={rows:trials.filter(t=>t.code ===code),nextBefore:null};
      else if(resource.endsWith("/trials") && req.method() ==="POST") {
        const body=req.postDataJSON(); assert.equal(body.batch,undefined); assert.equal(body.ingredients,undefined); assert.ok(body.requestKey);
        assert.equal(Object.values(body.guideChecks).every(Boolean),true);
        const trial={id:"555555555555555555555555",code,revision:1,actor:{name:"Fixture Reviewer",role},record:{...body,kind:"guide_rehearsal"}};
        trials.push(trial); row.workflowVersion++;payload.data=trial;mutations.push(resource);
      } else if(row) payload.data=row;
      else if(!/GET|HEAD/.test(req.method())) throw new Error(`Unexpected mutation ${resource}`);
      await route.fulfill({status,contentType:"application/json",body:JSON.stringify(payload)});
    });
    const heading=name=>page.getByRole("heading",{level:2,name,exact:true});
    await page.goto(`${origin}/kitchen/recipes?view=manage&recipe=B02`);
    await heading("Crispy Chicken Burger").waitFor(); assert.equal(await page.locator(".recipe-list-item").count(),22);
    await page.getByRole("cell",{name:"2.2 g",exact:true}).waitFor();
    await page.getByRole("button",{name:"10 servings",exact:true}).click(); await page.getByRole("cell",{name:"22 g",exact:true}).waitFor();
    await page.getByRole("button",{name:"Cooking & Assembly",exact:true}).click();
    await page.locator("p").filter({hasText:/Start fryer 175°C/}).waitFor();
    if(viewport.width ===1536) {
      await page.emulateMedia({media:"print"});
      await page.pdf({path:path.join(output,"B02-print.pdf"),format:"A4",printBackground:true});
      await page.emulateMedia({media:"screen"});
    }
    await page.getByRole("button",{name:"S2 · Preparation instructions →",exact:true}).click();await heading("Spicy Chicken Sauce").waitFor();
    await page.getByRole("button",{name:"Back to previous instructions",exact:true}).click();await heading("Crispy Chicken Burger").waitFor();
    await page.goForward();await heading("Spicy Chicken Sauce").waitFor();await page.goBack();await heading("Crispy Chicken Burger").waitFor();
    await page.reload();await heading("Crispy Chicken Burger").waitFor();
    const search=page.getByRole("textbox",{name:"Search recipes",exact:true});await search.fill("CS01");assert.equal(await page.locator(".recipe-list-item").count(),1);
    await page.locator(".recipe-list-item").click();await heading("Cheddar Cheese Sauce").waitFor();
    await page.getByRole("button",{name:"1 kg batch",exact:true}).click();await page.getByRole("cell",{name:"12 g",exact:true}).waitFor();
    await page.getByRole("button",{name:"Cooking & Assembly",exact:true}).click();await page.locator("p").filter({hasText:/8–12 minutes for 500 g; 12–18 minutes for 1 kg/}).waitFor();
    await page.getByRole("button",{name:"Storage & Allergens",exact:true}).click();await page.locator("p").filter({hasText:/Reheat ONCE/}).waitFor();
    await page.screenshot({path:path.join(output,`CS01-${viewport.width}.png`),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
    await page.emulateMedia({media:"print"});
    if(viewport.width ===1536) await page.pdf({path:path.join(output,"CS01-print.pdf"),format:"A4",printBackground:true});
    await page.emulateMedia({media:"screen"});await search.fill("");
    await page.getByRole("button",{name:"Kitchen Guides",exact:true}).focus();await page.keyboard.press("Enter");assert.equal(await page.locator(".recipe-list-item").count(),5);
    await page.locator(".recipe-list-item").filter({hasText:"Ingredient Specifications"}).click();await heading("Ingredient Specifications").waitFor();
    await page.getByRole("button",{name:"Preparation",exact:true}).click();await page.locator("p").filter({hasText:/Raw meat after bones/}).waitFor();
    await page.getByText("Record guide rehearsal · exact revision 1",{exact:true}).click();
    await page.getByLabel("Rehearsal date/time · Asia/Riyadh",{exact:true}).fill("2026-10-08T12:00");
    await page.getByLabel("Actual staff rehearsal observations",{exact:true}).fill("Dummy actual staff rehearsal observations, not restaurant approval.");
    for(const name of ["Source pages reviewed","Staff procedure rehearsed","Qualified/local safety applicability reviewed"]) await page.getByRole("checkbox",{name,exact:true}).check();
    for(const [name,option] of [["Food-safety review","Passed — actually reviewed"],["Rehearsal outcome","Passed"]]) {await page.getByRole("combobox",{name,exact:true}).click();await page.getByRole("option",{name:option,exact:true}).click();}
    await page.getByRole("button",{name:"Save guide rehearsal",exact:true}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll("summary")].find(s=>s.textContent ==="Record guide rehearsal · exact revision 1")?.parentElement?.open ===false);
    assert.equal(await page.getByText("Manage instruction draft · Admin / Manager",{exact:true}).count(),1);
    await page.getByText("Trial records · r1",{exact:true}).click();await page.getByText(/passed · Fixture Reviewer/).click();await page.getByText("Documented staff rehearsal, not a cooking/yield trial.",{exact:true}).waitFor();
    await page.screenshot({path:path.join(output,`guide-${viewport.width}.png`),fullPage:true});
    await page.emulateMedia({media:"print"}); if(viewport.width ===1536) await page.pdf({path:path.join(output,"guide-print.pdf"),format:"A4",printBackground:true});await page.emulateMedia({media:"screen"});
    assert.deepEqual(mutations,["/kitchen/recipes/GUIDE-SPECS/trials"]); assert.deepEqual(errors,[]);
    fail=true;await page.reload();await page.getByRole("alert").filter({hasText:"Isolated manual load failure"}).waitFor();fail=false;await page.getByRole("button",{name:"Retry / reload drafts",exact:true}).click();await heading("Ingredient Specifications").waitFor();
    role="kitchen";await page.goto(`${origin}/kitchen/recipes?view=published`);await page.getByRole("heading",{name:"No published recipe instructions available",exact:true}).waitFor();
    assert.equal(await page.getByRole("button",{name:"View manual",exact:true}).count(),0);
    console.log(`PASS full manual, guide rehearsal, presets/process, links/back, filters, private/empty/error/print (${viewport.width}px)`);await context.close();
  }
  console.log(`Visual outputs: ${output}; all APIs mocked.`);
} finally {await browser.close();}
