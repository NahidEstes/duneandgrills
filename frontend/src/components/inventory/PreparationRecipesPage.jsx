"use client";
import { useRef, useState } from "react";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { fetchPreparationOptions, fetchPreparationRecipes, savePreparationRecipe } from "@/src/api/inventoryApi.js";
import DarkSelect from "../ui/DarkSelect.jsx";
import { usePageFormChanges } from "../ui/useDialogChanges.js";
import useInventoryResource from "./useInventoryResource.js";
import { Badge, Button, EmptyState, Field, PageHeader, Pagination, InventoryLoadError, LoadingState, cardClass, inputClass, textareaClass } from "./InventoryUI.jsx";
import { apiErrorMessage } from "./inventoryUtils.js";
import { preparationUnits } from "@/src/utils/preparationUnits.js";
import { preparationQuantityLabel as quantity } from "@/src/utils/preparationUnits.js";
import PreparationRecipeHistory from "./PreparationRecipeHistory.jsx";

const blank = { name: "", finishedItem: "", outputQuantity: "", outputUnit: "", ingredients: [{ inventoryItem: "", quantity: "", unit: "" }], isActive: true, notes: "" };
const draftFor = recipe => recipe ? { ...recipe, expectedVersion: recipe.version, ingredients: recipe.ingredients.map(line => ({ inventoryItem: String(line.inventoryItem), quantity: String(line.enteredQuantity), unit: line.enteredUnit })) } : blank;
function RecipeForm({ selected, items, recipes, blocked, onSaved, onCancel }) {
  const [draft, setDraft] = useState(() => draftFor(selected)), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  const itemFor = id => items.find(item => item._id === id);
  const edit = values => setDraft(current => ({ ...current, ...values }));
  const changeLine = (index, values) => edit({ ingredients: draft.ingredients.map((row, offset) => offset === index ? { ...row, ...values } : row) });
  const finished = itemFor(draft.finishedItem), preparedIds = new Set(recipes.map(recipe => String(recipe.finishedItem)));
  const save = async event => {
    event.preventDefault(); if (lock.current || blocked) return;
    lock.current = true; setBusy(true); setError("");
    try { const saved = await savePreparationRecipe(selected?._id, draft); onSaved(saved); }
    catch (failure) { setError(apiErrorMessage(failure)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className={`${cardClass} min-w-0 p-4 sm:p-6`}><form onSubmit={save} aria-busy={busy} className="space-y-5">
    <div className="flex flex-wrap items-center gap-3"><h2 className="font-body text-xl font-semibold text-white">{selected ? selected.name : "New preparation recipe"}</h2><Badge tone={draft.isActive ? "success" : "neutral"}>{draft.isActive ? "Active" : "Inactive"}</Badge></div>
    <fieldset disabled={busy || blocked} className="space-y-5">
      <Field label="Recipe name"><input required maxLength={120} className={inputClass} value={draft.name} onChange={event => edit({ name: event.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Finished stock item" hint={selected ? "Create another recipe to change its finished item." : "Use an existing inventory item."}><DarkSelect aria-label="Finished stock item" required disabled={Boolean(selected)} className={inputClass} value={draft.finishedItem} onChange={event => { const item = itemFor(event.target.value); edit({ finishedItem: event.target.value, outputUnit: item?.unit || "" }); }}><option value="">Select stock item</option>{items.filter(item => !preparedIds.has(item._id) || item._id === selected?.finishedItem).map(item => <option key={item._id} value={item._id}>{item.name} · {item.unit}</option>)}</DarkSelect></Field>
      <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-2"><Field label="Expected batch yield"><input required inputMode="decimal" type="number" min="0.000001" step="any" className={inputClass} value={draft.outputQuantity} onChange={event => edit({ outputQuantity: event.target.value })}/></Field><Field label="Yield unit"><DarkSelect aria-label="Yield unit" required className={inputClass} value={draft.outputUnit} onChange={event => edit({ outputUnit: event.target.value })}><option value="">Unit</option>{finished && preparationUnits(finished).map(unit => <option key={unit}>{unit}</option>)}</DarkSelect></Field></div></div>
      <section className="space-y-3"><h3 className="font-body font-semibold text-white">Ingredients per batch</h3>{draft.ingredients.map((line, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_90px_44px] gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-[minmax(0,1fr)_110px_80px_44px]">
        <Field className="col-span-3 sm:col-span-1" label={`Stock item ${index + 1}`}><DarkSelect aria-label={`Stock item ${index + 1}`} required className={inputClass} value={line.inventoryItem} onChange={event => changeLine(index, { inventoryItem: event.target.value, unit: itemFor(event.target.value)?.unit || "" })}><option value="">Select raw ingredient</option>{items.filter(item => item._id !== draft.finishedItem && !preparedIds.has(item._id) && (!draft.ingredients.some((other, offset) => offset !== index && other.inventoryItem === item._id) || item._id === line.inventoryItem)).map(item => <option key={item._id} value={item._id}>{item.name}</option>)}</DarkSelect></Field>
        <Field label={`Quantity ${index + 1}`}><input required type="number" inputMode="decimal" min="0.000001" step="any" value={line.quantity} onChange={event => changeLine(index, { quantity: event.target.value })} className={inputClass}/></Field><Field label={`Unit ${index + 1}`}><DarkSelect aria-label={`Unit ${index + 1}`} required className={inputClass} value={line.unit} onChange={event => changeLine(index, { unit: event.target.value })}><option value="">Unit</option>{itemFor(line.inventoryItem) && preparationUnits(itemFor(line.inventoryItem)).map(unit => <option key={unit}>{unit}</option>)}</DarkSelect></Field><Button variant="ghost" className="self-end min-h-11" disabled={draft.ingredients.length === 1} aria-label={`Remove ingredient ${index + 1}`} onClick={() => edit({ ingredients: draft.ingredients.filter((_, offset) => offset !== index) })}><Trash2 size={18}/></Button>
      </div>)}<Button variant="secondary" disabled={draft.ingredients.length >= 40} onClick={() => edit({ ingredients: [...draft.ingredients, { inventoryItem: "", quantity: "", unit: "" }] })}><Plus size={16}/>Add ingredient</Button></section>
      <Field label="Status"><DarkSelect aria-label="Status" className={inputClass} value={draft.isActive ? "active" : "inactive"} onChange={event => edit({ isActive: event.target.value === "active" })}><option value="active">Active</option><option value="inactive">Inactive</option></DarkSelect></Field>
      <Field label="Preparation notes (optional)"><textarea aria-label="Preparation notes (optional)" maxLength={2000} className={textareaClass} value={draft.notes} onChange={event => edit({ notes: event.target.value })}/></Field>
    </fieldset>
    <p className="rounded-xl border border-blue-400/25 bg-blue-400/5 p-4 text-sm text-blue-200">Saving a recipe does not change stock. Menu Item Recipes consume stock on food orders; Preparation Recipes convert raw ingredients into finished stock.</p>
    {error && <p role="alert" className="text-sm text-red-300">{error} Reload the recipe if its version changed; your draft has been retained.</p>}
    <div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={busy || blocked}>{busy ? "Saving…" : "Save recipe"}</Button></div>
  </form></div>;
}

export default function PreparationRecipesPage() {
  const [query, setQuery] = useState({ search: "", status: "all", page: 1 }), [selected, setSelected] = useState(undefined), [notice, setNotice] = useState("");
  const [history, setHistory] = useState(null);
  const options = useInventoryResource(fetchPreparationOptions, []);
  const library = useInventoryResource(() => fetchPreparationRecipes(query), [query]);
  const reload = () => Promise.all([options.reload(), library.reload()]);
  const data = options.data ? { ...options.data, data: library.data?.data || [], pagination: library.data?.pagination } : null;
  const error = options.error || library.error;
  const root = useRef(null);
  const changeGuard = usePageFormChanges({ open: selected !== undefined, rootRef: root, onClose: () => setSelected(undefined), resetKey: `${selected?._id || "new"}:${selected?.version || 0}` });
  const choose = value => { if (changeGuard.confirmDiscard()) setSelected(value); };
  return <div ref={root} {...changeGuard.capture}>
    <PageHeader descriptionClassName="!text-neutral-400" title="Preparation Recipes" description="Set up recipes for sauces and prepared ingredients." actions={<><Button variant="secondary" onClick={() => reload().catch(() => undefined)}><RefreshCw size={16}/>Refresh</Button><Button onClick={() => choose(null)}><Plus size={16}/>New recipe</Button></>}/>
    <InventoryLoadError error={error} onRetry={reload} retained={Boolean(data)} />
    {notice && <p role="status" className="mb-4 text-sm text-emerald-300">{notice}</p>}
    {options.loading ? <LoadingState/> : data && <div className="grid items-start gap-5 xl:grid-cols-[minmax(240px,330px)_minmax(0,1fr)]">
      <aside className={`${cardClass} min-w-0 space-y-3 p-3`}><Field label="Search preparation recipes"><input className={inputClass} value={query.search} onChange={event => setQuery({ ...query, search: event.target.value, page: 1 })}/></Field><Field label="Filter status"><DarkSelect aria-label="Filter status" className={inputClass} value={query.status} onChange={event => setQuery({ ...query, status: event.target.value, page: 1 })}><option value="all">All recipes</option><option value="active">Active</option><option value="inactive">Inactive</option></DarkSelect></Field>
        {library.loading ? <LoadingState label="Loading recipes…"/> : data.data.map(recipe => <button key={recipe._id} onClick={() => choose(recipe)} className={`w-full rounded-xl border p-4 text-left ${selected?._id === recipe._id ? "border-dune-amber bg-dune-amber/5" : "border-white/10 bg-black/10"}`}><span className="block break-words font-semibold text-white">{recipe.name}</span><span className="mt-2 block break-words text-sm text-neutral-300">{recipe.finishedItemName || data.items.find(item => String(item._id) === String(recipe.finishedItem))?.name || "Finished item unavailable"}</span><span className="mt-1 block text-xs text-neutral-400">Expected: {quantity(recipe.outputQuantity, recipe.outputUnit)} · {recipe.ingredients.length} {recipe.ingredients.length === 1 ? "ingredient" : "ingredients"}</span><span className="mt-2 block"><Badge tone={recipe.isActive ? "success" : "neutral"}>{recipe.isActive ? "Active" : "Inactive"} · v{recipe.version}</Badge></span></button>)}
        {!library.loading && library.error && !data.data.length && <p role="status" className="p-4 text-sm text-amber-200">Recipe results are unavailable. Retry successfully to verify the list.</p>}{!library.loading && !library.error && !data.data.length && <EmptyState title="No preparation recipes" description="Create a recipe using existing stock items."/>}<Pagination pagination={data.pagination} onPageChange={page => setQuery({ ...query, page })}/>
      </aside>
      <div className="min-w-0 space-y-3">{selected?._id && data.canReadHistory && <Button variant="secondary" onClick={() => setHistory(selected)}>View version history</Button>}
      {selected !== undefined ? <RecipeForm key={`${selected?._id || "new"}:${selected?.version || 0}`} selected={selected} items={data.items} recipes={data.recipes} blocked={Boolean(error) || options.refreshing || library.refreshing} onCancel={changeGuard.requestClose} onSaved={recipe => { setSelected(recipe); setNotice("Recipe saved. Stock balances are unchanged."); reload().catch(() => undefined); }}/>:<EmptyState title="Choose a recipe" description="Select a preparation or create a new recipe to begin."/>}</div>
    </div>}
    {history && <PreparationRecipeHistory key={history._id} recipe={history} onClose={() => setHistory(null)}/>}
  </div>;
}
