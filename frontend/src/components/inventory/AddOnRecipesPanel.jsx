"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleSlash2, LoaderCircle, Plus, Puzzle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fetchAddOnInventoryRecipes, updateAddOnInventoryRecipe } from "@/src/api/inventoryApi.js";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import { Badge, Button, EmptyState, Field, LoadingState, cardClass, inputClass } from "./InventoryUI.jsx";
import { apiErrorMessage, formatQuantity, formatSar } from "./inventoryUtils.js";

const blankLine = { inventoryItem: "", quantityPerAddOn: "", isActive: true };
const labels = { configured: "Configured", not_configured: "Non-stock / unmapped", do_not_track: "Do Not Track" };

export default function AddOnRecipesPanel({ inventoryItems }) {
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [ingredients, setIngredients] = useState([]);
  const [doNotTrack, setDoNotTrack] = useState(false);
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchAddOnInventoryRecipes();
      setData(response);
      if (response.data?.length) setSelectedId((current) => current || response.data[0]._id);
    } catch (error) { toast.error(apiErrorMessage(error, "Unable to load add-on recipes.")); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const selected = data?.data?.find((row) => row._id === selectedId) || data?.data?.[0] || null;
  useEffect(() => {
    const recipe = selected?.inventoryRecipe;
    setDoNotTrack(Boolean(recipe?.doNotTrack));
    setActive(recipe?.isActive !== false);
    setIngredients((recipe?.ingredients || []).map((line) => ({ inventoryItem: line.inventoryItem?._id || line.inventoryItem, inventoryItemData: line.inventoryItem, quantityPerAddOn: String(line.quantityPerAddOn || ""), isActive: line.isActive !== false })));
  }, [selected]);
  const lookup = useMemo(() => new Map(inventoryItems.map((item) => [item._id, item])), [inventoryItems]);
  const used = new Set(ingredients.map((line) => line.inventoryItem));
  const totalCost = ingredients.reduce((sum, line) => {
    const item = lookup.get(line.inventoryItem) || line.inventoryItemData;
    return line.isActive ? sum + Number(line.quantityPerAddOn || 0) * Number(item?.unitCost || 0) : sum;
  }, 0);
  const updateLine = (index, values) => setIngredients((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...values } : row));
  const save = async () => {
    if (!doNotTrack && (!ingredients.length || ingredients.some((line) => !line.inventoryItem || !(Number(line.quantityPerAddOn) > 0)))) return toast.error("Add at least one valid ingredient or mark the add-on as Do Not Track.");
    setSaving(true);
    try {
      await updateAddOnInventoryRecipe(selected._id, { doNotTrack, isActive: active, ingredients: ingredients.map((line) => ({ inventoryItem: line.inventoryItem, quantityPerAddOn: Number(line.quantityPerAddOn), isActive: line.isActive })) });
      toast.success("Add-on inventory recipe saved.");
      await load();
    } catch (error) { toast.error(apiErrorMessage(error, "Unable to save add-on recipe.")); }
    finally { setSaving(false); }
  };

  if (loading && !data) return <LoadingState />;
  return <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
    <section className={`${cardClass} h-fit overflow-hidden`}>
      <div className="border-b border-white/10 p-4"><h2 className="text-sm font-semibold text-white">Menu Add-ons</h2><p className="mt-1 text-xs text-neutral-600">Map physical add-ons to inventory ingredients.</p></div>
      {data?.data?.length ? <div className="divide-y divide-white/[0.06]">{data.data.map((row) => <button key={row._id} type="button" onClick={() => setSelectedId(row._id)} className={`flex w-full items-center justify-between gap-3 border-l-2 px-4 py-3 text-left ${selected?._id === row._id ? "border-dune-amber bg-dune-amber/[0.07]" : "border-transparent hover:bg-white/[0.03]"}`}><span><span className="block text-sm text-white">{row.name}</span><span className="text-xs text-neutral-600">{formatSar(row.price)}</span></span><Badge tone={row.recipeStatus === "configured" ? "success" : row.recipeStatus === "do_not_track" ? "violet" : "neutral"}>{labels[row.recipeStatus]}</Badge></button>)}</div> : <EmptyState title="No add-ons found" />}
    </section>
    <section className={`${cardClass} overflow-hidden`}>
      {!selected ? <EmptyState title="Select an add-on" /> : <>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5"><div><div className="flex items-center gap-2"><Puzzle className="h-5 w-5 text-dune-amber" /><h2 className="text-lg font-semibold text-white">{selected.name}</h2></div><p className="mt-1 text-xs text-neutral-600">Ingredient cost per selected add-on: {formatSar(totalCost)}</p></div><div className="flex flex-wrap gap-2"><label className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs"><input type="checkbox" checked={doNotTrack} onChange={(event) => setDoNotTrack(event.target.checked)} className="accent-orange-500" /><CircleSlash2 className="h-4 w-4" />Do Not Track</label><label className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="accent-orange-500" />Recipe active</label></div></div>
        <div className="p-5">
          {doNotTrack ? <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] p-6 text-center text-sm text-violet-200">This add-on is explicitly excluded from inventory tracking.</div> : <div className="space-y-2">
            {ingredients.map((line, index) => { const item = lookup.get(line.inventoryItem) || line.inventoryItemData; return <div key={`${index}-${line.inventoryItem}`} className="grid gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-3 md:grid-cols-[minmax(180px,1.5fr)_130px_80px_120px_120px_auto] md:items-end"><Field label="Inventory item"><DarkSelect className={inputClass} value={line.inventoryItem} onChange={(event) => updateLine(index, { inventoryItem: event.target.value })}><option value="">Choose ingredient</option>{inventoryItems.map((option) => <option key={option._id} value={option._id} disabled={used.has(option._id) && option._id !== line.inventoryItem}>{option.name} · {option.sku}</option>)}</DarkSelect></Field><Field label="Qty per add-on"><input className={inputClass} type="number" min="0.000001" step="any" value={line.quantityPerAddOn} onChange={(event) => updateLine(index, { quantityPerAddOn: event.target.value })} /></Field><Field label="Unit"><div className={inputClass}>{item?.unit || "—"}</div></Field><Field label="Available"><div className={inputClass}>{item ? formatQuantity(item.currentStock, item.unit) : "—"}</div></Field><Field label="Ingredient cost"><div className={`${inputClass} text-dune-amber`}>{item ? formatSar(Number(line.quantityPerAddOn || 0) * Number(item.unitCost || 0)) : "—"}</div></Field><button type="button" aria-label="Remove ingredient" onClick={() => setIngredients((rows) => rows.filter((_, rowIndex) => rowIndex !== index))} className="mb-0.5 rounded-lg p-3 text-red-400 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button></div>; })}
            {!ingredients.length && <EmptyState title="No ingredients mapped" description="Leave as non-stock, choose Do Not Track, or add ingredients." />}
            <Button variant="secondary" size="sm" onClick={() => setIngredients((rows) => [...rows, { ...blankLine }])}><Plus className="h-4 w-4" />Add ingredient</Button>
          </div>}
          <div className="mt-5 flex justify-end"><Button disabled={saving} onClick={save}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Puzzle className="h-4 w-4" />}Save Add-on Recipe</Button></div>
        </div>
      </>}
    </section>
  </div>;
}
