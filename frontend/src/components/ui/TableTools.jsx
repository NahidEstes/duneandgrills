"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import DarkSelect from "./DarkSelect.jsx";
import { normalizePreferences, PAGE_SIZES, preferenceKey, safeViewFilters, visibleTableColumns } from "./tablePreferences.js";

export function useTablePreferences(table, defaultPageSize = 20) {
  const { user } = useAuth();
  const key = preferenceKey(user, table);
  const [stored, setStored] = useState({ key: null, value: normalizePreferences(null, defaultPageSize) });
  const [storageError, setStorageError] = useState("");
  const value = stored.key === key ? stored.value : normalizePreferences(null, defaultPageSize);
  useEffect(() => {
    let next;
    try { next = key ? JSON.parse(localStorage.getItem(key) || "null") : null; } catch { next = null; }
    setStored({ key, value: normalizePreferences(next, defaultPageSize) });
    setStorageError("");
  }, [key, defaultPageSize]);
  const update = useCallback(change => {
    const next = normalizePreferences(change(stored.key === key ? stored.value : normalizePreferences(null, defaultPageSize)), defaultPageSize);
    try { if (key) localStorage.setItem(key, JSON.stringify(next)); setStorageError(""); }
    catch { setStorageError("Your browser could not save these preferences. Changes apply to this visit only."); }
    setStored({ key, value: next });
  }, [key, defaultPageSize, stored]);
  return { ...value, update, storageError, visibleColumns: columns => visibleTableColumns(columns, value.hidden) };
}

export default function TableTools({ preferences, columns = [], filters = {}, onApplyFilters, onPageSizeChange, disabled = false }) {
  const [name, setName] = useState(""), [selected, setSelected] = useState("");
  const shown = preferences.visibleColumns(columns);
  const save = () => {
    if (!name.trim()) return;
    const id = String(Date.now());
    preferences.update(value => ({ ...value, views: [...value.views.filter(view => view.name !== name.trim()), { id, name: name.trim(), filters: safeViewFilters(filters, filters) }].slice(-10) }));
    setName(""); setSelected(id);
  };
  return <div className="border-b border-white/10 p-3">
    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
      <label className="flex items-center gap-2">Rows per page<DarkSelect aria-label="Rows per page" className="h-9 w-20 rounded-lg border border-white/10 bg-[#111416] px-2 text-white" value={preferences.pageSize} disabled={disabled} onChange={event => onPageSizeChange(Number(event.target.value))}>{PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</DarkSelect></label>
      {columns.length > 0 && <details className="relative"><summary className="min-h-9 cursor-pointer rounded-lg border border-white/10 px-3 py-2 text-neutral-200">Columns ({shown.length}/{columns.length})</summary><div className="absolute right-0 top-full z-20 mt-1 max-h-72 w-60 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-white/15 bg-[#111416] p-3 shadow-xl">{columns.map((column, index) => <label key={column.key} className="flex min-h-9 items-center gap-2"><input type="checkbox" className="accent-amber-500" checked={shown.includes(column)} disabled={index === 0 || column.key === "actions" || column.required} onChange={event => preferences.update(value => ({ ...value, hidden: event.target.checked ? value.hidden.filter(key => key !== column.key) : [...value.hidden, column.key] }))} />{column.label || "Actions"}</label>)}<button type="button" className="mt-2 text-dune-amber" onClick={() => preferences.update(value => ({ ...value, hidden: [] }))}>Show all columns</button></div></details>}
      {onApplyFilters && <><DarkSelect aria-label="Saved views" className="h-9 w-40 rounded-lg border border-white/10 bg-[#111416] px-2 text-white" value={selected} disabled={disabled} onChange={event => { const view = preferences.views.find(row => row.id === event.target.value); setSelected(event.target.value); if (view) onApplyFilters(safeViewFilters(view.filters, filters)); }}><option value="">Saved views</option>{preferences.views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}</DarkSelect><input aria-label="New saved view name" maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder="View name" className="h-9 w-32 rounded-lg border border-white/10 bg-black/20 px-2 text-white" /><button type="button" disabled={disabled || !name.trim()} onClick={save} className="min-h-9 rounded-lg border border-white/10 px-3 text-neutral-200 disabled:opacity-40">Save view</button><button type="button" disabled={!selected} onClick={() => { preferences.update(value => ({ ...value, views: value.views.filter(view => view.id !== selected) })); setSelected(""); }} className="min-h-9 px-2 text-neutral-400 disabled:opacity-40">Remove view</button></>}
    </div>
    {preferences.storageError && <p role="status" className="mt-2 text-xs text-amber-300">{preferences.storageError}</p>}
  </div>;
}
