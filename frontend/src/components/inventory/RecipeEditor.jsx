"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchInventoryRecipe, fetchAddOnInventoryRecipe, updateInventoryRecipe, updateAddOnInventoryRecipe, previewSellingRecipe, fetchPreparationOptions } from "@/src/api/inventoryApi.js";
import { useAuth } from "@/src/context/AuthContext.jsx";
import { usePageFormChanges } from "../ui/useDialogChanges.js";
import DeliveryDialog from "../admin/delivery/DeliveryDialog.jsx";
import { Badge, Button, EmptyState, Field, LoadingState, cardClass, inputClass, textareaClass } from "./InventoryUI.jsx";
import InventoryItemPicker from "./InventoryItemPicker.jsx";
import ProductionWorkspace from "./ProductionWorkspace.jsx";
import { RecipeDefinitionDialog } from "./PreparationWorkflowUI.jsx";
import { SellingRecipeHistory, CopySellingRecipe, RecipeSnapshot } from "./SellingRecipeDialogs.jsx";
import { draftFromRecipe, draftEqual, formatReferenceCost as money } from "./sellingRecipeUtils.js";
import { apiErrorMessage } from "./inventoryUtils.js";
import { preparationUnits, preparationQuantityLabel as q } from "@/src/utils/preparationUnits.js";

