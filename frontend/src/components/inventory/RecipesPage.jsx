"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChefHat, CircleSlash2, Download, Search, TriangleAlert } from "lucide-react";
import DarkSelect from "../ui/DarkSelect.jsx";
import { fetchInventoryRecipes, fetchAddOnInventoryRecipes, exportSellingRecipes } from "@/src/api/inventoryApi.js";
import { Badge, Button, EmptyState, LoadingState, PageHeader, Pagination, StatCard, cardClass, inputClass } from "./InventoryUI.jsx";
import { apiErrorMessage, formatSar } from "./inventoryUtils.js";
import RecipeEditor from "./RecipeEditor.jsx";
import useInventoryResource from "./useInventoryResource.js";
import ResourceStatus from "../ui/ResourceStatus.jsx";

export const recipeStatusLabel = { configured: "Configured", not_configured: "Not Configured", do_not_track: "Do Not Track" };
export default function RecipesPage({ initialKind = "menu", onlyKind = false }) {
  const [kind, setKind] = useState(initialKind), [search, setSearch] = useState(""), [query, setQuery] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(1);
  const [selection, setSelection] = useState(null), [exporting, setExporting] = useState(false), [scope, setScope] = useState("page");
  const gate = useRef(null);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  const filters = { page, limit: 20, search: query || undefined, status: status || undefined };
  const resource = useInventoryResource(() => (kind === "menu" ? fetchInventoryRecipes : fetchAddOnInventoryRecipes)(filters), [kind, page, query, status]);
  const rows = useMemo(() => resource.data?.data || [], [resource.data?.data]), summary = resource.data?.summary;
  useEffect(() => { if (!selection && rows.length) setSelection({ id: rows[0]._id, kind }); }, [rows, selection, kind]);
  const changeKind = next => {
    if (next === kind || gate.current?.() === false) return;
    setKind(next); setSelection(null); setPage(1); setSearch(""); setQuery(""); setStatus("");
  };
  const choose = row => { if (selection?.id === row._id || gate.current?.() !== false) setSelection({ id: row._id, kind }); };
  const exportRows = async () => {
    if (exporting) return; setExporting(true);
    try {
      const response = await exportSellingRecipes(kind, { ...filters, scope });
      const url = URL.createObjectURL(response.data), anchor = document.createElement("a");
      anchor.href = url; anchor.download = kind + "-recipes-" + scope + "-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Exported " + response.headers["x-export-rows"] + " recipes (" + (scope === "all" ? "all filtered results" : "current page") + ").");
    } catch { toast.error("Export failed. No file was downloaded. Retry the complete export."); }
    finally { setExporting(false); }
  };
  return <div className="mx-auto max-w-[1800px] min-w-0">
    <PageHeader title="Menu Item Recipes" description="Map menu items and physical add-ons to inventory ingredients." actions={<><div className="w-40"><DarkSelect aria-label="Export scope" className={inputClass} value={scope} onChange={event => setScope(event.target.value)}><option value="page">Current page</option><option value="all">All filtered results</option></DarkSelect></div><Button disabled={exporting || resource.loading || !!resource.error || !rows.length} onClick={exportRows}><Download className="h-4 w-4"/>{exporting ? "Preparing export…" : "Export recipes"}</Button></>}/>
    <ResourceStatus {...resource} hasData={resource.data !== null} onRetry={() => resource.reload({ silent: true })} showDetails={false}/>
    {!onlyKind && <div role="group" aria-label="Recipe type" className="mb-4 flex gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-1">{[["menu", "Menu Item Recipes"], ["addon", "Add-on Recipes"]].map(([value, label]) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => changeKind(value)} className={`rounded-lg px-4 py-2 text-sm ${kind === value ? "bg-dune-amber text-black" : "text-neutral-400"}`}>{label}</button>)}</div>}
    {kind === "menu" && <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Configured Recipes" value={summary?.configured ?? "—"} caption="Menu items with ingredient mapping" icon={ChefHat}/>
      <StatCard label="Not Configured" value={summary?.notConfigured ?? "—"} caption="Menu items pending recipes" icon={TriangleAlert} tone="red"/>
      <StatCard label="Do Not Track Items" value={summary?.doNotTrack ?? "—"} caption="Excluded from recipe tracking" icon={CircleSlash2} tone="violet"/>
      <StatCard label="Configured Price Coverage" value={summary ? summary.costCoverage + "%" : "—"} caption="Share of listed prices configured, not sales" icon={ChefHat} tone="green"/>
    </div>}
    <div className={`grid items-start gap-4 ${kind === "menu" ? "xl:grid-cols-[380px_minmax(0,1fr)]" : "xl:grid-cols-[340px_minmax(0,1fr)]"}`}>
      <section className={cardClass + " h-fit min-w-0 overflow-hidden"}>
        <div className="border-b border-white/10 p-4"><h2 className="text-sm font-semibold text-white">{kind === "menu" ? "Menu Items" : "Menu Add-ons"}</h2>
          <p className="mt-1 text-xs text-neutral-400">{kind === "menu" ? "Select an item to edit its recipe." : "Map physical add-ons to inventory ingredients."}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1"><label className="relative"><span className="sr-only">Search recipes</span><Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-neutral-400"/><input className={inputClass + " pl-10"} value={search} onChange={event => setSearch(event.target.value)} placeholder={kind === "menu" ? "Search menu items…" : "Search add-ons…"}/></label>
          <DarkSelect aria-label="Recipe status" className={inputClass} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{Object.entries(recipeStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</DarkSelect></div>
        </div>
        {resource.loading ? <LoadingState/> : resource.error ? <EmptyState title="Unable to load recipes" description={apiErrorMessage(resource.error)} action={<Button onClick={() => resource.reload().catch(() => undefined)}>Retry list</Button>}/> : rows.length ? <div className="divide-y divide-white/[0.06]">{rows.map(row => <button key={row._id} type="button" aria-pressed={selection?.id === row._id} onClick={() => choose(row)} className={`flex w-full items-center justify-between gap-3 border-l-2 px-4 py-3 text-left transition ${selection?.id === row._id ? "border-dune-amber bg-dune-amber/[0.07]" : "border-transparent hover:bg-white/[0.03]"}`}><span className="min-w-0"><span className="block truncate text-sm font-medium text-white">{row.name}</span><span className="mt-0.5 block text-[0.65rem] text-neutral-400">{row.categoryRef?.name || row.category}{kind === "menu" ? " · " : ""}{formatSar(row.price)}</span></span><Badge tone={row.recipeStatus === "configured" ? "success" : row.recipeStatus === "do_not_track" ? "violet" : "danger"}>{recipeStatusLabel[row.recipeStatus]}</Badge></button>)}</div> : <EmptyState title="No matching recipes"/>}
        <Pagination pagination={resource.data?.pagination} onPageChange={setPage}/>
      </section>
      {selection ? <RecipeEditor key={selection.kind + ":" + selection.id} kind={selection.kind} id={selection.id} gateRef={gate} onSaved={() => resource.reload({ silent: true })}/> : <section className={cardClass}><EmptyState title="Select a recipe"/></section>}
    </div>
  </div>;
}
