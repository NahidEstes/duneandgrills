"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/src/context/AuthContext.jsx";
import { previewProduction, confirmProduction, findProductionRequest } from "@/src/api/inventoryApi.js";
import { submitPersisted, pendingSubmission, submissionStorageKey } from "@/src/utils/persistedSubmission.js";
import { usePageFormChanges } from "../ui/useDialogChanges.js";
import DeliveryDialog from "../admin/delivery/DeliveryDialog.jsx";
import DarkSelect from "../ui/DarkSelect.jsx";
import DarkDatePicker from "../ui/DarkDatePicker.jsx";
import { preparationQuantityLabel as formatQuantity, preparationUnits } from "@/src/utils/preparationUnits.js";
import { Badge, Button, Field, PageHeader, cardClass, inputClass, textareaClass } from "./InventoryUI.jsx";
import { apiErrorMessage, formatSar } from "./inventoryUtils.js";
import ProductionYieldEvidence from "./ProductionYieldEvidence.jsx";
import { preparationSequence } from "@/src/utils/preparationWorkflow.js";
import usePreparationAvailability from "./usePreparationAvailability.js";
import { PreparationSequence, IngredientAvailability, RecipeDefinitionDialog } from "./PreparationWorkflowUI.jsx";
import { ProductionStockImpact, ProductionSources } from "./ProductionStockReview.jsx";
import ProductionDetails from "./ProductionDetails.jsx";
import { plannedRecipeValues, planningBaseQuantity, formOutputVariance } from "@/src/utils/productionPlanning.js";
import { RecipeActionBar, RecipeSectionHeader } from "./RecipeLayout.jsx";

