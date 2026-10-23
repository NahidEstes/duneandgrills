"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { fetchInventoryRecipes, fetchAddOnInventoryRecipes, exportSellingRecipes } from "@/src/api/inventoryApi.js";
import { Badge, Button, EmptyState, LoadingState, PageHeader, Pagination, StatCard, cardClass, inputClass } from "./InventoryUI.jsx";
import { apiErrorMessage } from "./inventoryUtils.js";
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
  return <div className="mx-auto max-w-[1800px] min-w-0 space-y-4">
    <PageHeader title="Menu Item Recipes" description="Plan menu and add-on ingredients using current reference costs and usable stock." actions={<><label className="text-xs text-neutral-300">Export scope<select aria-label="Export scope" className={inputClass} value={scope} onChange={event => setScope(event.target.value)}><option value="page">Current page</option><option value="all">All filtered results</option></select></label><Button disabled={exporting || resource.loading || !!resource.error || !rows.length} onClick={exportRows}>{exporting ? "Preparing export…" : "Export recipes"}</Button></>}/>
    {!onlyKind && <div role="group" aria-label="Recipe type" className="flex flex-wrap gap-2">{[["menu", "Menu Item Recipes"], ["addon", "Add-on Recipes"]].map(([value, label]) => <Button key={value} variant={kind === value ? "primary" : "secondary"} aria-pressed={kind === value} onClick={() => changeKind(value)}>{label}</Button>)}</div>}
    <ResourceStatus {...resource} hasData={resource.data !== null} onRetry={() => resource.reload({ silent: true })} showDetails={false}/>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Configured recipes" value={summary?.configured ?? "—"} caption="Valid saved ingredient mappings"/>
      <StatCard label="Not configured" value={summary?.notConfigured ?? "—"} caption="Sales require a valid mapping or explicit exclusion"/>
      <StatCard label="Do Not Track" value={summary?.doNotTrack ?? "—"} caption="Stock tracking explicitly excluded"/>
      <StatCard label="Configured price coverage" value={summary ? summary.costCoverage + "%" : "—"} caption="Share of listed prices, not actual sales or verified costs"/>
    </div>
    <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <section className={cardClass + " min-w-0"}>
        <div className="space-y-3 border-b border-white/10 p-4"><h2 className="font-semibold text-white">{kind === "menu" ? "Menu items" : "Add-ons"}</h2>
          <label className="block text-xs text-neutral-300">Search recipes<input className={inputClass} value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or category"/></label>
          <label className="block text-xs text-neutral-300">Recipe status<select className={inputClass} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{Object.entries(recipeStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <p className="text-xs text-neutral-400">Search and paging keep the selected draft open.</p>
        </div>
        {resource.loading ? <LoadingState/> : resource.error ? <EmptyState title="Unable to load recipes" description={apiErrorMessage(resource.error)} action={<Button onClick={() => resource.reload().catch(() => undefined)}>Retry list</Button>}/> : rows.length ? <div className="divide-y divide-white/10">{rows.map(row => <button key={row._id} type="button" aria-pressed={selection?.id === row._id} onClick={() => choose(row)} className={"block w-full space-y-2 p-4 text-left hover:bg-white/5 " + (selection?.id === row._id ? "bg-amber-400/10" : "")}><span className="block break-words text-sm font-semibold text-white">{row.name}</span><Badge tone={row.recipeStatus === "configured" ? "success" : row.recipeStatus === "do_not_track" ? "violet" : "danger"}>{recipeStatusLabel[row.recipeStatus]}</Badge></button>)}</div> : <EmptyState title="No matching recipes"/>}
        <Pagination pagination={resource.data?.pagination} onPageChange={setPage}/>
      </section>
      {selection ? <RecipeEditor key={selection.kind + ":" + selection.id} kind={selection.kind} id={selection.id} gateRef={gate} onSaved={() => resource.reload({ silent: true })}/> : <section className={cardClass}><EmptyState title="Select a recipe"/></section>}
    </div>
  </div>;
}
