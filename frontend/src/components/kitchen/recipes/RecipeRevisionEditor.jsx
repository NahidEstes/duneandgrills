"use client";
import { useState } from "react";
const sections = ["preparation", "cooking", "assembly", "serving", "delivery", "storage", "allergens", "yieldNotes"];
export const editableRecipeContent = recipe => Object.fromEntries(["name", "description", "presets", "ingredients", ...sections, "linkedPreparationCodes"].map(key => [key, structuredClone(recipe[key])]));
export default function RecipeRevisionEditor({ content, setContent, recipeCode, preparationOptions = [], guide = false }) {
  const [sectionText, setSectionText] = useState(() => Object.fromEntries(sections.map(key => [key, content[key].join("\n")])));
  const update = (key, value) => setContent(current => ({ ...current, [key]: value }));
  const ingredient = (index, key, value) => update("ingredients", content.ingredients.map((row, i) => i === index ? { ...row, [key]: value } : row));
  return <details className="rounded-lg border border-white/10 p-3"><summary className="cursor-pointer text-sm text-dune-amber">Edit instructions / create new revision</summary>
    <p className="my-3 text-xs text-neutral-400">All edits create a new draft requiring a fresh trial. Source version, safety warnings and historical instructions remain traceable. Do not invent safety limits.</p>
    <label className="block text-sm">Recipe name<input className="recipe-input my-2" value={content.name} maxLength={180} required onChange={e => update("name", e.target.value)} /></label>
    <label className="block text-sm">Description<textarea className="recipe-input my-2" value={content.description} maxLength={1500} onChange={e => update("description", e.target.value)} /></label>
    <h4 className="my-3 font-semibold">Ingredients · explicit preset quantities in grams</h4>
    {content.ingredients.map((row, index) => <fieldset key={index} className="mb-3 grid gap-2 rounded-lg border border-white/10 p-3 sm:grid-cols-2"><legend className="text-xs">Ingredient {index + 1}</legend>
      <label className="text-xs">Name<input className="recipe-input mt-1" value={row.name} maxLength={180} required onChange={e => ingredient(index, "name", e.target.value)} /></label>
      <label className="text-xs">Weight basis<input className="recipe-input mt-1" value={row.basis} maxLength={120} required onChange={e => ingredient(index, "basis", e.target.value)} /></label>
      {content.presets.map((preset, i) => <label key={preset.key} className="text-xs">{preset.label} · g<input type="number" step="any" min="0.000001" className="recipe-input mt-1" value={row.quantities[i]} required onChange={e => ingredient(index, "quantities", row.quantities.map((q, j) => j === i ? Number(e.target.value) : q))} /></label>)}
      <label className="text-xs sm:col-span-2">Supplier specification / brands<textarea className="recipe-input mt-1" maxLength={1500} value={row.specification} onChange={e => ingredient(index, "specification", e.target.value)} /></label>
      {content.presets.map((preset, i) => <label key={`count-${preset.key}`} className="text-xs">Count description · {preset.label}<input className="recipe-input mt-1" value={row.counts?.[i] || ""} maxLength={180} onChange={e => ingredient(index, "counts", content.presets.map((_, j) => j === i ? e.target.value : row.counts?.[j] || ""))} /></label>)}
      <button type="button" className="recipe-button justify-self-start" disabled={content.ingredients.length <= 1} onClick={() => update("ingredients", content.ingredients.filter((_, i) => i !== index))}>Remove ingredient</button>
    </fieldset>)}
    {!guide && <button type="button" className="recipe-button" disabled={content.ingredients.length >= 100} onClick={() => update("ingredients", [...content.ingredients, { name: "", basis: "", specification: "", unit: "g", quantities: content.presets.map(() => 1), counts: [] }])}>Add ingredient</button>}
    {sections.map(key => <label key={key} className="mt-4 block text-sm capitalize">{key === "yieldNotes" ? "Yield notes (label estimates explicitly)" : key} · one instruction per line<textarea className="recipe-input mt-2 min-h-28" value={sectionText[key]} onChange={e => { setSectionText(current => ({ ...current, [key]: e.target.value })); update(key, e.target.value.split("\n").filter(line => line.trim())); }} /></label>)}
    <fieldset className="mt-4"><legend className="text-sm">Linked preparations (S1 = HB01; variants never automatic)</legend>{preparationOptions.map(({ code, name }) => <label key={code} className="mr-4 inline-flex items-center gap-2 text-sm"><input type="checkbox" disabled={recipeCode === code} checked={content.linkedPreparationCodes.includes(code)} onChange={e => update("linkedPreparationCodes", e.target.checked ? [...content.linkedPreparationCodes, code] : content.linkedPreparationCodes.filter(c => c !== code))} />{code} · {name}</label>)}</fieldset>
  </details>;
}
