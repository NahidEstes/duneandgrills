"use client";

import { useEffect, useMemo, useState } from "react";
import { ChefHat, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateInventoryRecipe } from "@/src/api/inventoryApi.js";
import { Badge, Button, EmptyState, Field, cardClass, inputClass } from "./InventoryUI.jsx";
import { apiErrorMessage, formatQuantity, formatSar } from "./inventoryUtils.js";

const emptyLine = { inventoryItem: "", quantityPerSale: "", isActive: true };

export default function RecipeEditor({ selected, inventoryItems, onSaved }) {
  const [ingredients, setIngredients] = useState([]);
  const [doNotTrack, setDoNotTrack] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const recipe = selected?.recipe;
    setDoNotTrack(Boolean(recipe?.doNotTrack));
    setIsActive(recipe?.isActive !== false);
    setIngredients((recipe?.ingredients || []).map((line) => ({
      inventoryItem: line.inventoryItem?._id || line.inventoryItem,
      inventoryItemData: typeof line.inventoryItem === "object" ? line.inventoryItem : null,
      quantityPerSale: String(line.quantityPerSale ?? ""),
      isActive: line.isActive !== false,
    })));
  }, [selected]);

  const inventoryLookup = useMemo(() => new Map(inventoryItems.map((item) => [item._id, item])), [inventoryItems]);
  const detailsFor = (line) => inventoryLookup.get(line.inventoryItem) || line.inventoryItemData;
  const ingredientCost = ingredients.reduce((sum, line) => {
    const item = detailsFor(line);
    return line.isActive ? sum + Number(line.quantityPerSale || 0) * Number(item?.unitCost || 0) : sum;
  }, 0);
  const sellingPrice = Number(selected?.price || 0);
  const profit = sellingPrice - ingredientCost;
  const margin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;
  const selectedIds = new Set(ingredients.map((line) => line.inventoryItem).filter(Boolean));
  const updateLine = (index, field, value) => setIngredients((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line));
  const removeLine = (index) => setIngredients((current) => current.filter((_, lineIndex) => lineIndex !== index));

  const save = async () => {
    if (!doNotTrack && (!ingredients.length || ingredients.some((line) => !line.inventoryItem || !(Number(line.quantityPerSale) > 0)))) {
      return toast.error("Choose an inventory item and enter a quantity greater than zero for every ingredient.");
    }
    setSaving(true);
    try {
      await updateInventoryRecipe(selected._id, {
        doNotTrack,
        isActive,
        ingredients: ingredients.map(({ inventoryItem, quantityPerSale, isActive: lineActive }) => ({ inventoryItem, quantityPerSale: Number(quantityPerSale), isActive: lineActive })),
      });
      toast.success("Recipe updated.");
      await onSaved();
    } catch (error) { toast.error(apiErrorMessage(error, "Unable to update recipe.")); }
    finally { setSaving(false); }
  };

  if (!selected) return <section className={`${cardClass} min-h-[540px]`}><EmptyState title="Select a menu item" description="Choose a menu item to configure its inventory recipe." /></section>;

  return <div className="space-y-4">
    <section className={`${cardClass} overflow-hidden`}>
      <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="flex items-center gap-2"><h2 className="font-body text-xl font-semibold text-white">{selected.name}</h2><Badge tone={selected.recipeStatus === "configured" ? "success" : selected.recipeStatus === "do_not_track" ? "violet" : "danger"}>{selected.recipeStatus === "configured" ? "Configured" : selected.recipeStatus === "do_not_track" ? "Do Not Track" : "Not Configured"}</Badge></div><p className="mt-1 text-xs text-neutral-600">{selected.categoryRef?.name || selected.category} · Selling price {formatSar(selected.price)}</p></div>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-neutral-300"><input type="checkbox" className="h-4 w-4 accent-dune-amber" checked={doNotTrack} onChange={(event) => setDoNotTrack(event.target.checked)} />Do not track inventory</label>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-neutral-300"><input type="checkbox" className="h-4 w-4 accent-dune-amber" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />Recipe active</label>
        </div>
      </div>
      {doNotTrack ? <div className="p-8"><div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.07] p-5 text-center"><ChefHat className="mx-auto h-8 w-8 text-violet-400" /><p className="mt-3 font-medium text-white">Inventory tracking is disabled for this menu item</p><p className="mt-1 text-xs text-neutral-500">Ingredient mappings will be cleared when you save.</p></div></div> : <div className="p-5">
        <div className="mb-4 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-white">Ingredients</h3><p className="text-xs text-neutral-600">Quantities use each inventory item&apos;s base unit.</p></div><Button variant="secondary" size="sm" onClick={() => setIngredients((current) => [...current, { ...emptyLine }])}><Plus className="h-4 w-4" />Add ingredient</Button></div>
        <div className="space-y-2">
          {ingredients.map((line, index) => {
            const detail = detailsFor(line);
            return <div key={`${index}-${line.inventoryItem}`} className="grid gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-3 md:grid-cols-[minmax(210px,1.5fr)_0.75fr_0.55fr_0.7fr_auto] md:items-end">
              <Field label="Inventory item"><select className={inputClass} value={line.inventoryItem} onChange={(event) => updateLine(index, "inventoryItem", event.target.value)}><option value="">Choose ingredient</option>{detail && !inventoryLookup.has(detail._id) && <option value={detail._id}>{detail.name} (inactive)</option>}{inventoryItems.map((item) => <option key={item._id} value={item._id} disabled={selectedIds.has(item._id) && item._id !== line.inventoryItem}>{item.name} · {item.sku}</option>)}</select></Field>
              <Field label="Quantity per sale"><input className={inputClass} type="number" min="0.000001" step="any" value={line.quantityPerSale} onChange={(event) => updateLine(index, "quantityPerSale", event.target.value)} /></Field>
              <Field label="Unit"><div className={`${inputClass} flex items-center text-neutral-400`}>{detail?.unit || "—"}</div></Field>
              <Field label="Available"><div className={`${inputClass} flex items-center text-emerald-400`}>{detail ? formatQuantity(detail.currentStock, detail.unit) : "—"}</div></Field>
              <div className="flex h-10 items-center gap-1"><button type="button" onClick={() => updateLine(index, "isActive", !line.isActive)} className={`rounded-lg px-3 py-2 text-xs ${line.isActive ? "bg-emerald-500/10 text-emerald-300" : "bg-white/5 text-neutral-500"}`}>{line.isActive ? "Active" : "Inactive"}</button><button type="button" className="rounded-lg p-2.5 text-red-400 hover:bg-red-500/10" onClick={() => removeLine(index)} aria-label="Remove ingredient"><Trash2 className="h-4 w-4" /></button></div>
            </div>;
          })}
          {!ingredients.length && <EmptyState title="No ingredients added" description="Add the first ingredient to configure this recipe." action={<Button onClick={() => setIngredients([{ ...emptyLine }])}><Plus className="h-4 w-4" />Add ingredient</Button>} />}
        </div>
      </div>}
    </section>
    <section className={`${cardClass} p-5`}><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div><p className="text-xs text-neutral-600">Estimated ingredient cost</p><p className="mt-1 text-xl font-semibold text-dune-amber">{formatSar(ingredientCost)}</p></div><div><p className="text-xs text-neutral-600">Selling price</p><p className="mt-1 text-xl font-semibold text-white">{formatSar(sellingPrice)}</p></div><div><p className="text-xs text-neutral-600">Estimated profit</p><p className={`mt-1 text-xl font-semibold ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatSar(profit)}</p></div><div><p className="text-xs text-neutral-600">Estimated margin</p><p className={`mt-1 text-xl font-semibold ${margin >= 0 ? "text-emerald-400" : "text-red-400"}`}>{margin.toFixed(1)}%</p></div></div><div className="mt-5 flex justify-end"><Button onClick={save} disabled={saving}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ChefHat className="h-4 w-4" />}Update Recipe</Button></div></section>
  </div>;
}
