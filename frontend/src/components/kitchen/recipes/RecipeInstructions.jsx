"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpenText, ChefHat, Download, Flame, Printer, Search } from "lucide-react";
import { useAuth } from "../../../context/AuthContext.jsx";
import { fetchRecipeInstructionManual, fetchRecipeInstructions } from "../../../api/recipeInstructionsApi.js";
import { RECIPE_CATEGORIES, RECIPE_TABS, recipeMatches, resolveRecipe } from "./recipePresentation.js";
import { InstructionSection, RecipeIngredients, RecipeReferences, RecipeWarnings } from "./RecipeContents.jsx";
import RecipeDraftManager from "./RecipeDraftManager.jsx";
import "./recipeInstructions.css";

export default function RecipeInstructions() {
  const { user, logout } = useAuth();
  const router = useRouter(), params = useSearchParams();
  const manager = ["admin", "manager"].includes(user?.role);
  const [recipes, setRecipes] = useState(null), [error, setError] = useState("");
  const [manual, setManual] = useState(null), [manualError, setManualError] = useState(false);
  const [search, setSearch] = useState(""), [category, setCategory] = useState("All");
  const [tab, setTab] = useState("ingredients"), [preset, setPreset] = useState({ code: "B01", index: 0 });
  const [refresh, setRefresh] = useState(0);
  const titleRef = useRef(null);
  const expired = useCallback(() => { void logout(); }, [logout]);
  // AuthContext callbacks are not stable; avoid repeating reads on each render.
  const expiredRef = useRef(expired);
  useEffect(() => { expiredRef.current = expired; }, [expired]);
  const onSessionExpired = useCallback(() => expiredRef.current(), []);
  useEffect(() => {
    const controller = new AbortController();
    fetchRecipeInstructions({ signal: controller.signal }).then(rows => { if (!controller.signal.aborted) { setRecipes(rows); setError(""); } }).catch(err => {
      if (controller.signal.aborted) return;
      if (err.response?.status === 401) onSessionExpired();
      if ([401, 403].includes(err.response?.status)) setRecipes(null);
      setError(err.response?.data?.message || "Recipe instructions could not be loaded.");
    });
    if (manager) fetchRecipeInstructionManual({ signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setManual(value); setManualError(false); } }).catch(err => { if (!controller.signal.aborted) { setManualError(true); if (err.response?.status === 401) onSessionExpired(); } });
    return () => controller.abort();
  }, [manager, refresh, user?._id, onSessionExpired]);
  const requestedCode = params.get("recipe") || "B01";
  const recipe = recipes && resolveRecipe(recipes, requestedCode);
  const visible = recipes?.filter(row => recipeMatches(row, search, category)) || [];
  const navigate = code => {
    setPreset({ code, index: 0 }); setTab("ingredients");
    router.push(`/kitchen/recipes?recipe=${encodeURIComponent(code)}`, { scroll: false });
    requestAnimationFrame(() => titleRef.current?.focus());
  };
  // Presets are keyed with the recipe so browser Back/Forward cannot retain an invalid index.
  const selectedPreset = recipe && (preset.code === recipe.code ? Math.min(preset.index, recipe.presets.length - 1) : 0);
  const updateSaved = next => setRecipes(current => current.map(row => row.code === next.code ? next : row));
  return <div className="recipe-workspace min-h-screen bg-[#080b0d] text-white">
    <aside className="recipe-sidebar recipe-no-print">
      <Link href="/kitchen" className="mb-7 flex items-center gap-3"><Flame className="h-9 w-9 fill-dune-amber text-dune-amber" /><span><span className="font-display text-xl tracking-widest">DUNE &amp; GRILLS</span><span className="block text-[10px] tracking-[0.2em] text-neutral-400">KITCHEN WORKSPACE</span></span></Link>
      <nav aria-label="Kitchen navigation" className="flex flex-wrap gap-2 lg:flex-col"><Link href="/kitchen" className="recipe-nav"><ChefHat className="h-5 w-5" />Kitchen Orders</Link><Link href="/kitchen/recipes" aria-current="page" className="recipe-nav border-dune-amber/40 bg-dune-amber/10 text-dune-amber"><BookOpenText className="h-5 w-5" />Recipe Instructions</Link>{manager && <Link href="/admin" className="recipe-nav">Admin Dashboard</Link>}</nav>
      <p className="mt-6 text-xs text-neutral-500">Private access · {user?.name}</p>
    </aside>
    <main className="recipe-main min-w-0">
      <header className="recipe-no-print flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div><h1 className="text-2xl font-bold sm:text-3xl">Recipe Instructions</h1><p className="mt-1 text-sm text-neutral-400">One standard. Every plate. · Restricted pilot review</p></div>
        <div className="flex flex-wrap gap-2"><button className="recipe-button" disabled={!recipe} onClick={() => window.print()}><Printer className="h-4 w-4" />Print recipe</button>{manager && <><button disabled className="recipe-button" aria-describedby="manual-state"><BookOpenText className="h-4 w-4" />View manual</button><button disabled className="recipe-button" aria-describedby="manual-state"><Download className="h-4 w-4" />Download</button></>}</div>
      </header>
      {manager && <p id="manual-state" className="recipe-no-print mt-3 text-xs leading-6 text-neutral-400">{manualError ? "Manual availability could not be checked. Reload to retry." : manual ? manual.message : "Checking private manual availability…"}</p>}
      {error && <div role="alert" className="recipe-warning mt-5">{error}{recipes && <p>Retained information may be outdated.</p>}<button className="recipe-button mt-3" onClick={() => setRefresh(n => n + 1)}>Retry / reload drafts</button></div>}
      {!recipes && !error && <p role="status" className="py-10 text-neutral-400">Loading recipe instructions…</p>}
      {recipes && !manager && <section className="recipe-card mt-6 p-8"><h2 className="text-xl font-semibold">Approved recipe instructions are not yet available</h2><p className="mt-3 text-neutral-400">The pilot requires owner/chef trial and approval in a later phase. Unapproved drafts are restricted to Admin/Manager review.</p></section>}
      {recipes && manager && <div className="recipe-reading-grid mt-5">
        <section aria-label="Recipe search and list" className="recipe-list recipe-no-print min-w-0">
          <label className="relative block"><Search className="absolute left-3 top-3 h-5 w-5 text-neutral-400" /><span className="sr-only">Search recipes</span><input value={search} onChange={e => setSearch(e.target.value)} maxLength={100} placeholder="Search names or codes…" className="recipe-input recipe-search-input" /></label>
          <div className="my-3 flex flex-wrap gap-2" aria-label="Recipe categories">{["All", ...RECIPE_CATEGORIES].map(value => <button key={value} className={`recipe-filter ${category === value ? "border-dune-amber bg-dune-amber/15 text-dune-amber" : "border-white/10 text-neutral-400"}`} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div>
          <div className="space-y-3">{visible.map(row => <button key={row.code} onClick={() => navigate(row.code)} aria-pressed={recipe?.code === row.code} className={`recipe-list-item ${recipe?.code === row.code ? "border-dune-amber bg-dune-amber/10" : "border-white/10"}`}>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/5 text-dune-amber"><ChefHat className="h-6 w-6" /></span><span className="min-w-0"><span className="block font-semibold">{row.name}</span><span className="mt-1 block text-xs text-neutral-400">{[row.code, ...row.aliases].join(" / ")} · {row.status === "draft" ? "Draft" : "Trial required"}</span></span>
          </button>)}</div>
          {!visible.length && <p className="py-6 text-sm text-neutral-400">No matching pilot recipes. Only B01, S1/HB01 and T1 are included; Kitchen Guides has no pilot content.</p>}
        </section>
        {!recipe ? <section className="recipe-card p-6"><h2>Recipe unavailable</h2><p className="mt-3 text-sm text-neutral-400">Select a pilot from the list.</p></section> : <article key={recipe.code} className="min-w-0 space-y-4">
          <header className="recipe-card relative overflow-hidden p-6 sm:p-8">
            <p className="recipe-print-only mb-3 text-xs font-semibold">DUNE &amp; GRILLS · RECIPE INSTRUCTIONS</p>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-dune-amber">{recipe.category} · {[recipe.code, ...recipe.aliases].join(" / ")}</p>
            <h2 ref={titleRef} tabIndex={-1} className="text-2xl font-bold outline-none sm:text-4xl">{recipe.name}</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-300">{recipe.description}</p>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-neutral-400"><span className="rounded-full border border-dune-amber/30 bg-dune-amber/10 px-3 py-1 text-dune-amber">{recipe.status === "draft" ? "Draft" : "Trial required"}</span><span>Recipe/source v{recipe.recipeVersion}</span><span>Manual pages {recipe.source.pages.join(", ")}</span><span>{recipe.persisted ? `Saved draft · revision ${recipe.revision}` : "Source preview · not saved to database"}</span></div>
            {recipe.code !== "B01" && <button onClick={() => navigate("B01")} className="recipe-no-print recipe-button mt-4"><ArrowLeft className="h-4 w-4" />Return to B01</button>}
          </header>
          <RecipeWarnings recipe={recipe} />
          <div className="recipe-no-print flex flex-wrap items-center gap-2"><span className="mr-2 text-xs text-neutral-400">Verified preset</span>{recipe.presets.map((option, i) => <button key={option.key} className={`recipe-filter border ${selectedPreset === i ? "border-dune-amber text-dune-amber" : "border-white/10 text-neutral-400"}`} aria-pressed={selectedPreset === i} onClick={() => setPreset({ code: recipe.code, index: i })}>{option.label}</button>)}</div>
          <nav className="recipe-tabs recipe-no-print" aria-label="Recipe sections">{RECIPE_TABS.map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)} className={`border-b-2 px-4 py-3 text-sm ${tab === id ? "border-dune-amber text-dune-amber" : "border-transparent text-neutral-400"}`}>{label}</button>)}</nav>
          <div className={tab === "ingredients" ? "" : "recipe-print-only"}><RecipeIngredients recipe={recipe} presetIndex={selectedPreset} /></div>
          <div className={tab === "preparation" ? "" : "recipe-print-only"}><InstructionSection title="Preparation" rows={recipe.preparation} /></div>
          <div className={tab === "cooking" ? "space-y-4" : "recipe-print-only space-y-4"}><InstructionSection title="Cooking" rows={recipe.cooking} /><InstructionSection title="Assembly" rows={recipe.assembly} /></div>
          <div className={tab === "serving" ? "space-y-4" : "recipe-print-only space-y-4"}><InstructionSection title="Serving" rows={recipe.serving} /><InstructionSection title="Delivery" rows={recipe.delivery} /></div>
          <div className={tab === "storage" ? "space-y-4" : "recipe-print-only space-y-4"}><InstructionSection title="Storage controls" rows={recipe.storage} /><InstructionSection title="Allergens" rows={recipe.allergens} /></div>
          <RecipeReferences recipe={recipe} onNavigate={navigate} />
          <RecipeDraftManager key={`${recipe.code}-${recipe.revision}`} recipe={recipe} onSaved={updateSaved} onSessionExpired={onSessionExpired} />
          <p className="text-xs leading-6 text-neutral-500">Source: Dune &amp; Grills English Kitchen Recipe Manual v{recipe.source.manualVersion}, {recipe.source.manualDate}. Source facts preserved, not independently certified. Reading and printing do not record production or deduct stock.</p>
        </article>}
      </div>}
    </main>
  </div>;
}