const blank = { doNotTrack: false, isActive: true, ingredients: [] };
export default function RecipeEditor({ kind, id, gateRef, onSaved }) {
  const { user } = useAuth(), root = useRef(null), lock = useRef(false), onSavedRef = useRef(onSaved);
  const canWrite = ["admin", "manager", "inventory", "storekeeper"].includes(user?.role), canHistory = ["admin", "manager"].includes(user?.role);
  const [record, setRecord] = useState(null), [draft, setDraft] = useState(blank), [baseline, setBaseline] = useState(blank), [items, setItems] = useState({});
  const [loadError, setLoadError] = useState(""), [loading, setLoading] = useState(true), [reload, setReload] = useState(0), [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState(""), [uncertain, setUncertain] = useState(false), [latest, setLatest] = useState(null);
  const [portions, setPortions] = useState("1"), [review, setReview] = useState({ key: "", data: null, error: "", loading: false });
  const [dialog, setDialog] = useState(""), [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [workflow, setWorkflow] = useState(null), [viewRecipe, setViewRecipe] = useState(null), [opening, setOpening] = useState(false);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine); update();
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  const dirty = !draftEqual(draft, baseline);
  const guard = usePageFormChanges({ open: !!record, rootRef: root, retainedDirty: dirty, resetKey: record?.recipeRevision, onClose: () => undefined });
  const { confirmDiscard } = guard;
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);
  useEffect(() => { gateRef.current = () => !lock.current && !workflow && confirmDiscard(); return () => { gateRef.current = null; }; }, [gateRef, confirmDiscard, workflow]);
  useEffect(() => {
    const controller = new AbortController(); let current = true; setLoading(true); setLoadError("");
    (kind === "menu" ? fetchInventoryRecipe : fetchAddOnInventoryRecipe)(id, { signal: controller.signal }).then(value => {
      if (!current) return;
      const next = draftFromRecipe(value, kind); setRecord(value); setDraft(next); setBaseline(next);
      setItems(Object.fromEntries((value.recipe?.ingredients || []).filter(line => line.inventoryItem?._id).map(line => [line.inventoryItem._id, line.inventoryItem])));
      setSaveError(""); setUncertain(false);
    }).catch(error => { if (current) setLoadError(apiErrorMessage(error)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [kind, id, reload]);
  const previewKey = JSON.stringify([draft, portions, revision, online]);
  useEffect(() => {
    if (!record) return;
    const controller = new AbortController(); let current = true;
    if (!online) { setReview({ key: previewKey, data: null, error: "Offline. Reconnect and refresh the review before saving or producing.", loading: false }); return () => controller.abort(); }
    const complete = draft.doNotTrack || draft.ingredients.length > 0 && draft.ingredients.every(line => line.inventoryItem && Number(line.quantity) > 0 && line.enteredUnit);
    setReview({ key: previewKey, data: null, error: complete ? "" : "Choose ingredients and positive quantities to review this draft.", loading: complete });
    if (!complete) return () => controller.abort();
    const timer = setTimeout(() => previewSellingRecipe({ ...draft, kind, id, portions }, { signal: controller.signal }).then(data => { if (current) setReview({ key: previewKey, data, error: "", loading: false }); }).catch(error => { if (current) setReview({ key: previewKey, data: null, error: apiErrorMessage(error), loading: false }); }), 300);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [previewKey, draft, portions, revision, record, kind, id, online]);
  const fresh = review.key === previewKey && !review.loading && !review.error && !!review.data, data = fresh ? review.data : null;
  const edit = values => setDraft(current => ({ ...current, ...values }));
  const changeLine = (index, values) => setDraft(current => ({ ...current, ingredients: current.ingredients.map((line, offset) => offset === index ? { ...line, ...values } : line) }));
  const remember = item => { if (item?._id) setItems(current => current[item._id] === item ? current : { ...current, [item._id]: item }); };
  const accept = value => {
    const next = draftFromRecipe(value, kind); setRecord(value); setDraft(next); setBaseline(next); setRevision(value => value + 1); setUncertain(false); setSaveError("");
    setItems(current => ({ ...current, ...Object.fromEntries((value.recipe?.ingredients || []).filter(line => line.inventoryItem?._id).map(line => [line.inventoryItem._id, line.inventoryItem])) }));
  };
  const save = async (confirmDoNotTrack = false) => {
    if (lock.current || !record || !dirty || !fresh || !canWrite || uncertain || !navigator.onLine) return;
    if (draft.doNotTrack && !record.recipe?.doNotTrack && !confirmDoNotTrack) { setDialog("tracking"); return; }
    lock.current = true; setSaving(true); setSaveError("");
    try {
      const result = await (kind === "menu" ? updateInventoryRecipe : updateAddOnInventoryRecipe)(id, { ...draft, expectedRevision: record.recipeRevision, confirmDoNotTrack, reason: confirmDoNotTrack ? reason : undefined });
      accept(result); setDialog(""); setReason(""); setConfirmed(false); toast.success("Recipe saved. Stock and historical order costs are unchanged.");
      Promise.resolve().then(() => onSavedRef.current?.()).catch(() => toast.warning("Recipe saved. The recipe list could not refresh; retry the list."));
    } catch (error) {
      setSaveError(apiErrorMessage(error)); if (!error.response || error.response.status === 409 || error.response.status >= 500) setUncertain(true);
    } finally { lock.current = false; setSaving(false); }
  };
  const inspectLatest = async () => {
    if (lock.current) return; lock.current = true; setOpening(true);
    try { setLatest(await (kind === "menu" ? fetchInventoryRecipe : fetchAddOnInventoryRecipe)(id)); setDialog("latest"); }
    catch (error) { setSaveError(apiErrorMessage(error)); }
    finally { lock.current = false; setOpening(false); }
  };
  const openPreparation = async (stock, produce) => {
    if (lock.current || opening || !stock.preparation || !fresh) return; lock.current = true; setOpening(true);
    try {
      const options = await fetchPreparationOptions(), recipe = options.recipes.find(row => row._id === stock.preparation._id);
      if (!recipe) throw Error("Preparation recipe is no longer available. Refresh the stock review.");
      if (produce) {
        if (!recipe.isActive || !options.canWrite || !canWrite || !(stock.shortage > 0)) throw Error("Review an active preparation and a positive shortage before producing.");
        setWorkflow({ options, recipe, stock });
      } else setViewRecipe({ options, recipe });
    } catch (error) { toast.error(apiErrorMessage(error)); }
    finally { lock.current = false; setOpening(false); }
  };
  if (loading) return <LoadingState label="Loading selected recipe…"/>;
  if (loadError) return <EmptyState title="Selected recipe unavailable" description={loadError} action={<Button onClick={() => setReload(value => value + 1)}>Retry selected recipe</Button>}/>;
  if (!record) return null;
  return <>
    <div ref={root} className={"min-w-0 space-y-4 " + (workflow ? "hidden" : "")}>
      <form aria-label="Recipe editor" aria-busy={saving || !!workflow} onSubmit={event => { event.preventDefault(); save(); }} className={cardClass + " min-w-0 space-y-5 p-4 sm:p-5"}>
        <header className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="break-words font-body text-xl font-semibold text-white">{record.name}</h2><Badge tone={dirty ? "warning" : "success"}>{dirty ? "Unsaved draft" : "Saved version"}</Badge></div>
          <p className="text-sm text-neutral-300">Selling price {money(record.price)} · quantities per {kind === "menu" ? "menu sale" : "add-on"}</p>
          <p className="break-all text-xs text-neutral-400">Saved revision: {record.recipeRevision || "No recipe yet"}</p>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={!canWrite || saving} onClick={() => setDialog("copy")}>Copy from recipe</Button>{canHistory && <Button variant="secondary" disabled={saving} onClick={() => setDialog("history")}>View history</Button>}<Button variant="ghost" disabled={saving || opening} onClick={inspectLatest}>Review saved version</Button></div>
        </header>
        {record.recipeStatus === "not_configured" && <p role="status" className="rounded-xl border border-amber-400/25 p-3 text-sm text-amber-200">Saved recipe: Sales blocked: {record.recipeIssue || "Missing valid recipe"}. Review and save an active mapping or an explicit Do Not Track exclusion.</p>}
        {!canWrite && <p className="text-sm text-amber-200">Read-only access. Recipe changes and production require inventory write permission.</p>}
        <fieldset disabled={!canWrite || saving} className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-4 text-sm text-neutral-200"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.doNotTrack} onChange={event => edit({ doNotTrack: event.target.checked })}/>Do not track inventory</label><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.isActive} onChange={event => edit({ isActive: event.target.checked })}/>Recipe active</label></div>
          {draft.doNotTrack ? <p className="rounded-xl border border-violet-400/30 p-4 text-sm text-violet-200">Saving Do Not Track clears the ingredient mapping and excludes stock deductions. Draft ingredients are retained until you save. Available portions and verified ingredient margin are unavailable.</p> : <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-white">Ingredients</h3><Button variant="secondary" disabled={draft.ingredients.length >= 100} onClick={() => edit({ ingredients: [...draft.ingredients, { inventoryItem: "", quantity: "", enteredUnit: "", isActive: true }] })}>Add ingredient</Button></div>
            <p className="text-xs text-neutral-300">Enter a compatible metric or configured purchase unit. The server converts to the inventory base unit, rounded to 6 decimals (0.000001–1,000,000,000).</p>
            {draft.ingredients.map((line, index) => {
              const item = items[line.inventoryItem], normalized = data?.normalizedIngredients[index], cost = data?.metrics.lines[index];
              const choices = item ? preparationUnits(item) : [line.enteredUnit].filter(Boolean);
              return <section key={index} aria-label={"Ingredient " + (index + 1)} className="min-w-0 space-y-3 rounded-xl border border-white/15 bg-black/15 p-3">
                <InventoryItemPicker recipeTypes retainInactive value={line.inventoryItem} label={"Inventory item " + (index + 1)} excludedIds={draft.ingredients.filter((_, offset) => offset !== index).map(row => row.inventoryItem)} onResolved={remember} onChange={(value, item) => { remember(item); if (value !== line.inventoryItem) changeLine(index, { inventoryItem: value, enteredUnit: item.unit }); }}/>
                {!line.inventoryItem && baseline.ingredients[index]?.quantity && !baseline.ingredients[index]?.inventoryItem && <p role="alert" className="text-xs text-amber-200">Saved inventory ingredient is unavailable. Replace or remove this row before saving.</p>}
                <div className="grid gap-3 sm:grid-cols-2"><Field label={"Quantity per " + (kind === "menu" ? "sale " : "add-on ") + (index + 1)}><input required type="number" min="0" max="1000000000" step="any" className={inputClass} value={line.quantity} onChange={event => changeLine(index, { quantity: event.target.value })}/></Field><Field label={"Entered unit " + (index + 1)}><select required className={inputClass} value={line.enteredUnit} onChange={event => changeLine(index, { enteredUnit: event.target.value })}><option value="">Choose unit</option>{[...new Set([...choices, line.enteredUnit].filter(Boolean))].map(unit => <option key={unit} value={unit}>{unit}{!choices.includes(unit) ? " (no longer compatible)" : ""}</option>)}</select></Field></div>
                <p className="text-xs text-neutral-300">Base consumption: {normalized ? q(normalized[kind === "menu" ? "quantityPerSale" : "quantityPerAddOn"], normalized.unit) : "Awaiting server review"} · Reference line cost: {money(cost?.ingredientCostPerDish)} {line.isActive === false ? "(excluded)" : ""}</p>
                <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex min-h-11 items-center gap-2 text-sm text-neutral-200"><input type="checkbox" checked={line.isActive} onChange={event => changeLine(index, { isActive: event.target.checked })}/>Ingredient active</label><Button variant="danger" aria-label={"Remove ingredient " + (index + 1)} onClick={() => edit({ ingredients: draft.ingredients.filter((_, offset) => offset !== index) })}>Remove</Button></div>
              </section>;
            })}
            {!draft.ingredients.length && <p className="text-sm text-neutral-300">Add an ingredient to start this recipe.</p>}
          </section>}
        </fieldset>
        <section data-draft-ignore aria-label="Stock planner" className="space-y-3 border-t border-white/15 pt-4"><div className="flex flex-wrap items-end gap-3"><Field label="Plan portions"><input type="number" min="1" max="1000000" step="1" className={inputClass} value={portions} onChange={event => setPortions(event.target.value)}/></Field><Button variant="secondary" disabled={saving} onClick={() => setRevision(value => value + 1)}>Refresh stock review</Button></div>
          <p className="text-xs text-neutral-300">{kind === "menu" ? "Menu-only availability. Add-ons are reviewed separately in Add-on Recipes; their shared stock is not reserved by this planner." : "Add-on-only availability."} Draft calculations do not reserve or deduct stock. Availability can change before a sale.</p>
          {review.loading || review.key !== previewKey ? <p role="status" className="text-sm text-neutral-300">Reviewing draft and usable stock…</p> : review.error ? <p role="alert" className="text-sm text-amber-200">{review.error}</p> : null}
          {data && <><p className="text-sm font-medium text-white">Available portions: {data.portionsAvailable == null ? "Unavailable" : q(data.portionsAvailable)}{data.limitingIngredients.length ? " · Limiting: " + data.limitingIngredients.join(", ") : ""}</p>{data.issue && <p className="text-sm text-amber-200">Sales blocked: {data.issue}</p>}{data.recipeRevision !== record.recipeRevision && <p role="alert" className="text-sm text-amber-200">The saved recipe changed since this draft opened. Review the saved version before saving.</p>}
            <div className="space-y-3">{data.ingredients.map(stock => <article key={stock.inventoryItem} className="space-y-2 rounded-xl border border-white/15 p-3"><h4 className="break-words text-sm font-semibold text-white">{stock.name} · {stock.preparation ? "Prepared" : "Raw"}</h4><dl className="grid grid-cols-2 gap-3 text-xs text-neutral-200 sm:grid-cols-4">{[["Physical", stock.physicalStock], ["Usable", stock.usable], ["Required", stock.required], ["Shortage", stock.shortage]].map(([label, value]) => <div key={label}><dt className="text-neutral-400">{label}</dt><dd className="mt-1 break-words">{q(value, stock.unit)}</dd></div>)}</dl>{stock.preparation && <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={opening || saving} onClick={() => openPreparation(stock, false)}>View preparation recipe</Button><Button variant="secondary" disabled={!canWrite || opening || saving || !stock.preparation.isActive || !(stock.shortage > 0)} onClick={() => openPreparation(stock, true)}>Produce {stock.name}</Button></div>}</article>)}</div>
          </>}
        </section>
        <section aria-label="Reference cost summary" className="space-y-3 border-t border-white/15 pt-4"><h3 className="font-semibold text-white">Current reference estimate</h3><div className="grid gap-3 sm:grid-cols-2"><Metric label="Ingredient cost per sale" value={money(data?.metrics.totalEstimatedIngredientCost)}/><Metric label="Ingredient contribution" value={money(data?.metrics.estimatedProfit)}/><Metric label="Ingredient margin" value={data?.metrics.profitMargin == null ? "Unavailable" : data.metrics.profitMargin + "%"}/><Metric label="Cost confidence" value={data?.metrics.costConfidence === "reference_complete" ? "Complete reference costs" : data?.metrics.costConfidence === "not_tracked" ? "Not tracked" : "Incomplete / awaiting review"}/></div>
          {data?.metrics.costConfidence === "incomplete" && <p className="text-xs text-amber-200">Known partial ingredient cost: {money(data.metrics.knownEstimatedIngredientCost)}. Missing costs are not zero and the total/margin cannot be verified.</p>}
          <p className="text-xs text-neutral-300">Based on current inventory reference costs. Actual order costs use saved stock allocations. These estimates exclude labour, overhead and other expenses.</p>
        </section>
        {saveError && <div role="alert" className="space-y-2 text-sm text-red-200"><p>{saveError}</p><p>Your draft is retained.{uncertain ? " Check the saved version before trying again." : ""}</p></div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4"><span className="text-xs text-neutral-300">{dirty ? "Unsaved changes" : "Draft matches the saved recipe"}</span><Button type="submit" disabled={!canWrite || saving || !dirty || !fresh || uncertain || data?.recipeRevision !== record.recipeRevision}>{saving ? "Saving…" : "Update Recipe"}</Button></div>
      </form>
    </div>
    {workflow && <ProductionWorkspace recipes={workflow.options.recipes} items={workflow.options.items} varianceThreshold={workflow.options.productionVarianceThresholdPercent} initialRecipe={workflow.recipe} suggestedTarget={{ quantity: workflow.stock.shortage, unit: workflow.stock.unit }} returnLabel={record.name + " recipe draft"} onCancel={() => { setWorkflow(null); setRevision(value => value + 1); }} onSaved={() => undefined}/>}
    {viewRecipe && <RecipeDefinitionDialog recipe={viewRecipe.recipe} items={viewRecipe.options.items} onClose={() => setViewRecipe(null)}/>}
    {dialog === "history" && <SellingRecipeHistory kind={kind} id={id} name={record.name} onClose={() => setDialog("")}/>}
    {dialog === "copy" && <CopySellingRecipe kind={kind} destination={record} currentDraft={draft} onClose={() => setDialog("")} onApply={ingredients => { edit({ ingredients }); setDialog(""); toast.info("Ingredients copied into this draft. Review quantities and save separately."); }}/>}
    {dialog === "tracking" && <DeliveryDialog open centered title="Confirm Do Not Track" busy={saving} onClose={() => setDialog("")}><p className="text-sm text-amber-200">Saving removes the ingredient mapping for {record.name} and disables stock deductions for future sales. Existing stock and past costs stay as recorded.</p><label className="flex gap-2 text-sm text-white"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>I confirm clearing this mapping and disabling tracking</label><Field label="Reason for disabling tracking"><textarea minLength={5} maxLength={500} className={textareaClass} value={reason} onChange={event => setReason(event.target.value)}/></Field>{saveError && <p role="alert" className="text-red-200">{saveError}</p>}<Button disabled={saving || !confirmed || reason.trim().length < 5} onClick={() => save(true)}>Confirm and save exclusion</Button></DeliveryDialog>}
    {dialog === "latest" && latest && <DeliveryDialog open title="Review saved version" onClose={() => setDialog("")}><p className="text-sm text-neutral-300">Review this saved version beside your retained draft. Loading it explicitly replaces your draft; it never saves automatically.</p><div className="grid gap-3 sm:grid-cols-2"><RecipeSnapshot label="Your retained draft" value={{ ...draft, ingredients: draft.ingredients.map(line => ({ ...line, name: items[line.inventoryItem]?.name, unit: line.enteredUnit })) }}/><RecipeSnapshot label="Latest saved version" value={{ ...draftFromRecipe(latest, kind), revision: latest.recipeRevision, ingredients: draftFromRecipe(latest, kind).ingredients.map((line, index) => ({ ...line, name: latest.recipe.ingredients[index].inventoryItem?.name, unit: line.enteredUnit })) }}/></div><Button variant="secondary" onClick={() => { if (dirty && !window.confirm("Replace your unsaved draft with the latest saved version?")) return; accept(latest); setDialog(""); }}>Load saved version into editor</Button>{uncertain && latest.recipeRevision === record.recipeRevision && <Button onClick={() => { setUncertain(false); setSaveError(""); setDialog(""); setRevision(value => value + 1); }}>Keep draft and retry after review</Button>}</DeliveryDialog>}
  </>;
}
function Metric({ label, value }) { return <div className="min-w-0 rounded-xl bg-black/20 p-3"><p className="text-xs text-neutral-300">{label}</p><p className="mt-1 break-words text-lg font-semibold text-white">{value}</p></div>; }
