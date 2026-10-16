"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpenText, Check, ChevronDown, Info, List, Play, Printer, ShieldAlert } from "lucide-react";
import { InstructionSection, RecipeIngredients, RecipeReferences, RecipeWarnings } from "./RecipeContents.jsx";
import { recipeSections, recipeStatusLabel } from "./recipePresentation.js";

export default function RecipeReader({ recipe, manager, manage = false, manual, manualError, onNavigate, onAllRecipes, children }) {
  const sections = recipeSections(recipe), guide = recipe.category === "Kitchen Guides";
  const [preset, setPreset] = useState(0), [stepMode, setStepMode] = useState(false), [active, setActive] = useState(0), [checked, setChecked] = useState({});
  const [allSteps, setAllSteps] = useState(false);
  const sectionRef = useRef(null);
  const headingRef = useRef(null);
  useEffect(() => { if (window.matchMedia("(max-width: 767px)").matches && new URLSearchParams(window.location.search).has("recipe")) { headingRef.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); } }, [recipe.code, recipe.revision]);
  const select = index => { setActive(index); setAllSteps(false); requestAnimationFrame(() => { sectionRef.current?.focus({ preventScroll: true }); sectionRef.current?.previousElementSibling?.scrollIntoView({ block: "start", behavior: "smooth" }); }); };
  const viewAll = () => { setStepMode(false); setAllSteps(true); };
  return <article className={`recipe-reader ${stepMode ? "recipe-step-mode" : ""}`}>
    <header className="recipe-reader-heading">
      <div className="recipe-reader-actions recipe-no-print"><button className="recipe-button" onClick={onAllRecipes}><ArrowLeft size={17} />All Recipes</button><button className="recipe-button" onClick={() => window.print()}><Printer size={17} />Print recipe</button></div>
      <p className="recipe-print-only text-xs">DUNE &amp; GRILLS · RECIPE INSTRUCTIONS</p>
      <h2 ref={headingRef} tabIndex={-1}>{recipe.name}</h2>
      <p className="recipe-version"><span>{[recipe.code, ...recipe.aliases].join(" / ")}</span><span className={`recipe-status recipe-status-${recipe.status}`}>{recipeStatusLabel(recipe.status)}{recipe.currentPublished ? " · Current service version" : recipe.currentPublished === false && recipe.status === "published" ? " · Historical / superseded" : ""}</span><span>{recipe.persisted ? `Exact revision ${recipe.revision}` : "Source preview · not saved"}</span></p>
      {recipe.description && <p className="recipe-description">{recipe.description}</p>}
    </header>
    <RecipeWarnings recipe={recipe} />
    {manage && children}
    <details open={!manage} className={`recipe-reading-panel ${manage ? "recipe-card recipe-disclosure" : ""}`}><summary className={manage ? "recipe-no-print" : "hidden"}>Read recipe instructions</summary>
    <div className="recipe-preset-row">
      {!guide && <div className="recipe-presets recipe-no-print" aria-label="Verified quantity presets">{recipe.presets.map((option, index) => <button key={option.key} aria-pressed={preset === index} onClick={() => setPreset(index)}>{option.label}</button>)}</div>}
      {sections.length > 0 && <button className="recipe-button recipe-primary recipe-no-print" onClick={() => { if (stepMode) viewAll(); else { setStepMode(true); select(0); } }}>{stepMode ? <List size={18} /> : <Play size={18} />}{stepMode ? "View All Steps" : guide ? "Read Steps" : "Start Cooking"}</button>}
    </div>
    {!guide && <p className="recipe-preset-note"><Info size={16} aria-hidden="true" />Presets change listed ingredient quantities only. Cooking times, temperatures, storage limits and equipment loads are NOT multiplied.</p>}
    <div className="recipe-reader-layout">
      <div className="recipe-reader-content">
        {sections.length > 0 && <>
          {stepMode ? <div className="recipe-step-progress recipe-no-print"><span>Step {active + 1} of {sections.length}</span><progress value={active + 1} max={sections.length} aria-label="Reading step" /><button className="recipe-text-button" onClick={viewAll}><List size={17} />View All Steps</button></div> : <nav className="recipe-tabs recipe-no-print" aria-label="Recipe sections">{sections.map((section, index) => <button key={section.id} aria-pressed={!allSteps && active === index} onClick={() => select(index)}>{section.label}</button>)}</nav>}
          <div ref={sectionRef} tabIndex={-1} className="recipe-section-focus">
            {sections.map((section, index) => <div key={section.id} className={allSteps || active === index ? "recipe-section" : "recipe-section recipe-print-only"}>
              {section.id === "ingredients" ? <RecipeIngredients recipe={recipe} presetIndex={preset} /> : <InstructionSection title={section.label} rows={recipe[section.id]} checklist={stepMode} checked={checked[section.id]} onCheck={(row, value) => setChecked(current => ({ ...current, [section.id]: { ...current[section.id], [row]: value } }))} />}
            </div>)}
          </div>
          {stepMode && <p className="recipe-preset-note recipe-no-print"><Info size={16} />Reading checklist only. Nothing is saved to production, trial or stock records.</p>}
        </>}
        <RecipeReferences recipe={recipe} onNavigate={onNavigate} />
        <details className="recipe-card recipe-disclosure recipe-safety"><summary><ShieldAlert size={19} /><span>Storage, allergens &amp; essential notes</span><ChevronDown size={18} /></summary><div className="recipe-disclosure-body">
          <InstructionSection title="Storage controls" rows={recipe.storage} /><InstructionSection title="Allergens" rows={recipe.allergens} />
          {recipe.warnings.length > 0 && <section className="recipe-warning"><h3 className="font-semibold">Source review guidance</h3>{recipe.status === "published" && <p>These source warnings describe the manual’s original, untested status. This revision has an internal trial/approval record; this is not regulatory certification or shelf-life validation.</p>}{recipe.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</section>}
          {recipe.yieldNotes.length > 0 && <section className="recipe-card p-5"><h3 className="font-semibold">Yield &amp; preset notes</h3>{recipe.yieldNotes.map((note, index) => <p className="mt-2 text-sm leading-7 text-neutral-300" key={index}>{note}</p>)}</section>}
        </div></details>
        <details className="recipe-card recipe-disclosure recipe-source"><summary><BookOpenText size={19} /><span>Source &amp; Version Details</span><ChevronDown size={18} /></summary><div className="recipe-disclosure-body text-sm leading-7 text-neutral-300">
          <p>Source: Dune &amp; Grills English Kitchen Recipe Manual v{recipe.source.manualVersion}, {recipe.source.manualDate}. Manual pages {recipe.source.pages.join(", ")}. Source facts preserved, not independently certified.</p>
          <p>{recipe.revision > 1 ? "Restaurant revision — compare history against source; original references retained." : "Source-transcribed content — not proof of kitchen approval."}</p>
          {manager && recipe.importProvenance && <p className="break-all">Explicit import: {recipe.importProvenance.importedAt} · Source record SHA-256 {recipe.importProvenance.recordHash}</p>}
          <p className="recipe-no-print">{manualError ? "Manual availability could not be checked. Refresh to retry." : manual?.available === false ? "Private manual view and download are unavailable." : "Private manual attachments are unavailable."}</p>
          {recipe.approval && <p>Approved r{recipe.revision} by {recipe.approval.actor.name} · {formatRecipeDate(recipe.approval.at)} (Asia/Riyadh). {recipe.approval.reason} · Qualifying trial: {recipe.qualifyingTrialId}. Internal operational review only.</p>}
          {recipe.publication && <p>Published by {recipe.publication.actor.name} · {formatRecipeDate(recipe.publication.at)} (Asia/Riyadh).</p>}
          <p>Reading and printing do not record production or deduct stock.</p>
        </div></details>
        {!manage && children}
      </div>
      <aside className="recipe-overview recipe-card recipe-no-print" aria-label="Recipe overview"><h3>Recipe overview</h3><ol>{sections.map((section, index) => <li key={section.id}><button aria-current={active === index ? "step" : undefined} onClick={() => select(index)}><span>{stepMode && index < active ? <Check size={17} /> : index + 1}</span><strong>{section.label}</strong></button></li>)}</ol><button className="recipe-text-button" onClick={() => { const details = document.querySelector(".recipe-safety"); details.open = true; details.querySelector("summary").focus(); details.scrollIntoView({ block: "start" }); }}><ShieldAlert size={17} />Storage &amp; allergens</button></aside>
    </div>
    {stepMode && sections.length > 0 && <nav className="recipe-step-controls recipe-no-print" aria-label="Step navigation"><button className="recipe-button" disabled={active === 0} onClick={() => select(active - 1)}><ArrowLeft size={18} />Previous</button><button className="recipe-button recipe-primary" disabled={active === sections.length - 1} onClick={() => select(active + 1)}>Next step<ArrowRight size={18} /></button></nav>}
    </details>
  </article>;
}
export const formatRecipeDate = value => value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not recorded";