const riyadhInput = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 16);
function initialPreparationValues(recipe, items) {
  try { return plannedRecipeValues(recipe, 1, items); }
  catch { return { recipe: recipe._id, expectedVersion: recipe.version, multiplier: "1", actualQuantity: String(recipe.outputQuantity), outputUnit: recipe.outputUnit, ingredients: recipe.ingredients.map(row => ({ inventoryItem: String(row.inventoryItem), quantity: String(row.enteredQuantity ?? ""), unit: row.enteredUnit })) }; }
}
export default function ProductionForm({ recipes, items, varianceThreshold = 10, blocked, onCancel, onSaved, initialState = null, initialRecipe = null, suggestedTarget = null, nested = false, onSuspend }) {
  const { user } = useAuth(), root = useRef(null), lock = useRef(false), requestKey = useRef(null);
  const [draft, setDraft] = useState(() => ({ recipe: "", multiplier: "1", actualQuantity: "", outputUnit: "", ingredients: [], preparedAt: riyadhInput(), expiryDate: "", notes: "", yieldExplanation: "", ...(initialRecipe ? initialPreparationValues(initialRecipe, items) : {}), ...initialState?.draft }));
  const [plan, setPlan] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [open, setOpen] = useState(false), [pending, setPending] = useState(null), [online, setOnline] = useState(true);
  const [storageReady, setStorageReady] = useState(false);
  const [planMode, setPlanMode] = useState(initialState?.planMode ?? (suggestedTarget ? "target" : "multiplier")), [targetQuantity, setTargetQuantity] = useState(initialState?.targetQuantity ?? String(suggestedTarget?.quantity ?? "")), [targetUnit, setTargetUnit] = useState(initialState?.targetUnit ?? suggestedTarget?.unit ?? "");
  const [attempted, setAttempted] = useState(false), [sourceId, setSourceId] = useState(null), [viewRecipe, setViewRecipe] = useState(null);
  const [checkedThreshold, setCheckedThreshold] = useState(null);
  const storageKey = submissionStorageKey("production", user?._id || user?.id);
  const guard = usePageFormChanges({ open: true, rootRef: root, retainedDirty: Boolean(initialState), onClose: () => { if (nested && (pending || attempted)) { setError("Check or complete the retained confirmation before leaving this production step."); return; } if (!pending && !attempted) sessionStorage.removeItem(storageKey + ":key"); onCancel(); }, resetKey: storageKey });
  useEffect(() => {
    setStorageReady(false);
    try {
      const old = pendingSubmission(sessionStorage, storageKey);
      requestKey.current = old?.idempotencyKey || sessionStorage.getItem(storageKey + ":key") || crypto.randomUUID();
      sessionStorage.setItem(storageKey + ":key", requestKey.current);
      if (old) sessionStorage.setItem(storageKey + ":attempted", requestKey.current);
      setPending(old); setAttempted(Boolean(old) || sessionStorage.getItem(storageKey + ":attempted") === requestKey.current); setStorageReady(true);
    } catch (failure) { setError(failure.message); }
    const update = () => setOnline(navigator.onLine); update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, [storageKey]);
  const recipe = recipes.find(row => row._id === draft.recipe), itemFor = id => items.find(item => item._id === id);
  const finished = itemFor(recipe?.finishedItem);
  const sequence = preparationSequence(recipe, recipes, items);
  const availability = usePreparationAvailability(draft.ingredients, sequence.nodes);
  const suspend = (upstream, stock) => {
    if (busy || blocked || !online || !storageReady || pending || attempted || !availability.fresh || !onSuspend) return;
    try { sessionStorage.removeItem(storageKey + ":key"); onSuspend({ draft, planMode, targetQuantity, targetUnit }, upstream, stock); } catch (failure) { setError(failure.message); }
  };
  const variance = plan?.variance || formOutputVariance(draft, recipe, finished, checkedThreshold ?? varianceThreshold);
  const unappliedTarget = planMode === "target" && (draft.targetQuantity !== targetQuantity || draft.targetUnit !== targetUnit || !targetQuantity);
  const edit = values => { setDraft(current => ({ ...current, ...values })); setPlan(null); setError(""); };
  const changePlan = (selected, multiplier, target = {}) => {
    try {
      const next = plannedRecipeValues(selected, multiplier, items);
      const previous = recipe && Number(draft.multiplier) > 0 ? plannedRecipeValues(recipe, draft.multiplier, items) : null;
      const changedActuals = previous && (Number(previous.actualQuantity) !== Number(draft.actualQuantity) || previous.outputUnit !== draft.outputUnit || JSON.stringify(previous.ingredients) !== JSON.stringify(draft.ingredients));
      if (changedActuals && !window.confirm("Applying this plan resets your actual ingredient and finished quantities to the expected values. Continue?")) return false;
      edit({ ...next, targetQuantity: undefined, targetUnit: undefined, ...target });
      return true;
    } catch (failure) { setError(failure.message); return false; }
  };
  const applyTarget = () => {
    try {
      const base = planningBaseQuantity(targetQuantity, targetUnit, finished);
      changePlan(recipe, base / recipe.expectedQuantity, { targetQuantity, targetUnit });
    } catch (failure) { setError(failure.message); }
  };
  const payload = () => ({ ...draft, preparedAt: new Date(draft.preparedAt + ":00+03:00").toISOString(), expiryDate: draft.expiryDate ? draft.expiryDate + "T12:00:00+03:00" : null });
  const review = async event => {
    event.preventDefault(); if (lock.current || blocked || !online || pending || !storageReady || unappliedTarget) return;
    lock.current = true; setBusy(true); setError("");
    try { const next = await previewProduction(payload()); setPlan(next); setCheckedThreshold(next.variance?.thresholdPercent ?? null); if (next.variance?.requiresExplanation && !draft.yieldExplanation.trim()) setError("Yield explanation is required for this output variance. Enter a reason and review again."); else if (next.canConfirm) setOpen(true); else setError("Insufficient usable stock. Review the ingredient availability below."); }
    catch (failure) { setError(apiErrorMessage(failure)); }
    finally { lock.current = false; setBusy(false); }
  };
  const success = record => {
    // A cleanup failure cannot turn a confirmed stock posting into a failed one.
    // Retained exact requests remain recoverable on the next opening.
    try { sessionStorage.removeItem(storageKey + ":key"); sessionStorage.removeItem(storageKey); sessionStorage.removeItem(storageKey + ":attempted"); } catch { setStorageReady(false); }
    onSaved(record._id);
  };
  const submit = async () => {
    if (lock.current || !online || blocked || !storageReady || (!pending && !plan?.canConfirm) || !requestKey.current) return;
    lock.current = true; setBusy(true); setError("");
    try { sessionStorage.setItem(storageKey + ":attempted", requestKey.current); setAttempted(true); success(await submitPersisted({ storage: sessionStorage, key: storageKey, payload: { ...payload(), previewFingerprint: plan?.fingerprint }, createKey: () => requestKey.current, send: confirmProduction })); }
    catch (failure) { setError(apiErrorMessage(failure)); try { setPending(pendingSubmission(sessionStorage, storageKey)); } catch { setStorageReady(false); } }
    finally { lock.current = false; setBusy(false); }
  };
  const recover = async () => {
    if (lock.current) return; lock.current = true; setBusy(true);
    try { const saved = await findProductionRequest(requestKey.current); if (saved) success(saved); else setError("No saved result found yet. Retry the exact confirmation or review again using the retained request key. A new duplicate request will not be created."); }
    catch (failure) { setError(apiErrorMessage(failure)); } finally { lock.current = false; setBusy(false); }
  };
  return <div ref={root} {...guard.capture}>
    <PageHeader descriptionClassName="!text-neutral-400" title="Record Production" description="Record ingredients used and actual output. Review stock changes before confirming. Dates and times use Asia/Riyadh."/>

    <PreparationSequence sequence={sequence} availability={availability} currentItem={recipe?.finishedItem}/>
    {initialState && <p role="status" className="mb-3 text-sm text-emerald-300">Draft retained. Usable stock is being refreshed; review again before confirming.</p>}
    {recipe && Number(draft.expectedVersion) !== recipe.version && <p role="alert" className="mb-3 text-amber-200">This recipe changed while the draft was retained. Select the recipe again to review its current quantities.</p>}
    {availability.error && <p role="alert" className="mb-3 text-red-200">{availability.error} <Button variant="ghost" onClick={availability.reload}>Refresh usable stock</Button></p>}
    {attempted && !pending && <p className="mb-3 text-xs text-amber-200">The request key is retained for safe retries. Complete or check this production before opening another step.</p>}
    {!storageReady && <p role="alert" className="mb-4 text-sm text-amber-200">Safe request storage is unavailable. Enable session storage and reopen this form before confirming production.</p>}
    {!recipes.some(row => row.isActive) && <p className="mb-4 text-sm text-neutral-300">No active preparation recipes. <Link className="text-dune-amber underline" href="/inventory/preparation-recipes">Manage preparation recipes</Link> before recording production.</p>}
    {!online && <p role="alert" className="mb-4 text-amber-200">Offline. Production cannot be previewed or confirmed.</p>}
    {pending && <aside className={`${cardClass} mb-5 space-y-3 p-4`}><h2 className="font-body font-semibold text-amber-200">Confirmation outcome needs checking</h2><p className="text-sm text-neutral-300">Your exact confirmation and request key were retained. Do not record this batch again with a new key.</p><div className="flex flex-wrap gap-2"><Button disabled={busy || !online} onClick={recover}>Check saved result</Button><Button variant="secondary" disabled={busy || !online} onClick={() => setOpen(true)}>Retry exact confirmation</Button><Button variant="secondary" disabled={busy} onClick={() => { sessionStorage.removeItem(storageKey); setPending(null); setPlan(null); setOpen(false); setError("Review again with the same retained request key. If a prior request succeeded, check its saved result."); }}>Review again with same key</Button></div></aside>}
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-500/5 p-4 text-sm text-red-200">{error}</p>}
    <form onSubmit={review} aria-busy={busy} className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className={`${cardClass} min-w-0 space-y-5 p-4 sm:p-6`}><fieldset disabled={busy || blocked || Boolean(pending)} className="min-w-0 space-y-6">
        <section className="min-w-0 space-y-4"><RecipeSectionHeader level={2} number="1" title="Choose recipe" description="Select the preparation and plan the number of batches or a target output."/>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Preparation recipe"><DarkSelect aria-label="Preparation recipe" required className={inputClass} value={draft.recipe} onChange={event => { if (changePlan(recipes.find(row => row._id === event.target.value), "1")) { setPlanMode("multiplier"); setTargetQuantity(""); setTargetUnit(""); } }}><option value="">Select preparation</option>{recipes.filter(row => row.isActive).map(row => <option key={row._id} value={row._id}>{row.name} · v{row.version}</option>)}</DarkSelect></Field><Field label="Batch multiplier" hint={planMode === "target" ? "Calculated from the applied target output." : "Changing this resets actual quantities to expected values; edited actuals require confirmation."}><input required disabled={planMode === "target"} type="number" step="any" min="0.000001" inputMode="decimal" className={inputClass} value={draft.multiplier} onChange={event => { if (!event.target.value || Number(event.target.value) <= 0) edit({ multiplier: event.target.value }); else changePlan(recipe, event.target.value); }}/></Field></div>
        {recipe && <section className="space-y-3 rounded-xl border border-white/10 p-4">{suggestedTarget && <><p className="text-sm text-neutral-300">Downstream shortage: {formatQuantity(suggestedTarget.quantity, suggestedTarget.unit)}. Review a target or choose one full batch.</p><Button variant="secondary" onClick={() => { if (changePlan(recipe, "1")) { setPlanMode("multiplier"); setTargetQuantity(""); setTargetUnit(""); } }}>Use one full batch</Button></>}<Field label="Plan production by"><DarkSelect aria-label="Plan production by" className={inputClass} value={planMode} onChange={event => { setPlanMode(event.target.value); if (event.target.value === "multiplier") edit({ targetQuantity: undefined, targetUnit: undefined }); else if (!targetUnit) setTargetUnit(recipe.outputUnit); }}><option value="multiplier">Batch multiplier</option><option value="target">Target output quantity</option></DarkSelect></Field>
          {planMode === "target" && <><div className="grid grid-cols-[minmax(0,1fr)_90px] gap-3"><Field label="Planned target output"><input type="number" inputMode="decimal" min="0.000001" max="1000000000" step="any" className={inputClass} value={targetQuantity} onChange={event => setTargetQuantity(event.target.value)}/></Field><Field label="Target unit"><DarkSelect aria-label="Target unit" className={inputClass} value={targetUnit} onChange={event => setTargetUnit(event.target.value)}>{finished && preparationUnits(finished).map(unit => <option key={unit}>{unit}</option>)}</DarkSelect></Field></div><Button variant="secondary" onClick={applyTarget}>Apply target</Button><p role="status" className="text-xs text-neutral-300">{unappliedTarget ? "Apply the target before reviewing production. Applying resets actual quantities to expected values." : `Applied target: ${formatQuantity(draft.targetQuantity, draft.targetUnit)}. Enter the actual usable output separately below.`}</p></>}
        </section>}
        {recipe && <section className="rounded-xl border border-blue-400/25 bg-blue-400/5 p-4"><h3 className="font-body font-semibold text-blue-100">Preparation notes · v{recipe.version}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm text-neutral-200">{recipe.notes?.trim() || "No preparation notes have been recorded for this recipe."}</p></section>}
        <p className="text-sm text-neutral-300">Expected yield: {recipe ? `${formatQuantity(recipe.outputQuantity * Number(draft.multiplier || 0))} ${recipe.outputUnit}` : "Select a recipe"}</p>

        </section>
        <section aria-label="Ingredient stock availability" className="min-w-0 space-y-3"><RecipeSectionHeader level={2} number="2" title="Ingredients used" description="Compare the expected amount with what you actually used. Quantities below are for this production."/>{draft.ingredients.map((line, index) => <div key={line.inventoryItem} className="grid min-w-0 grid-cols-[minmax(0,1fr)_90px] gap-3 rounded-xl border border-white/10 bg-black/15 p-3 sm:grid-cols-[minmax(0,1fr)_120px_80px] sm:p-4"><div className="col-span-2 sm:col-span-1"><p className="break-words text-sm font-semibold text-white">{itemFor(line.inventoryItem)?.name || "Unavailable ingredient"}</p><p className="mt-1 text-xs text-neutral-400">Expected: {formatQuantity((recipe?.ingredients[index]?.quantity || 0) * Number(draft.multiplier || 0))} {itemFor(line.inventoryItem)?.unit}</p></div><Field label={`Actual quantity ${index + 1}`}><input required type="number" min="0.000001" step="any" inputMode="decimal" className={inputClass} value={line.quantity} onChange={event => edit({ ingredients: draft.ingredients.map((row, offset) => offset === index ? { ...row, quantity: event.target.value } : row) })}/></Field><Field label={`Unit ${index + 1}`}><DarkSelect aria-label={`Unit ${index + 1}`} className={inputClass} value={line.unit} onChange={event => edit({ ingredients: draft.ingredients.map((row, offset) => offset === index ? { ...row, unit: event.target.value } : row) })}>{itemFor(line.inventoryItem) && preparationUnits(itemFor(line.inventoryItem)).map(unit => <option key={unit}>{unit}</option>)}</DarkSelect></Field><div className="col-span-2 border-t border-white/5 pt-3 sm:col-span-3"><IngredientAvailability stock={availability.data.find(row => row.inventoryItem === line.inventoryItem)} fresh={availability.fresh} recipe={recipes.find(row => String(row.finishedItem) === line.inventoryItem)} disabled={busy || blocked || pending || attempted || !online || !storageReady} onProduce={suspend} onViewRecipe={setViewRecipe}/></div></div>)}<Button variant="ghost" onClick={availability.reload}>Refresh usable stock</Button></section>

        <section className="min-w-0 space-y-4 border-t border-white/10 pt-5"><RecipeSectionHeader level={2} number="3" title="Actual output" description="Record the finished quantity you can use, the preparation date and any expiry date."/>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Actual usable finished quantity"><input required type="number" min="0.000001" step="any" inputMode="decimal" className={inputClass} value={draft.actualQuantity} onChange={event => edit({ actualQuantity: event.target.value })}/></Field><Field label="Output unit"><DarkSelect aria-label="Output unit" required className={inputClass} value={draft.outputUnit} onChange={event => edit({ outputUnit: event.target.value })}><option value="">Select unit</option>{finished && preparationUnits(finished).map(unit => <option key={unit}>{unit}</option>)}</DarkSelect></Field><Field label="Prepared on (Asia/Riyadh)"><input required type="datetime-local" className={inputClass} value={draft.preparedAt} onChange={event => edit({ preparedAt: event.target.value })}/></Field><Field label={finished?.tracksExpiry ? "Use by (required)" : "Use by (not expiry-tracked)"}><DarkDatePicker disabled={!finished?.tracksExpiry} aria-label="Use by" value={draft.expiryDate} onChange={event => edit({ expiryDate: event.target.value })}/></Field></div>
        {variance && <p role="status" className={`rounded-xl border p-3 text-sm ${variance.requiresExplanation ? "border-amber-400/40 text-amber-200" : "border-white/10 text-neutral-300"}`}>Output variance: {Math.abs(variance.percent).toFixed(2)}% {variance.direction === "on_target" ? "(on target)" : `${variance.direction} expected`}. Explanation required above ±{variance.thresholdPercent}%. {variance.requiresExplanation && "Enter a yield explanation before confirming."}</p>}
        <Field label={variance?.requiresExplanation ? "Yield explanation (required)" : "Yield explanation (optional)"}><textarea aria-label={variance?.requiresExplanation ? "Yield explanation (required)" : "Yield explanation (optional)"} required={Boolean(variance?.requiresExplanation)} maxLength={500} className={textareaClass} value={draft.yieldExplanation} onChange={event => edit({ yieldExplanation: event.target.value })}/></Field>
        <p className="text-xs leading-5 text-neutral-400">Explain output below expected, for example extra trimming, damaged raw material or a preparation mistake. This explanation is saved with the batch; it does not create another Waste entry.</p>
        <Field label="Notes (optional)"><textarea aria-label="Notes (optional)" maxLength={2000} className={textareaClass} value={draft.notes} onChange={event => edit({ notes: event.target.value })}/></Field>
        </section>
      </fieldset></div>
      <aside className={`${cardClass} min-w-0 space-y-4 p-4 sm:p-5`}><RecipeSectionHeader level={2} number="4" title="Stock Change Preview" description="Review ingredient deductions and finished stock additions."/>{!plan ? <p className="text-sm leading-6 text-neutral-400">Enter actual quantities and review stock changes. Preview and drafts do not change stock. Availability and costs are checked by the server.</p> : <><h3 className="font-body text-sm font-semibold">Raw or prepared ingredients</h3>{plan.ingredients.map(line => <div key={line.inventoryItem} className="space-y-1 border-b border-white/10 pb-3 text-sm"><div className="flex justify-between gap-2"><span>{line.name}</span><span className="whitespace-nowrap text-dune-amber">−{formatQuantity(line.quantity)} {line.unit}</span></div><Badge tone={line.sufficient ? "success" : "danger"}>{line.sufficient ? "Stock available" : "Insufficient usable stock"}</Badge><p className="text-xs text-neutral-400">Usable: {formatQuantity(line.available)} {line.unit}</p></div>)}<div className="flex justify-between gap-2 font-semibold text-emerald-300"><span>{plan.finishedName}</span><span>+{formatQuantity(plan.actualQuantity)} {plan.unit}</span></div><p className="text-sm text-amber-200">Yield difference: {formatQuantity(plan.yieldDifference)} {plan.unit} vs expected. No additional stock deduction.</p><p className="text-sm text-neutral-300">Transferred cost: {formatSar(plan.totalCost)}<br/>Finished unit cost: SAR {plan.unitCost} / {plan.unit}</p>{plan.totalCost === 0 && <p className="text-xs text-amber-200">Recorded ingredient costs are zero. Review source costs before interpreting profit.</p>}</>}{plan && <div className="border-t border-white/10 pt-4"><ProductionStockImpact plan={plan}/></div>}<p className="border-t border-white/10 pt-4 text-xs leading-6 text-neutral-400">Ingredients are deducted once, only after confirmation succeeds. This creates no purchase, expense or payment.</p></aside>
      <RecipeActionBar className="xl:col-span-2"><p className="max-w-sm text-xs leading-5 text-neutral-300">Review first. Stock changes only after successful confirmation.</p><div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" disabled={busy} onClick={guard.requestClose}>Cancel</Button><Button type="submit" disabled={busy || blocked || !online || !storageReady || Boolean(pending) || unappliedTarget}>{busy ? "Checking…" : "Review & confirm production"}</Button></div></RecipeActionBar>
    </form>
    {plan && <section className="mt-5"><div className={`${cardClass} p-4`}><ProductionSources sources={plan.ingredientSources} preview onViewSource={setSourceId}/></div></section>}
    {sourceId && <ProductionDetails id={sourceId} onClose={() => setSourceId(null)} onChanged={() => { setPlan(null); setOpen(false); availability.reload(); }}/>}
    {viewRecipe && <RecipeDefinitionDialog recipe={viewRecipe} items={items} onClose={() => setViewRecipe(null)}/>}
    {plan && <div className="mt-5"><ProductionYieldEvidence evidence={plan.yield} preview/></div>}
    <DeliveryDialog open={open} onClose={() => setOpen(false)} title="Confirm production" centered busy={busy}>
      <p className="text-sm text-neutral-200">{pending ? "Retry the exact retained production confirmation? Its original recipe, quantities and request key will be used." : `Produce ${formatQuantity(plan?.actualQuantity)} ${plan?.unit || ""} of ${plan?.finishedName || ""}?`}</p><p className="text-sm text-neutral-400">Actual ingredients will be deducted and the finished batch added atomically. Confirm only after preparing the usable finished stock.</p>
      {!pending && plan && <><ProductionStockImpact plan={plan}/><ProductionSources sources={plan.ingredientSources} preview onViewSource={setSourceId}/></>}
      {!pending && plan?.yield && <p className="text-sm text-neutral-200">Total preparation loss: {formatQuantity(plan.yield.lossQuantity, plan.unit)}. {!plan.yield.comparable && plan.yield.unavailableReason} No additional stock deduction.</p>}
      {!pending && plan?.yield?.outputShortfallQuantity > 0 && <p className="text-sm text-amber-200">Output below expected: {formatQuantity(plan.yield.outputShortfallQuantity, plan.unit)}. Yield explanation: {draft.yieldExplanation.trim() || "Not recorded"}. Review these quantities before confirming.</p>}
      {!pending && plan?.variance && <p className="text-sm text-amber-200">Output variance: {Math.abs(plan.variance.percent).toFixed(2)}% {plan.variance.direction === "on_target" ? "(on target)" : `${plan.variance.direction} expected`} · Threshold: ±{plan.variance.thresholdPercent}%. {plan.variance.requiresExplanation && `Explanation: ${draft.yieldExplanation.trim() || "Required"}`}</p>}
      {error && <p role="alert" className="text-sm text-red-200">{error}</p>}<Button className="w-full min-h-12" disabled={busy || !online || blocked || !storageReady} onClick={submit}>{busy ? "Confirming…" : "Confirm production"}</Button><Button className="w-full" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Go back</Button>
    </DeliveryDialog>
  </div>;
}
