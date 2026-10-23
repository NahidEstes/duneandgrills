"use client";
import { useEffect, useState } from "react";
import { fetchInventoryRecipes, fetchAddOnInventoryRecipes, fetchInventoryRecipe, fetchAddOnInventoryRecipe, fetchSellingRecipeHistory } from "@/src/api/inventoryApi.js";
import DeliveryDialog from "../admin/delivery/DeliveryDialog.jsx";
import { Button, Field, LoadingState, InventoryLoadError, Pagination, inputClass, Badge } from "./InventoryUI.jsx";
import useInventoryResource from "./useInventoryResource.js";
import { apiErrorMessage } from "./inventoryUtils.js";
import { draftFromRecipe } from "./sellingRecipeUtils.js";

export function RecipeSnapshot({ value, label }) {
  return <section className="min-w-0 space-y-2 rounded-xl border border-white/15 p-3"><h3 className="font-semibold text-white">{label}</h3>{!value ? <p className="text-sm text-neutral-300">No recorded snapshot.</p> : <>
    <p className="break-all text-xs text-neutral-300">Revision: {value.revision || "Not recorded in this audit entry"} · Tracking: {value.doNotTrack === true ? "Do Not Track" : value.doNotTrack === false ? "Tracked" : "Not recorded"} · Active: {value.isActive == null ? "Not recorded" : String(value.isActive)}</p>
    <ul className="space-y-2">{value.ingredients?.map((line, index) => <li key={index} className="break-words text-sm text-neutral-200">{line.name || line.inventoryItem || "Identity not recorded"} · {line.quantity ?? "Quantity unavailable"} {line.unit || line.enteredUnit || "Unit unavailable"}{line.enteredQuantity != null ? " · entered " + line.enteredQuantity + " " + line.enteredUnit : ""} · {line.isActive == null ? "Status not recorded" : line.isActive ? "Active" : "Inactive"}</li>)}</ul>
    {!value.ingredients?.length && <p className="text-sm text-neutral-300">No ingredients recorded.</p>}
  </>}</section>;
}
export function SellingRecipeHistory({ kind, id, name, onClose }) {
  const [page, setPage] = useState(1);
  const resource = useInventoryResource(() => fetchSellingRecipeHistory(kind, id, { page, limit: 5 }), [kind, id, page]);
  return <DeliveryDialog open title={"Recipe history · " + name} onClose={onClose}><p className="text-sm text-neutral-300">Recorded configuration changes only. Reference costs are not historical order costs. Missing older evidence is shown as unavailable.</p>
    <InventoryLoadError error={resource.error} onRetry={resource.reload}/>{resource.loading ? <LoadingState/> : resource.data?.data.length ? resource.data.data.map(row => <article key={row._id} className="space-y-3 border-t border-white/15 pt-4"><p className="text-sm text-white">{row.actorName || "Actor not recorded"} · {new Date(row.createdAt).toLocaleString()}</p><p className="text-xs text-neutral-300">{row.action} {row.reason && "· " + row.reason}</p><div className="grid gap-3 sm:grid-cols-2"><RecipeSnapshot value={row.before} label="Before"/><RecipeSnapshot value={row.after} label="After"/></div></article>) : !resource.error && <p className="text-sm text-neutral-300">No recorded recipe changes.</p>}<Pagination pagination={resource.data?.pagination} onPageChange={setPage}/>
  </DeliveryDialog>;
}
export function CopySellingRecipe({ kind, destination, currentDraft, onApply, onClose }) {
  const [search, setSearch] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1), [sourceId, setSourceId] = useState(""), [source, setSource] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  const resource = useInventoryResource(() => (kind === "menu" ? fetchInventoryRecipes : fetchAddOnInventoryRecipes)({ search: query, page, limit: 10 }), [kind, query, page]);
  useEffect(() => {
    const controller = new AbortController(); let current = true; setSource(null); setError("");
    if (sourceId) { setBusy(true); (kind === "menu" ? fetchInventoryRecipe : fetchAddOnInventoryRecipe)(sourceId, { signal: controller.signal }).then(value => { if (current) setSource(value); }).catch(failure => { if (current) setError(apiErrorMessage(failure)); }).finally(() => { if (current) setBusy(false); }); }
    return () => { current = false; controller.abort(); };
  }, [kind, sourceId]);
  return <DeliveryDialog open title={"Copy ingredients into " + destination.name} onClose={onClose}>
    <p className="text-sm text-neutral-300">Choose a source of the same recipe type. Review its ingredients before replacing this draft. Destination price, tracking and active status stay as shown in the editor. Saving is a separate action.</p>
    <RecipeSnapshot label="Current destination draft" value={currentDraft}/>
    <Field label="Search source recipes"><input className={inputClass} value={search} onChange={event => setSearch(event.target.value)}/></Field>
    <InventoryLoadError error={resource.error} onRetry={resource.reload}/>
    {resource.loading ? <LoadingState/> : <div className="space-y-2">{resource.data?.data.filter(row => row._id !== destination._id).map(row => <Button key={row._id} variant={sourceId === row._id ? "primary" : "secondary"} className="w-full justify-start break-words text-left" onClick={() => setSourceId(row._id)}>{row.name}</Button>)}</div>}
    <Pagination pagination={resource.data?.pagination} onPageChange={setPage}/>
    {busy && <p role="status" className="text-sm text-neutral-300">Loading source recipe…</p>}{error && <p role="alert" className="text-red-200">{error}</p>}
    {source && <><Badge>Source: {source.name}</Badge><RecipeSnapshot label="Ingredients to replace the destination draft" value={{ ...draftFromRecipe(source, kind), revision: source.recipeRevision, ingredients: draftFromRecipe(source, kind).ingredients.map((line, index) => ({ ...line, name: source.recipe.ingredients[index].inventoryItem?.name, unit: line.enteredUnit })) }}/>
      {source.recipe?.doNotTrack && <p className="text-sm text-amber-200">The source uses Do Not Track and has no ingredient mapping to copy.</p>}
      <Button disabled={!source.recipe?.ingredients?.length || source.recipe.doNotTrack} onClick={() => onApply(draftFromRecipe(source, kind).ingredients)}>Replace draft ingredients</Button></>}
  </DeliveryDialog>;
}
