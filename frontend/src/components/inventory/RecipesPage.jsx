"use client";

import { useEffect, useMemo, useState } from "react";
import { ChefHat, CircleSlash2, Download, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { fetchInventoryItems, fetchInventoryRecipes } from "@/src/api/inventoryApi.js";
import { Badge, Button, EmptyState, LoadingState, PageHeader, Pagination, StatCard, cardClass, inputClass } from "./InventoryUI.jsx";
import { apiErrorMessage, downloadCsv, formatSar } from "./inventoryUtils.js";
import RecipeEditor from "./RecipeEditor.jsx";
import useInventoryResource from "./useInventoryResource.js";

const statusLabel = { configured: "Configured", not_configured: "Not Configured", do_not_track: "Do Not Track" };

export default function RecipesPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [inventoryItems, setInventoryItems] = useState([]);
  useEffect(() => { const timeout = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 250); return () => clearTimeout(timeout); }, [search]);
  useEffect(() => { fetchInventoryItems({ limit: 100, status: "active", sortBy: "name", sortOrder: "asc" }).then((response) => setInventoryItems(response.data)).catch(() => toast.error("Unable to load inventory ingredients.")); }, []);
  const { data, loading, error, reload } = useInventoryResource(() => fetchInventoryRecipes({ page, limit: 20, search: debouncedSearch || undefined, status: status || undefined }), [page, debouncedSearch, status]);
  const rows = useMemo(() => data?.data || [], [data?.data]);
  const selected = rows.find((row) => row._id === selectedId) || rows[0] || null;
  useEffect(() => { if (rows.length && !rows.some((row) => row._id === selectedId)) setSelectedId(rows[0]._id); }, [rows, selectedId]);
  const summary = data?.summary || {};
  const exportRecipes = () => {
    if (!rows.length) return toast.error("There are no recipes to export.");
    downloadCsv(`inventory-recipes-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Menu Item", (row) => row.name], ["Category", (row) => row.categoryRef?.name || row.category], ["Status", (row) => statusLabel[row.recipeStatus]],
      ["Selling Price SAR", (row) => row.price], ["Ingredient Cost SAR", (row) => row.metrics?.ingredientCost], ["Estimated Profit SAR", (row) => row.metrics?.estimatedProfit], ["Margin %", (row) => row.metrics?.margin],
    ], rows);
  };
  return <div className="mx-auto max-w-[1800px]">
    <PageHeader title="Recipes" description="Map menu items to inventory ingredients and estimate food cost, profit and margin in SAR." actions={<Button onClick={exportRecipes}><Download className="h-4 w-4" />Export Recipes</Button>} />
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Configured Recipes" value={summary.configured || 0} caption="Menu items with ingredient mapping" icon={ChefHat} /><StatCard label="Not Configured" value={summary.notConfigured || 0} caption="Menu items pending recipes" icon={TriangleAlert} tone="red" /><StatCard label="Do Not Track Items" value={summary.doNotTrack || 0} caption="Excluded from recipe tracking" icon={CircleSlash2} tone="violet" /><StatCard label="Food Cost Coverage" value={`${summary.costCoverage || 0}%`} caption="Share of menu sales value configured" icon={ChefHat} tone="green" /></div>
    <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <section className={`${cardClass} h-fit overflow-hidden`}><div className="border-b border-white/10 p-4"><h2 className="text-sm font-semibold text-white">Menu Items</h2><p className="mt-1 text-xs text-neutral-600">Select an item to edit its recipe.</p><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1"><label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-neutral-600" /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search menu items…" /></label><select className={inputClass} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="configured">Configured</option><option value="not_configured">Not Configured</option><option value="do_not_track">Do Not Track</option></select></div></div>
        {loading ? <LoadingState /> : error ? <EmptyState title="Unable to load recipes" description={apiErrorMessage(error)} action={<Button onClick={() => reload()}>Try again</Button>} /> : rows.length ? <div className="divide-y divide-white/[0.06]">{rows.map((row) => <button key={row._id} type="button" onClick={() => setSelectedId(row._id)} className={`flex w-full items-center justify-between gap-3 border-l-2 px-4 py-3 text-left transition ${selected?._id === row._id ? "border-dune-amber bg-dune-amber/[0.07]" : "border-transparent hover:bg-white/[0.03]"}`}><span className="min-w-0"><span className="block truncate text-sm font-medium text-white">{row.name}</span><span className="mt-0.5 block text-[0.65rem] text-neutral-600">{row.categoryRef?.name || row.category} · {formatSar(row.price)}</span></span><Badge tone={row.recipeStatus === "configured" ? "success" : row.recipeStatus === "do_not_track" ? "violet" : "danger"}>{statusLabel[row.recipeStatus]}</Badge></button>)}</div> : <EmptyState title="No menu items found" />}
        <Pagination pagination={data?.pagination} onPageChange={setPage} />
      </section>
      <RecipeEditor selected={selected} inventoryItems={inventoryItems} onSaved={() => reload({ silent: true })} />
    </div>
  </div>;
}
