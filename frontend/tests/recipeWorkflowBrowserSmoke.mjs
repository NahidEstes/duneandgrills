import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RECIPE_PILOT } from "../../backend/data/recipeInstructionPilot.js";
// Browser/UI rehearsal only. ALL API requests intercepted with isolated dummy fixtures.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE, "index.mjs")).href : "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const origin = process.env.RECIPE_SMOKE_URL || "http://localhost:3008";
const output = await mkdtemp(path.join(tmpdir(), "dg-recipe-workflow-"));
const actor = { id: "444444444444444444444444", name: "Fixture Reviewer", role: "manager" };
try {
  for (const viewport of [{ width: 1536, height: 1024 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }), page = await context.newPage(), errors = [], mutationPaths = [];
    page.on("pageerror", error => errors.push(error.message));
    let role = "kitchen";
    const recipes = structuredClone(RECIPE_PILOT).map(row => ({ ...row, revision: 1, workflowVersion: 0, persisted: true, currentWorking: true, status: row.code === "T1" ? "trial_required" : "published", publishedRevision: row.code === "T1" ? null : 1, currentPublished: row.code !== "T1", approval: row.code === "T1" ? null : { actor, at: new Date().toISOString(), reason: "Fixture approval" }, publication: row.code === "T1" ? null : { actor, at: new Date().toISOString(), reason: "Fixture publication" }, dependencyPins: row.code === "B01" ? [{ code: "HB01", revision: 1, updateAvailable: true }] : [] }));
    const versions = new Map(recipes.map(row => [`${row.code}-1`, structuredClone(row)])), trials = [];
    await context.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url()), resource = url.pathname.replace(/^\/api/, "");
      let payload = { success: true, data: [] }, status = 200;
      const code = resource.split("/")[3], row = recipes.find(r => r.code === code);
      if (resource === "/auth/me") payload = { user: { _id: actor.id, name: role === "kitchen" ? "Fixture Kitchen" : actor.name, role } };
      else if (resource === "/cart") payload.data = { items: [], coupon: null };
      else if (resource === "/kitchen/recipes") {
        const view = url.searchParams.get("view"); payload.data = view === "published" ? recipes.filter(r => r.publishedRevision).map(r => ({ ...versions.get(`${r.code}-${r.publishedRevision}`), workflowVersion: r.workflowVersion, currentWorking: r.revision === r.publishedRevision })) : view === "trial" && role === "kitchen" ? recipes.filter(r => ["trial_required", "approved"].includes(r.status)) : recipes;
      } else if (resource.endsWith("/manual")) payload.data = { available: false, message: "Private manual storage is not configured." };
      else if (resource.endsWith("/inventory-options")) payload.data = [];
      else if (resource.endsWith("/history")) payload.data = { rows: [...versions.values()].filter(r => r.code === code && (role !== "kitchen" || r.status === "published" || url.searchParams.get("view") === "trial")).sort((a, b) => b.revision - a.revision).map(r => ({ revision: r.revision, status: r.status, currentPublished: r.revision === row.publishedRevision, reason: "Fixture revision", createdAt: new Date().toISOString(), actor, changes: r.revision > 1 ? [{ field: "ingredients", before: "Original formula", after: "Restored as a new draft" }] : [] })), nextBefore: null };
      else if (resource.endsWith("/trials") && request.method() === "GET") payload.data = { rows: trials.filter(r => r.code === code && r.revision === Number(url.searchParams.get("revision"))), nextBefore: null };
      else if (resource.endsWith("/trials") && request.method() === "POST") {
        mutationPaths.push(resource); const body = request.postDataJSON(); assert.ok(body.requestKey); assert.equal(body.batch.unit, "g"); assert.equal(body.batch.value, 500); assert.equal(body.delivery.length, 0);
        const trial = { id: "555555555555555555555555", code, revision: body.revision, actor: { ...actor, role: "kitchen", name: "Fixture Kitchen" }, record: { ...body, ingredients: body.ingredients.map((r, i) => ({ ...r, name: row.ingredients[i].name, unit: "g", basis: r.quantity == null ? "untested" : "measured" })) } }; trials.push(trial); row.workflowVersion++; payload.data = trial;
      } else if (resource.includes("/workflow/") && request.method() === "POST") {
        mutationPaths.push(resource); const action = resource.split("/").at(-1), body = request.postDataJSON(); assert.ok(body.reason); assert.equal(body.workflowVersion, row.workflowVersion);
        if (action === "approve") { assert.equal(body.trialId, trials[0].id); assert.equal(Object.values(body.checklist).every(Boolean), true); row.status = "approved"; row.approval = { actor, at: new Date().toISOString(), reason: body.reason }; row.qualifyingTrialId = trials[0].id; }
        if (action === "publish") { assert.equal(row.status, "approved"); row.status = "published"; row.publishedRevision = row.revision; row.currentPublished = true; row.publication = { actor, at: new Date().toISOString(), reason: body.reason }; }
        row.workflowVersion++; versions.set(`${code}-${row.revision}`, structuredClone(row)); payload.data = row;
      } else if (row && request.method() === "PUT") {
        mutationPaths.push(resource); const body = request.postDataJSON(); assert.equal(body.restoreRevision, 1); assert.equal(body.status, "draft"); assert.ok(body.reason); assert.ok(body.requestKey);
        row.revision++; row.status = "draft"; row.currentPublished = false; row.approval = null; row.publication = null; row.qualifyingTrialId = null; versions.set(`${code}-${row.revision}`, structuredClone(row)); payload.data = row;
      } else if (row) { payload.data = url.searchParams.get("revision") ? versions.get(`${code}-${url.searchParams.get("revision")}`) : row; if (!payload.data) { status = 404; payload.message = "Fixture revision unavailable"; } }
      else if (!/GET|HEAD/.test(request.method())) throw new Error(`Unexpected mutation ${resource}`);
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
    });
    await page.goto(`${origin}/kitchen/recipes`); await page.getByRole("heading", { level: 2, name: "Double Beef Cheeseburger", exact: true }).waitFor();
    assert.equal(await page.getByText("Manage instruction draft · Admin / Manager").count(), 0);
    await page.getByText(/Update available — review required/).waitFor();
    await page.emulateMedia({ media: "print" }); assert.equal(await page.getByText(/PUBLISHED — INTERNALLY APPROVED SERVICE/).isVisible(), true);
    if (viewport.width === 1536) await page.pdf({ path: path.join(output, "published-B01.pdf"), format: "A4", printBackground: true });
    await page.emulateMedia({ media: "screen" });
    await page.getByRole("button", { name: "S1 / HB01 · House Burger Sauce →", exact: true }).click(); await page.waitForURL(/recipe=HB01.*revision=1/);
    await page.getByRole("heading", { level: 2, name: "Classic House Burger Sauce", exact: true }).waitFor(); await page.reload(); await page.getByRole("heading", { level: 2, name: "Classic House Burger Sauce", exact: true }).waitFor();
    await page.goBack(); await page.getByRole("heading", { level: 2, name: "Double Beef Cheeseburger", exact: true }).waitFor();
    await page.getByRole("link", { name: "Authorized trial view", exact: true }).click(); await page.getByRole("button", { name: /Caramelized Onion/ }).click();
    await page.getByRole("heading", { level: 2, name: "Caramelized Onion", exact: true }).waitFor(); await page.getByText("Record kitchen trial · exact revision 1").click();
    await page.getByLabel("Actual batch size", { exact: true }).fill("500"); await page.getByLabel("Actual usable yield (blank = untested)", { exact: true }).fill("275");
    for (const input of await page.getByRole("spinbutton", { name: /blank = unmeasured/ }).all()) await input.fill("10");
    await page.getByLabel("preparation observations", { exact: true }).fill("Actual prep observed"); await page.getByLabel("cooking observations", { exact: true }).fill("Measured cooking observations");
    for (const check of await page.getByRole("checkbox", { name: "Actually tested", exact: true }).all()) await check.check();
    for (const input of await page.getByRole("spinbutton", { name: "Score · 1 poor to 5 excellent", exact: true }).all()) await input.fill("4");
    const choose = async (label, option) => { await page.getByRole("combobox", { name: label, exact: true }).click(); await page.getByRole("option", { name: option, exact: true }).click(); };
    await choose("Food-safety checks", "Passed (actually checked)"); await choose("Trial outcome", "Passed");
    await page.screenshot({ path: path.join(output, `trial-${viewport.width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Save trial record", exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll("summary")].find(s => s.textContent === "Record kitchen trial · exact revision 1")?.parentElement?.open === false);
    await page.getByText("Trial records · r1", { exact: true }).click(); await page.getByText(/passed · Fixture Kitchen/).waitFor();
    role = "manager"; await page.goto(`${origin}/kitchen/recipes?recipe=T1&view=manage`);
    const review = () => page.getByText("Authorized review / version actions", { exact: true }); await review().click();
    await page.getByLabel("Action reason / reviewer comments", { exact: true }).fill("Actual qualified review complete");
    await page.getByRole("combobox", { name: "Qualifying passed trial", exact: true }).click(); await page.getByRole("option", { name: /Fixture Kitchen/ }).click();
    const checklist = page.getByRole("group", { name: "Review checklist", exact: true }); for (const check of await checklist.getByRole("checkbox").all()) await check.check();
    await page.getByRole("button", { name: "Record authorized approval", exact: true }).click(); await page.getByText(/Approved r1 by Fixture Reviewer/).waitFor();
    await page.emulateMedia({ media: "print" }); assert.equal(await page.getByText(/APPROVED — NOT PUBLISHED/).isVisible(), true); if (viewport.width === 1536) await page.pdf({ path: path.join(output, "approved-T1.pdf"), format: "A4", printBackground: true }); await page.emulateMedia({ media: "screen" });
    await review().click(); await page.getByLabel("Action reason / reviewer comments", { exact: true }).fill("Release for service"); await page.getByRole("button", { name: "Publish for regular service", exact: true }).click();
    await page.getByText(/Published by Fixture Reviewer/).waitFor();
    await review().click(); await page.getByLabel("Action reason / reviewer comments", { exact: true }).fill("Recheck original preparation");
    await page.getByText("Version history / differences", { exact: true }).click(); await page.getByText(/r1 · published · Current published/).click();
    await page.getByRole("button", { name: "Read exact revision", exact: true }).click(); await page.waitForURL(/revision=1/); await page.reload(); await page.getByRole("heading", { level: 2, name: "Caramelized Onion", exact: true }).waitFor();
    await review().click(); await page.getByLabel("Action reason / reviewer comments", { exact: true }).fill("Recheck original preparation"); await page.getByText("Version history / differences", { exact: true }).click(); await page.getByText(/r1 · published · Current published/).click();
    await page.getByRole("button", { name: "Restore as NEW draft (reason above)", exact: true }).click(); await page.getByText("Exact revision 2", { exact: true }).waitFor();
    await page.getByText("Version history / differences", { exact: true }).click(); await page.getByText(/r2 · draft/).click(); await page.getByText("Changed: ingredients", { exact: true }).click(); await page.getByText("Restored as a new draft", { exact: true }).waitFor();
    await page.emulateMedia({ media: "print" }); assert.equal(await page.getByText(/DRAFT — NOT PUBLISHED/).isVisible(), true); if (viewport.width === 1536) await page.pdf({ path: path.join(output, "draft-T1.pdf"), format: "A4", printBackground: true }); await page.emulateMedia({ media: "screen" });
    role = "kitchen"; await page.goto(`${origin}/kitchen/recipes?recipe=T1&view=published`); await page.getByText(/PUBLISHED — INTERNALLY APPROVED SERVICE/).waitFor(); assert.equal(await page.getByText("Exact revision 2", { exact: true }).count(), 0); assert.equal(await page.getByText("Exact revision 1", { exact: true }).count(), 1);
    await page.getByRole("link", { name: "Authorized trial view", exact: true }).click(); await page.getByRole("heading", { name: "No trial recipe instructions available", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.ok(mutationPaths.every(p => p.startsWith("/kitchen/recipes/"))); assert.equal(mutationPaths.length, 4); assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}px: published/privacy, exact pinned links, kitchen trial, approval, publish, history/diff/restore, print states, no stock mutations`);
    await context.close();
  }
  console.log(`Workflow visual outputs: ${output}; all APIs mocked.`);
} finally { await browser.close(); }
