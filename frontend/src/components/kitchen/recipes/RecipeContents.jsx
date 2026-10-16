import { ChefHat, ImageOff, Link2 } from "lucide-react";
import { quantityLabel } from "./recipePresentation.js";

export function InstructionSection({ title, rows = [], checklist = false, checked = {}, onCheck }) {
  return <section className="recipe-card p-5">
    <h3 className="mb-4 flex items-center gap-2 text-base font-semibold"><ChefHat className="h-5 w-5 text-dune-amber" aria-hidden="true" />{title}</h3>
    {rows.length ? <ol className="space-y-4">{rows.map((row, index) => <li key={index} className="flex gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dune-amber/50 text-xs text-dune-amber">{String(index + 1).padStart(2, "0")}</span>
      <p className="recipe-instruction-text">{row}</p>
      {checklist && <label className="recipe-no-print recipe-reading-check"><span className="sr-only">Read {title.toLowerCase()} instruction {index + 1}</span><input type="checkbox" checked={Boolean(checked[index])} onChange={e => onCheck(index, e.target.checked)} /></label>}
    </li>)}</ol> : <p className="text-sm text-neutral-400">No separate {title.toLowerCase()} instructions specified in the source manual.</p>}
  </section>;
}

export function RecipeIngredients({ recipe, presetIndex }) {
  if (recipe.category === "Kitchen Guides") return <section className="recipe-card p-5"><h3 className="font-semibold">Shared source guide</h3><p className="mt-3 text-sm text-neutral-400">No production ingredients or yield. Read Preparation, Serving and Storage; publication requires documented staff rehearsal and qualified review.</p></section>;
  return <section className="recipe-card overflow-hidden">
    <div className="flex flex-wrap justify-between gap-2 border-b border-white/10 p-5"><h3 className="font-semibold">Ingredients</h3><span className="text-xs text-neutral-400">{recipe.presets[presetIndex].label} · manual quantities, not stock deductions</span></div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-dune-amber"><tr><th className="p-4">Ingredient / specification</th><th className="p-4">Quantity</th><th className="p-4">Weight basis</th></tr></thead>
      <tbody>{recipe.ingredients.map((row, index) => <tr key={index} className="border-t border-white/[0.07]">
        <td className="p-4"><span className="font-medium text-white">{row.name}</span>{row.specification && <p className="mt-1 max-w-md text-xs leading-5 text-neutral-400">{row.specification}</p>}</td>
        <td className="whitespace-nowrap p-4 font-medium text-dune-amber">{quantityLabel(row, presetIndex)}</td><td className="p-4 text-neutral-400">{row.basis}</td>
      </tr>)}</tbody></table></div>
  </section>;
}

export function RecipeReferences({ recipe, onNavigate, inventoryLabel }) {
  return <div className="recipe-references space-y-3">
    <section className="recipe-card p-5"><h3 className="mb-3 flex items-center gap-2 font-semibold"><Link2 className="h-4 w-4 text-dune-amber" />Preparation links</h3>
      {recipe.linkedPreparationCodes.length ? <div className="flex flex-wrap gap-2">{recipe.linkedPreparationCodes.map(code => <button key={code} onClick={() => onNavigate(code, recipe.dependencyPins?.find(pin => pin.code === code)?.revision)} className="recipe-button text-sm">{code === "HB01" ? "S1 / HB01 · House Burger Sauce" : code === "T1" ? "T1 · Caramelized Onion" : `${code} · Preparation instructions`} →</button>)}</div> : <p className="text-sm text-neutral-400">No linked preparation recipe. Optional variants are not automatic dependencies.</p>}
      {recipe.linkedPreparationCodes.length > 0 && <p className="recipe-print-only text-sm">{recipe.linkedPreparationCodes.join("; ")}</p>}
      {inventoryLabel && <p className="mt-4 text-xs text-neutral-400">Inventory recipe: {inventoryLabel}</p>}
    </section>
    <p className="recipe-media-state"><ImageOff className="h-4 w-4 shrink-0" aria-hidden="true" />{recipe.category === "Kitchen Guides" ? "Private attachments unavailable." : "Serving photo unavailable — owner-provided reference required."}</p>
  </div>;
}

export function RecipeWarnings({ recipe }) {
  return <aside className={`recipe-warning space-y-2 ${recipe.status === "published" && recipe.currentPublished !== false ? "recipe-service-notice" : ""}`} aria-label="Recipe review warnings">
    <p className="font-semibold">{recipe.status.replaceAll("_", " ").toUpperCase()} — {recipe.status === "published" ? recipe.currentPublished === false ? "HISTORICAL VERSION — verify current service card" : "INTERNALLY APPROVED SERVICE INSTRUCTIONS" : "NOT PUBLISHED FOR REGULAR SERVICE"}</p>
  </aside>;
}
