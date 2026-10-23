"use client";
import { useState } from "react";
import DeliveryDialog from "../admin/delivery/DeliveryDialog.jsx";
import { Badge, Button } from "./InventoryUI.jsx";
import { preparationQuantityLabel as q } from "@/src/utils/preparationUnits.js";

export { default as PreparationIngredientPicker } from "./PreparationIngredientPicker.jsx";
export function PreparationSequence({ sequence, availability, currentItem }) {
  const [expanded, setExpanded] = useState(false);
  if (!sequence.nodes.length) return null;
  return <section aria-label="Preparation sequence" className="mb-4 space-y-3 rounded-xl border border-white/10 p-4"><h3 className="font-body font-semibold text-white">Preparation sequence</h3><p className="text-xs text-neutral-300">Dependencies appear first. Each production needs its own confirmation.</p><ol className="flex flex-wrap gap-2">{sequence.nodes.slice(0, expanded ? 100 : 12).map(node => {
    const stock = availability.fresh && availability.data.find(row => row.inventoryItem === node.id);
    return <li key={node.id} className="min-w-0 max-w-full space-y-1 rounded-lg border border-white/15 p-3"><p className="break-words text-sm text-white">{node.item?.name || "Item unavailable"}{node.id === String(currentItem) ? " · Current output" : " →"}</p><Badge tone={node.recipe?.isActive === false ? "warning" : stock?.usable > 0 ? "success" : "neutral"}>{node.recipe?.isActive === false ? "Recipe inactive" : node.id === String(currentItem) ? "To produce" : !stock || stock.unavailable ? "Stock not checked" : stock.usable > 0 ? `Usable ${q(stock.usable, stock.unit)}` : node.recipe ? "Production needed" : "Stock needed"}</Badge></li>;
  })}</ol>{sequence.nodes.length > 12 && <Button variant="ghost" onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer dependencies" : `Show all ${sequence.nodes.length} dependencies`}</Button>}{sequence.truncated && <p className="text-xs text-amber-200">Only the first 100 dependency items are displayed. Review the individual recipes for the remaining steps.</p>}</section>;
}
export function IngredientAvailability({ stock, fresh, recipe, disabled, onProduce, onViewRecipe }) {
  return <div className="space-y-3 rounded-xl border border-white/10 p-3"><dl className="grid grid-cols-3 gap-2 text-xs"><div><dt className="text-neutral-300">Required</dt><dd className="mt-1 break-words text-white">{q(fresh ? stock?.required : null, stock?.unit)}</dd></div><div><dt className="text-neutral-300">Usable</dt><dd className="mt-1 break-words text-emerald-300">{q(fresh ? stock?.usable : null, stock?.unit)}</dd></div><div><dt className="text-neutral-300">Short</dt><dd className="mt-1 break-words text-amber-200">{q(fresh ? stock?.shortage : null, stock?.unit)}</dd></div></dl>{recipe && <><p className="break-words text-xs text-neutral-300">Prepared · {recipe.name} · {recipe.isActive ? `v${recipe.version}` : "Recipe inactive; existing usable stock can still be consumed"}</p><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={disabled || !fresh || !recipe.isActive || !stock?.isActive || !(stock?.shortage > 0)} onClick={() => onProduce(recipe, stock)}>Produce {stock?.name || "this ingredient"}</Button><Button variant="ghost" onClick={() => onViewRecipe(recipe)}>View recipe</Button></div></>}</div>;
}
export function RecipeDefinitionDialog({ recipe, items, onClose }) {
  return <DeliveryDialog open title={`Recipe · ${recipe.name}`} onClose={onClose}><p className="text-sm text-neutral-300">v{recipe.version} · {recipe.isActive ? "Active" : "Inactive"} · Expected yield {q(recipe.outputQuantity, recipe.outputUnit)}</p><ul className="space-y-2">{recipe.ingredients.map(row => <li key={row.inventoryItem} className="rounded-lg border border-white/10 p-3 text-sm">{items.find(item => String(item._id) === String(row.inventoryItem))?.name || row.name || "Item unavailable"} · {q(row.enteredQuantity, row.enteredUnit)}</li>)}</ul><p className="whitespace-pre-wrap break-words text-sm text-neutral-300">{recipe.notes || "No preparation notes recorded."}</p><p className="text-xs text-neutral-300">Read-only recipe view. Stock and the original draft are unchanged.</p></DeliveryDialog>;
}
