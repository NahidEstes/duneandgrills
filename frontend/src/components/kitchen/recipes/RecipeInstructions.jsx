"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpenText, ChefHat, ChevronRight, Flame, Menu, RefreshCw, Search } from "lucide-react";
import { useAuth } from "../../../context/AuthContext.jsx";
import { fetchRecipeInstruction, fetchRecipeInstructionManual, fetchRecipeInstructions } from "../../../api/recipeInstructionsApi.js";
import { CATEGORY_LABELS, RECIPE_CATEGORIES, recipeMatches, recipeStatusLabel, resolveRecipe } from "./recipePresentation.js";
import RecipeReader from "./RecipeReader.jsx";
import RecipeDraftManager from "./RecipeDraftManager.jsx";
import RecipeWorkflow from "./RecipeWorkflow.jsx";
import "./recipeInstructions.css";

export default function RecipeInstructions() {
  const { user, logout } = useAuth(), router = useRouter(), params = useSearchParams();
  const manager = ["admin", "manager"].includes(user?.role);
  const view = params.get("view") === "trial" ? "trial" : params.get("view") === "manage" && manager ? "manage" : "published";
  const requestedCode = params.get("recipe"), requestedRevision = params.get("revision");
  const requestScope = `${user?._id}-${user?.role}-${view}`;
  const [recipes, setRecipes] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [loadedView, setLoadedView] = useState(null), [exact, setExact] = useState(null);
  const [manual, setManual] = useState(null), [manualError, setManualError] = useState(false);
  const [search, setSearch] = useState(""), [category, setCategory] = useState("All"), [refresh, setRefresh] = useState(0);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const expiredRef = useRef(logout);
  const searchRef = useRef(null);
  useEffect(() => { if (!requestedCode && window.matchMedia("(max-width: 767px)").matches) { window.scrollTo({ top: 0 }); searchRef.current?.focus({ preventScroll: true }); } }, [requestedCode]);
  useEffect(() => { expiredRef.current = logout; }, [logout]);
  const onSessionExpired = useCallback(() => { void expiredRef.current(); }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true);
    const options = { signal: controller.signal, params: view === "manage" ? {} : { view } };
    Promise.all([fetchRecipeInstructions(options), requestedRevision && requestedCode ? fetchRecipeInstruction(requestedCode, { signal: controller.signal, params: { revision: requestedRevision, view } }) : Promise.resolve(null)]).then(([rows, selected]) => {
      if (!controller.signal.aborted) { setRecipes(rows); setLoadedView(requestScope); setExact(selected ? { key: `${requestScope}-${requestedCode}-${requestedRevision}`, row: selected } : null); setError(""); }
    }).catch(err => {
      if (controller.signal.aborted) return;
      if (err.response?.status === 401) onSessionExpired();
      if ([401, 403].includes(err.response?.status)) setRecipes(null);
      setError(err.response?.data?.message || "Recipe instructions could not be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    if (manager) fetchRecipeInstructionManual({ signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setManual(value); setManualError(false); } }).catch(err => { if (!controller.signal.aborted) { setManualError(true); if (err.response?.status === 401) onSessionExpired(); } });
    return () => controller.abort();
  }, [manager, refresh, onSessionExpired, view, requestedCode, requestedRevision, requestScope]);
  const workingRecipe = loadedView === requestScope && recipes && resolveRecipe(recipes, requestedCode || recipes[0]?.code);
  const recipe = requestedRevision ? exact?.key === `${requestScope}-${requestedCode}-${requestedRevision}` ? exact.row : null : workingRecipe;
  const visible = loadedView === requestScope ? recipes?.filter(row => recipeMatches(row, search, category)) || [] : [];
  const navigate = (code, revision) => router.push(`/kitchen/recipes?recipe=${encodeURIComponent(code)}&view=${view}${revision ? `&revision=${revision}` : ""}`, { scroll: false });
  const allRecipes = () => router.push(`/kitchen/recipes?view=${view}`, { scroll: false });
  const updateSaved = next => { setRecipes(current => current?.map(row => row.code === next.code ? next : row)); router.replace(`/kitchen/recipes?recipe=${next.code}&view=manage`, { scroll: false }); setRefresh(n => n + 1); };
  const printState = recipe ? `DUNE & GRILLS · ${recipe.code} · r${recipe.revision} · ${recipeStatusLabel(recipe.status).toUpperCase()} · ${recipe.status === "published" ? recipe.currentPublished === false ? "HISTORICAL / SUPERSEDED" : "VERIFY CURRENT SERVICE CARD" : "NOT PUBLISHED FOR REGULAR SERVICE"}` : "NO RECIPE SELECTED";
  return <div data-recipe-status={recipe?.status || "draft"} className={`recipe-workspace ${requestedCode ? "recipe-has-selection" : ""}`}>
    <style>{`@media print { @page recipe-instructions { @bottom-center { content: ${JSON.stringify(printState)}; } } @page recipe-approved { @bottom-center { content: ${JSON.stringify(printState)}; } } @page recipe-published { @bottom-center { content: ${JSON.stringify(printState)}; } } }`}</style>
    <aside className="recipe-sidebar recipe-no-print">
      <Link href="/kitchen" className="recipe-brand"><Flame size={30} aria-hidden="true" /><span>DUNE <b>&amp;</b> GRILLS</span></Link>
      <button className="recipe-menu-button recipe-button" aria-expanded={navigationOpen} aria-controls="recipe-application-links" onClick={() => setNavigationOpen(value => !value)}><Menu size={20} /><span className="sr-only">Kitchen menu</span></button>
      <div id="recipe-application-links" className="recipe-app-links" data-open={navigationOpen}>
      <nav aria-label="Kitchen navigation"><Link href="/kitchen" className="recipe-nav"><ChefHat size={20} />Kitchen Orders</Link><Link href="/kitchen/recipes" aria-current="page" className="recipe-nav recipe-nav-current"><BookOpenText size={20} />Recipes</Link>{manager && <Link href="/admin" className="recipe-nav">Admin Dashboard</Link>}</nav>
      <p>Private kitchen · {user?.name}</p>
      <div id="public-app-options" />
      </div>
    </aside>
    <main className="recipe-main">
      <header className="recipe-topbar recipe-no-print"><h1>Recipe Instructions</h1><button className="recipe-button" disabled={loading} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={16} className={loading ? "animate-spin" : ""} />{loading ? "Refreshing…" : "Refresh"}</button></header>
      <nav className="recipe-views recipe-no-print" aria-label="Instruction visibility">{[["published", "Service Recipes"], ["trial", "Kitchen Trials"], ...(manager ? [["manage", "Manage Recipes"]] : [])].map(([id, label]) => <Link key={id} aria-current={view === id ? "page" : undefined} href={`/kitchen/recipes?view=${id}`}>{label}</Link>)}</nav>
      {view === "trial" && <p className="recipe-trial-notice recipe-no-print">Authorized trial view — unpublished instructions must not be used for regular service.</p>}
      {error && <div role="alert" className="recipe-warning recipe-load-state">{error}{recipes && <p>Retained information may be outdated. Refresh before editing or reviewing.</p>}<button className="recipe-button mt-3" onClick={() => setRefresh(n => n + 1)}>Retry / reload recipes</button></div>}
      {(!recipes || loadedView !== requestScope) && !error && <p role="status" className="recipe-load-state">Loading recipe instructions…</p>}
      {recipes && loadedView === requestScope && !recipes.length && <section className="recipe-card recipe-empty"><BookOpenText size={32} /><h2>No {view === "trial" ? "trial" : "published"} recipe instructions available</h2><p>A revision needs a qualifying kitchen trial, approval and publication before regular service. Nothing is published automatically.</p></section>}
      {recipes && loadedView === requestScope && recipes.length > 0 && <div className="recipe-reading-grid">
        <section aria-label="Recipe search and list" className="recipe-list recipe-no-print">
          <h2>Recipe library</h2><label className="recipe-search"><Search size={19} aria-hidden="true" /><span className="sr-only">Search recipes</span><input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} maxLength={100} placeholder="Search name or code" className="recipe-input" /></label>
          <div className="recipe-categories" aria-label="Recipe categories">{["All", ...RECIPE_CATEGORIES].map(value => <button key={value} aria-pressed={category === value} className="recipe-filter" onClick={() => setCategory(value)}>{CATEGORY_LABELS[value]}</button>)}</div>
          <div className="recipe-library-rows">{visible.map(row => <button key={row.code} onClick={() => navigate(row.code)} aria-pressed={recipe?.code === row.code} className="recipe-list-item"><span className="recipe-list-icon"><ChefHat size={24} /></span><span className="recipe-list-copy"><span className="recipe-list-code">{[row.code, ...row.aliases].join(" / ")}</span><strong>{row.name}</strong><span className={`recipe-status recipe-status-${row.status}`}>{recipeStatusLabel(row.status)}</span></span><ChevronRight size={17} /></button>)}</div>
          {!visible.length && <p className="recipe-empty-search">No matching recipes or guides. Try another name, code or category.</p>}
        </section>
        {!recipe ? <section className="recipe-card recipe-empty"><h2>{loading ? "Loading exact revision…" : "Recipe unavailable"}</h2><p>Select an available instruction from the library.</p><button className="recipe-button recipe-no-print" onClick={allRecipes}>All Recipes</button></section> : <RecipeReader key={`${recipe.code}-${recipe.revision}-${view}`} recipe={recipe} manager={manager} manage={view === "manage"} manual={manual} manualError={manualError} onNavigate={navigate} onAllRecipes={allRecipes}>
          {recipe.persisted && <RecipeWorkflow key={`workflow-${recipe.code}-${recipe.revision}-${recipe.workflowVersion}-${refresh}`} recipe={recipe} workingRecipe={view === "manage" || view === "trial" ? workingRecipe : null} manager={manager && view === "manage"} view={view} readOnly={Boolean(error || loading)} onSaved={updateSaved} onChanged={() => setRefresh(n => n + 1)} onNavigate={navigate} onSessionExpired={onSessionExpired} />}
          {!recipe.persisted && manager && view === "manage" && <section className="recipe-next-action recipe-no-print"><BookOpenText size={24} /><div><h3>Save an instruction draft</h3><p>Source preview — save an explicit draft before requesting a trial or reviewing publication.</p><button className="recipe-button recipe-primary" onClick={() => { const panel = document.getElementById("recipe-edit"); if (panel) { panel.open = true; panel.querySelector("summary").focus(); panel.scrollIntoView({ block: "start" }); } }}>Open draft form</button></div></section>}
          {manager && (!requestedRevision || recipe.revision === workingRecipe?.revision) && view === "manage" && <RecipeDraftManager key={`draft-${recipe.code}-${recipe.revision}-${recipe.workflowVersion}`} recipe={recipe} readOnly={Boolean(error || loading)} preparationOptions={recipes.filter(row => row.category === "Preparation Recipes")} onSaved={updateSaved} onSessionExpired={onSessionExpired} />}
        </RecipeReader>}
      </div>}
    </main>
  </div>;
}
