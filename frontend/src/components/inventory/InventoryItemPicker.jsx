"use client";
import { useEffect, useId, useRef, useState } from "react";
import { fetchInventoryItem, fetchInventoryItemOptions } from "@/src/api/inventoryApi.js";
import { Button, inputClass } from "./InventoryUI.jsx";
import { apiErrorMessage } from "./inventoryUtils.js";

export default function InventoryItemPicker({ value = "", onChange, onResolved, label = "Inventory item", disabled = false, allowInactive = false, retainInactive = false, clearable = false, recipeTypes = false, excludedIds = [] }) {
  const id = useId(), root = useRef(null), searchInput = useRef(null), callback = useRef(onResolved);
  useEffect(() => { callback.current = onResolved; }, [onResolved]);
  const [open, setOpen] = useState(false), [search, setSearch] = useState(""), [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState(null), [selectedError, setSelectedError] = useState("");
  const [results, setResults] = useState({ rows: [], loading: false, error: "", pagination: null });
  const [recipeType, setRecipeType] = useState("all");
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setSelected(null); setSelectedError(""); callback.current?.(null);
    if (value) fetchInventoryItem(value, { signal: controller.signal }).then(item => {
      if (!current) return;
      if (!allowInactive && !retainInactive && item.isActive === false) throw Error("This item is inactive. Choose an active item.");
      setSelected(item); callback.current?.(item);
    }).catch(error => { if (current) setSelectedError(apiErrorMessage(error)); });
    return () => { current = false; controller.abort(); };
  }, [value, retry, allowInactive, retainInactive]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); let current = true;
    setResults(old => ({ ...old, rows: page === 1 ? [] : old.rows, loading: true, error: "" }));
    const timer = setTimeout(() => fetchInventoryItemOptions({ search, page, limit: 20, includeInactive: allowInactive, ...(recipeTypes ? { recipeType } : {}) }, { signal: controller.signal }).then(response => {
      if (!current) return;
      setResults(old => ({ rows: [...new Map([...(page > 1 ? old.rows : []), ...response.data].map(item => [item._id, item])).values()], pagination: response.pagination, loading: false, error: "" }));
    }).catch(error => { if (current) setResults(old => ({ ...old, loading: false, error: apiErrorMessage(error) })); }), 250);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [open, search, page, retry, allowInactive, recipeTypes, recipeType]);
  useEffect(() => { if (open) searchInput.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const choose = item => { const choice = selected?._id === item._id ? selected : item; setSelected(choice); setSelectedError(""); onChange(choice._id, choice); callback.current?.(choice); setOpen(false); root.current?.querySelector('[role="combobox"]')?.focus(); };
  const key = event => {
    if (event.key === "Enter" && event.target === searchInput.current) event.preventDefault();
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); root.current?.querySelector('[role="combobox"]')?.focus(); }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && open) {
      const options = [...root.current.querySelectorAll('[role="option"]')]; if (!options.length) return;
      event.preventDefault(); const index = options.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : event.key === "ArrowDown" ? Math.min(index + 1, options.length - 1) : Math.max(index - 1, 0);
      options[next]?.focus();
    }
  };
  return <div ref={root} onKeyDown={key} className="relative min-w-0 space-y-2">
    <span id={`${id}-label`} className="block text-xs font-medium text-neutral-300">{label}</span>
    <button type="button" role="combobox" data-form-value={value} aria-labelledby={`${id}-label`} aria-expanded={open} aria-controls={open ? `${id}-results` : undefined} aria-haspopup="listbox" disabled={disabled} onClick={() => setOpen(!open)} className={`${inputClass} h-auto min-h-11 text-left break-words`}>{selected?._id === value ? `${selected.name} · ${selected.sku} · ${selected.unit}` : selectedError ? "Selected item unavailable" : value ? "Loading selected item…" : "Search and choose an item"}</button>
    {clearable && value && <button type="button" className="min-h-9 text-xs text-dune-amber underline" onClick={() => { onChange("", null); setSelected(null); callback.current?.(null); }}>Clear selected item</button>}
    {selectedError && <p role="alert" className="text-xs text-red-300">{selectedError} <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>Retry selected item</button></p>}
    {selected?.isActive === false && <p role="status" className="text-xs text-amber-200">Inactive ingredient retained for repair. Replace it or disable this ingredient row.</p>}
    {open && <div data-draft-ignore className="absolute inset-x-0 top-full z-30 max-h-96 overflow-y-auto rounded-xl border border-white/20 bg-[#111416] p-3 shadow-2xl">
      {recipeTypes && <label className="mb-2 block text-xs text-neutral-300">Ingredient type<select aria-label="Ingredient type" className={inputClass} value={recipeType} onChange={event => { setRecipeType(event.target.value); setPage(1); }}><option value="all">All ingredients</option><option value="raw">Raw</option><option value="prepared">Prepared</option></select></label>}
      <input ref={searchInput} aria-label={`Search ${label.toLowerCase()}`} placeholder="Search name, SKU, brand or location…" className={inputClass} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }}/>
      <div role="listbox" id={`${id}-results`} aria-labelledby={`${id}-label`} aria-busy={results.loading} className="mt-2 space-y-1">{results.rows.map(item => <button role="option" disabled={excludedIds.includes(item._id) && item._id !== value} aria-selected={value === item._id} key={item._id} type="button" onClick={() => choose(item)} className="block min-h-11 w-full rounded-lg px-3 py-2 text-left hover:bg-white/10 focus:bg-white/10 disabled:opacity-40"><span className="block break-words text-sm text-white">{item.name}{recipeTypes ? ` · ${item.recipeType === "prepared" ? "Prepared" : "Raw"}` : ""}</span><span className="block break-words text-xs text-neutral-400">{item.sku} · {item.unit}{item.category?.name ? ` · ${item.category.name}` : ""}{item.preferredBrand ? ` · ${item.preferredBrand}` : ""}{item.storageLocation ? ` · ${item.storageLocation}` : ""}{excludedIds.includes(item._id) && item._id !== value ? " · Already added" : ""}</span></button>)}</div>
      {results.loading && <p role="status" className="p-3 text-sm text-neutral-300">Searching items…</p>}
      {results.error && <p role="alert" className="p-3 text-sm text-red-300">{results.error} <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>Retry search</button></p>}
      {!results.loading && !results.error && !results.rows.length && <p role="status" className="p-3 text-sm text-neutral-300">No matching active items.</p>}
      {!results.error && results.pagination?.page < results.pagination?.pages && <Button variant="secondary" disabled={results.loading} onClick={() => setPage(value => value + 1)}>Load more items</Button>}
      <Button variant="ghost" onClick={() => setOpen(false)}>Close item search</Button>
    </div>}
  </div>;
}
