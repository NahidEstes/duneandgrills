"use client";
import { useEffect, useState } from "react";
import { fetchPreparationOptions, fetchProductionDetails } from "@/src/api/inventoryApi.js";
import ProductionForm from "./ProductionForm.jsx";
import useInventoryResource from "./useInventoryResource.js";
import { Button, InventoryLoadError, cardClass } from "./InventoryUI.jsx";
import { apiErrorMessage } from "./inventoryUtils.js";
import { preparationQuantityLabel as q } from "@/src/utils/preparationUnits.js";

function Completion({ id, label, busy, error, onContinue }) {
  const resource = useInventoryResource(() => fetchProductionDetails(id), [id]);
  return <section aria-label="Production confirmed" className={`${cardClass} space-y-4 p-5`}><h2 className="font-body text-xl font-semibold text-emerald-300">Production confirmed</h2><p className="text-sm text-neutral-200">{resource.data ? `${resource.data.productionNumber} · ${resource.data.finishedName || resource.data.recipeSnapshot.name} · Produced ${q(resource.data.actualQuantity, resource.data.unit)}` : "The server confirmed this production. Do not produce this batch again."}</p><InventoryLoadError error={resource.error} onRetry={resource.reload} retained={Boolean(resource.data)}/><p className="text-sm text-neutral-300">The original draft is retained. Continue to refresh stock before reviewing the next step.</p>{error && <p role="alert" className="text-sm text-red-200">{error}</p>}<Button disabled={busy} onClick={onContinue}>{busy ? "Refreshing stock…" : `Continue to ${label}`}</Button></section>;
}
export default function ProductionWorkspace({ recipes, items, varianceThreshold, blocked, initialRecipe = null, suggestedTarget = null, returnLabel = "", onCancel, onSaved }) {
  const [data, setData] = useState({ recipes, items, varianceThreshold });
  const [frames, setFrames] = useState([{ id: 0, initialRecipe, suggestedTarget, snapshot: null }]);
  const [completed, setCompleted] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const frame = frames.at(-1);
  useEffect(() => {
    if (frames.length < 2) return;
    const unload = event => { event.preventDefault(); event.returnValue = ""; };
    const navigate = event => {
      const anchor = event.target.closest?.("a[href]");
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.getAttribute("href").startsWith("#")) return;
      if (!window.confirm("Leave this production workflow and discard its retained drafts?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [frames.length]);
  const parent = frames.at(-2), parentName = parent ? data.recipes.find(row => row._id === (parent.snapshot?.draft.recipe || parent.initialRecipe?._id))?.name || "previous preparation" : returnLabel;
  const refreshAndReturn = async () => {
    if (busy) return; setBusy(true); setError("");
    try {
      const latest = await fetchPreparationOptions();
      setData({ recipes: latest.recipes, items: latest.items, varianceThreshold: latest.productionVarianceThresholdPercent });
      if (frames.length > 1) { setFrames(current => current.slice(0, -1)); setCompleted(null); }
      else onCancel();
    } catch (failure) { setError(apiErrorMessage(failure)); }
    finally { setBusy(false); }
  };
  return <section aria-label="Production workspace" className="space-y-4"><div className="flex flex-wrap items-center gap-2 text-sm text-neutral-300"><span>Production workspace</span>{returnLabel && <span>→ {returnLabel}</span>}{frames.map(row => <span key={row.id}>→ {data.recipes.find(recipe => recipe._id === (row.snapshot?.draft.recipe || row.initialRecipe?._id))?.name || "Choose preparation"}</span>)}</div>{error && !completed && <p role="alert" className="text-red-200">{error}</p>}{completed ? <Completion id={completed} label={parentName} busy={busy} error={error} onContinue={refreshAndReturn}/> : <ProductionForm key={frame.id} recipes={data.recipes} items={data.items} varianceThreshold={data.varianceThreshold} blocked={blocked || busy} initialState={frame.snapshot} initialRecipe={frame.initialRecipe} suggestedTarget={frame.suggestedTarget} nested={frames.length > 1 || Boolean(returnLabel)} onCancel={frames.length > 1 ? refreshAndReturn : onCancel} onSaved={id => { if (frames.length > 1 || returnLabel) setCompleted(id); else onSaved(id); }} onSuspend={(snapshot, recipe, stock) => {
    setFrames(current => [...current.slice(0, -1), { ...current.at(-1), snapshot }, { id: current.at(-1).id + 1, initialRecipe: recipe, suggestedTarget: { quantity: stock.shortage, unit: stock.unit }, snapshot: null }]);
  }}/>}</section>;
}
