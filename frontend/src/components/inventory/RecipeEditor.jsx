"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChefHat, LoaderCircle, Plus, Puzzle, Trash2 } from "lucide-react";
import DarkSelect from "../ui/DarkSelect.jsx";
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
import RecipeConversionHint from "./RecipeConversionHint.jsx";

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
      const ingredients = draft.ingredients.map((line, index) => ({ ...line, expectedGramsPerLiter: data.normalizedIngredients[index]?.conversionSnapshot?.gramsPerLiter }));
      const result = await (kind === "menu" ? updateInventoryRecipe : updateAddOnInventoryRecipe)(id, { ...draft, ingredients, expectedRevision: record.recipeRevision, confirmDoNotTrack, reason: confirmDoNotTrack ? reason : undefined });
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
    <div ref={root} className={"min-w-0 " + (workflow ? "hidden" : "")}>
      <form aria-label="Recipe editor" aria-busy={saving || !!workflow} onSubmit={event => { event.preventDefault(); save(); }} className="min-w-0 space-y-4">
        <section className={cardClass + " min-w-0"}>
          <header className="flex flex-col justify-between gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2">{kind === "addon" && <Puzzle className="h-5 w-5 text-dune-amber"/>}<h2 className="break-words font-body text-xl font-semibold text-white">{record.name}</h2><Badge tone={record.recipeStatus === "configured" ? "success" : record.recipeStatus === "do_not_track" ? "violet" : "danger"}>{record.recipeStatus === "configured" ? "Configured" : record.recipeStatus === "do_not_track" ? "Do Not Track" : "Not Configured"}</Badge></div>
              <p className="mt-1 text-xs text-neutral-400">{record.categoryRef?.name || record.category}{kind === "menu" ? " · " : ""}Selling price {money(record.price)}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-neutral-300"><input disabled={!canWrite || saving} type="checkbox" className="h-4 w-4 accent-dune-amber" checked={draft.doNotTrack} onChange={event => edit({ doNotTrack: event.target.checked })}/>Do not track inventory</label>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-neutral-300"><input disabled={!canWrite || saving} type="checkbox" className="h-4 w-4 accent-dune-amber" checked={draft.isActive} onChange={event => edit({ isActive: event.target.checked })}/>Recipe active</label>
            </div>
          </header>
          {record.recipeStatus === "not_configured" && <p role="status" className="mx-5 mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">Sales blocked: {record.recipeIssue || "Missing valid recipe"}. Configure active ingredients or explicitly save Do Not Track.</p>}
          {!canWrite && <p className="mx-5 mt-4 text-sm text-amber-200">Read-only access. Recipe changes and production require inventory write permission.</p>}
          <fieldset disabled={!canWrite || saving} className="min-w-0">
            {draft.doNotTrack ? <div className="p-5 sm:p-8"><div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.07] p-5 text-center"><ChefHat className="mx-auto h-8 w-8 text-violet-400"/><p className="mt-3 font-medium text-white">Inventory tracking is disabled for this {kind === "menu" ? "menu item" : "add-on"}</p><p className="mt-1 text-xs text-neutral-400">Ingredient mappings will be cleared when you save. Draft ingredients are retained until then.</p></div></div> : <div className="p-5">
              <div className="mb-4 flex items-center justify-between gap-4"><div><h3 className="text-sm font-semibold text-white">Ingredients</h3><p className="mt-1 text-xs text-neutral-400">Quantities per {kind === "menu" ? "sale" : "add-on"}. Compatible units convert to inventory base units.</p></div><Button variant="secondary" size="sm" disabled={draft.ingredients.length >= 100} onClick={() => edit({ ingredients: [...draft.ingredients, { inventoryItem: "", quantity: "", enteredUnit: "", isActive: true }] })}><Plus className="h-4 w-4"/>Add ingredient</Button></div>
              <div className="space-y-2">{draft.ingredients.map((line, index) => {
                const item = items[line.inventoryItem], normalized = data?.normalizedIngredients[index], cost = data?.metrics.lines[index], stock = data?.ingredients.find(row => row.inventoryItem === line.inventoryItem);
                const choices = item ? preparationUnits(item) : [line.enteredUnit].filter(Boolean);
                return <section key={index} aria-label={"Ingredient " + (index + 1)} className="grid min-w-0 gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-3 sm:grid-cols-2 2xl:grid-cols-[minmax(190px,1.55fr)_minmax(105px,.7fr)_80px_minmax(105px,.78fr)_minmax(105px,.8fr)_minmax(105px,.8fr)_auto] 2xl:items-start">
                  <div className="min-w-0"><InventoryItemPicker recipeTypes retainInactive value={line.inventoryItem} label={"Inventory item " + (index + 1)} excludedIds={draft.ingredients.filter((_, offset) => offset !== index).map(row => row.inventoryItem)} onResolved={remember} onChange={(value, item) => { remember(item); if (value !== line.inventoryItem) changeLine(index, { inventoryItem: value, enteredUnit: item.unit }); }}/>
                    {!line.inventoryItem && baseline.ingredients[index]?.quantity && !baseline.ingredients[index]?.inventoryItem && <p role="alert" className="mt-1 text-xs text-amber-200">Saved ingredient unavailable. Replace or remove this row.</p>}
                    <RecipeConversionHint line={line} item={item} unitKey="enteredUnit" previous={(() => { const old = record.recipe?.ingredients.find(row => String(row.inventoryItem?._id || row.inventoryItem) === line.inventoryItem); return old ? { ...old, quantity: old[kind === "menu" ? "quantityPerSale" : "quantityPerAddOn"] } : null; })()} normalized={normalized ? { quantity: normalized[kind === "menu" ? "quantityPerSale" : "quantityPerAddOn"] } : null} disabled={!canWrite || saving} onReapply={value => changeLine(index, { reapplyConversion: value })} />
                  </div>
                  <Field label={kind === "menu" ? "Quantity per Sale" : "Qty per add-on"} hint={normalized ? "Base: " + q(normalized[kind === "menu" ? "quantityPerSale" : "quantityPerAddOn"], normalized.unit) : "Awaiting server review"}><input aria-label={"Quantity per " + (kind === "menu" ? "sale " : "add-on ") + (index + 1)} required type="number" min="0" max="1000000000" step="any" className={inputClass} value={line.quantity} onChange={event => changeLine(index, { quantity: event.target.value })}/></Field>
                  <Field label="Unit"><DarkSelect aria-label={"Entered unit " + (index + 1)} required disabled={!canWrite || saving} className={inputClass} value={line.enteredUnit} onChange={event => changeLine(index, { enteredUnit: event.target.value })}><option value="">Choose unit</option>{[...new Set([...choices, line.enteredUnit].filter(Boolean))].map(unit => <option key={unit} value={unit}>{unit}{!choices.includes(unit) ? " (unavailable)" : ""}</option>)}</DarkSelect></Field>
                  <Field label="Physical Stock" hint={"Usable: " + q(stock?.usable, item?.unit)}><ReadOnlyValue tone="text-emerald-400">{q(stock?.physicalStock, item?.unit)}</ReadOnlyValue></Field>
                  <Field label="Cost per Unit (SAR)"><ReadOnlyValue>{money(cost?.costPerUnit)}</ReadOnlyValue></Field>
                  <Field label={kind === "menu" ? "Cost per Dish (SAR)" : "Ingredient cost"}><ReadOnlyValue tone={line.isActive ? "text-dune-amberLight" : "text-neutral-400"}>{money(cost?.ingredientCostPerDish)}</ReadOnlyValue></Field>
                  <div className="flex h-10 items-center justify-end gap-1 sm:col-span-2 2xl:col-span-1 2xl:mt-6">
                    <button type="button" aria-label={"Ingredient active " + (index + 1)} aria-pressed={line.isActive} onClick={() => changeLine(index, { isActive: !line.isActive })} className={"min-h-10 rounded-lg px-3 py-2 text-xs " + (line.isActive ? "bg-emerald-500/10 text-emerald-300" : "bg-white/5 text-neutral-400")}>{line.isActive ? "Active" : "Inactive"}</button>
                    <button type="button" aria-label={"Remove ingredient " + (index + 1)} className="rounded-lg p-2.5 text-red-400 hover:bg-red-500/10" onClick={() => edit({ ingredients: draft.ingredients.filter((_, offset) => offset !== index) })}><Trash2 className="h-4 w-4"/></button>
                  </div>
                </section>;
              })}</div>
              {!draft.ingredients.length && <EmptyState title="No ingredients added" description="Add the first ingredient to configure this recipe."/>}
            </div>}
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-5 py-3"><span className="text-xs text-neutral-400">{dirty ? <span className="text-amber-300">Unsaved draft</span> : "Saved version"}</span><div className="flex flex-wrap gap-1"><Button size="sm" variant="ghost" disabled={!canWrite || saving} onClick={() => setDialog("copy")}>Copy from recipe</Button>{canHistory && <Button size="sm" variant="ghost" disabled={saving} onClick={() => setDialog("history")}>View history</Button>}<Button size="sm" variant="ghost" disabled={saving || opening} onClick={inspectLatest}>Review saved version</Button></div></div>
        </section>
        <section aria-label="Reference cost summary" className={cardClass + " p-5"}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-white/10">
            <SummaryMetric label={kind === "menu" ? "Total Estimated Ingredient Cost per Dish" : "Estimated Ingredient Cost per Add-on"} value={money(data?.metrics.totalEstimatedIngredientCost)} caption="Sum of active ingredient costs" tone="text-dune-amber"/>
            <SummaryMetric label="Selling Price" value={money(record.price)} caption="Current item price"/>
            <SummaryMetric label="Estimated Profit" value={money(data?.metrics.estimatedProfit)} caption="Before labour and other expenses" tone={data?.metrics.estimatedProfit == null ? "text-neutral-300" : data.metrics.estimatedProfit >= 0 ? "text-emerald-400" : "text-red-400"}/>
            <SummaryMetric label="Profit Margin" value={data?.metrics.profitMargin == null ? "Unavailable" : data.metrics.profitMargin.toFixed(1) + "%"} caption="Current reference ingredient margin" tone={data?.metrics.profitMargin == null ? "text-neutral-300" : data.metrics.profitMargin >= 0 ? "text-emerald-400" : "text-red-400"}/>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2"><Badge tone={data?.metrics.costConfidence === "reference_complete" ? "success" : "warning"}>{data?.metrics.costConfidence === "reference_complete" ? "Complete reference costs" : data?.metrics.costConfidence === "not_tracked" ? "Not tracked" : "Incomplete / awaiting review"}</Badge><p className="text-xs text-neutral-400">Current estimates; historical order costs stay as recorded.</p></div>
          {data?.metrics.costConfidence === "incomplete" && <p className="mt-2 text-xs text-amber-200">Known partial cost: {money(data.metrics.knownEstimatedIngredientCost)}. Missing costs cannot verify totals or margins.</p>}
          {saveError && <div role="alert" className="mt-3 space-y-1 text-sm text-red-200"><p>{saveError}</p><p>Your draft is retained.{uncertain ? " Check the saved version before trying again." : ""}</p></div>}
          {(!online || review.error) && <p role="alert" className="mt-3 text-xs text-amber-200">{review.error || "Offline. Reconnect before saving."}</p>}
          {data && data.recipeRevision !== record.recipeRevision && <p role="alert" className="mt-3 text-xs text-amber-200">The saved recipe changed since this draft opened. Review the saved version before saving.</p>}
          <div className="mt-5 flex justify-end"><Button type="submit" disabled={!canWrite || saving || !dirty || !fresh || uncertain || data?.recipeRevision !== record.recipeRevision}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin"/> : kind === "menu" ? <ChefHat className="h-4 w-4"/> : <Puzzle className="h-4 w-4"/>}{saving ? "Saving…" : "Update Recipe"}</Button></div>
        </section>
        <details data-stock-planner data-draft-ignore className={cardClass}>
          <summary className="cursor-pointer rounded-2xl p-4 text-sm font-semibold text-neutral-300 hover:bg-white/[0.03]">Stock &amp; portion planner <span className="ml-2 text-xs font-normal text-neutral-400">Usable stock, shortages &amp; production</span></summary>
          <section aria-label="Stock planner" className="space-y-3 border-t border-white/10 p-5">
            <div className="flex flex-wrap items-end gap-3"><Field label="Plan portions"><input type="number" min="1" max="1000000" step="1" className={inputClass} value={portions} onChange={event => setPortions(event.target.value)}/></Field><Button variant="secondary" disabled={saving} onClick={() => setRevision(value => value + 1)}>Refresh stock review</Button></div>
            <p className="text-xs text-neutral-400">{kind === "menu" ? "Menu-only availability. Add-ons are reviewed separately; shared stock is not reserved here." : "Add-on-only availability."} Planning does not deduct or reserve stock.</p>
            {review.loading || review.key !== previewKey ? <p role="status" className="text-sm text-neutral-300">Reviewing draft and usable stock…</p> : null}
            {data && <><p className="text-sm font-medium text-white">Available portions: {data.portionsAvailable == null ? "Unavailable" : q(data.portionsAvailable)}{data.limitingIngredients.length ? " · Limiting: " + data.limitingIngredients.join(", ") : ""}</p>{data.issue && <p className="text-sm text-amber-200">Sales blocked: {data.issue}</p>}
              <div className="space-y-3">{data.ingredients.map(stock => <article key={stock.inventoryItem} className="space-y-2 rounded-xl border border-white/10 p-3"><h4 className="break-words text-sm font-semibold text-white">{stock.name} · {stock.preparation ? "Prepared" : "Raw"}</h4><dl className="grid grid-cols-2 gap-3 text-xs text-neutral-200 sm:grid-cols-4">{[["Physical", stock.physicalStock], ["Usable", stock.usable], ["Required", stock.required], ["Shortage", stock.shortage]].map(([label, value]) => <div key={label}><dt className="text-neutral-400">{label}</dt><dd className="mt-1 break-words">{q(value, stock.unit)}</dd></div>)}</dl>{stock.preparation && <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={opening || saving} onClick={() => openPreparation(stock, false)}>View preparation recipe</Button><Button variant="secondary" disabled={!canWrite || opening || saving || !stock.preparation.isActive || !(stock.shortage > 0)} onClick={() => openPreparation(stock, true)}>Produce {stock.name}</Button></div>}</article>)}</div>
            </>}
            <p className="text-xs text-neutral-400">The server validates compatible units and converts quantities to base units at six-decimal precision. Availability can change before a sale; actual order costs use their saved stock allocations.</p>
          </section>
        </details>
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
function ReadOnlyValue({ children, tone = "text-neutral-300" }) { return <div className={inputClass + " flex items-center text-xs " + tone}>{children}</div>; }
function SummaryMetric({ label, value, caption, tone = "text-white" }) { return <div className="min-w-0 xl:px-4 xl:first:pl-0"><p className="text-xs text-neutral-400">{label}</p><p className={"mt-1 break-words text-xl font-semibold " + tone}>{value}</p><p className="mt-1 text-[0.65rem] text-neutral-400">{caption}</p></div>; }
