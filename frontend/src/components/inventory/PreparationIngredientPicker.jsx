"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { inputClass } from "./InventoryUI.jsx";

const pageSize = 50;
export default function PreparationIngredientPicker({ index, value, choices, recipes, onChange, disabled = false }) {
  const id = useId(), trigger = useRef(null), panel = useRef(null), searchInput = useRef(null);
  const [open, setOpen] = useState(false), [search, setSearch] = useState(""), [kind, setKind] = useState("all"), [limit, setLimit] = useState(pageSize), [position, setPosition] = useState(null), [invalid, setInvalid] = useState(false);
  const prepared = useMemo(() => new Set(recipes.map(row => String(row.finishedItem))), [recipes]);
  const selected = choices.find(item => String(item._id) === String(value));
  const typeOf = item => prepared.has(String(item._id)) ? "Prepared" : "Raw";
  const query = search.trim().toLowerCase();
  const filtered = choices.filter(item => (!query || (item.name + " " + (item.sku || "")).toLowerCase().includes(query)) && (kind === "all" || prepared.has(String(item._id)) === (kind === "prepared")));
  const label = "Stock item " + (index + 1);
  const reposition = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect(); if (!rect) return;
    const below = innerHeight - rect.bottom - 14, above = rect.top - 14, down = below >= Math.min(280, above);
    const maxHeight = Math.max(48, Math.min(384, down ? below : above, innerHeight - 16));
    const width = Math.min(Math.max(rect.width, 260), innerWidth - 16);
    setPosition({ width, maxHeight, left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)), ...(down ? { top: Math.max(8, Math.min(rect.bottom + 6, innerHeight - maxHeight - 8)) } : { bottom: Math.max(8, innerHeight - rect.top + 6) }) });
  }, []);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const show = () => { if (disabled || trigger.current?.matches(":disabled")) return; reposition(); setOpen(true); };
  useEffect(() => {
    if (!open || disabled) return;
    searchInput.current?.focus();
    const outside = event => { if (!trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) setOpen(false); };
    const move = event => { if (!panel.current?.contains(event.target)) reposition(); };
    document.addEventListener("pointerdown", outside); window.addEventListener("resize", reposition); window.addEventListener("scroll", move, true);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", move, true); };
  }, [open, disabled, reposition]);
  const choose = item => {
    if (disabled || trigger.current?.matches(":disabled")) return;
    setInvalid(false); onChange({ target: { value: String(item._id) }, currentTarget: { value: String(item._id) } }); close();
  };
  const key = event => {
    if (disabled) return;
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === "Enter" && event.target === searchInput.current) { event.preventDefault(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (!open) { show(); return; }
    const options = [...(panel.current?.querySelectorAll('[role="option"]:not(:disabled)') || [])]; if (!options.length) return;
    const current = options.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : event.key === "ArrowDown" ? Math.min(current + 1, options.length - 1) : Math.max(current - 1, 0);
    options[next]?.focus();
  };
  return <div className="col-span-2 min-w-0 space-y-2 sm:col-span-1" onKeyDown={key} onBlurCapture={event => { if (!trigger.current?.contains(event.relatedTarget) && !panel.current?.contains(event.relatedTarget)) setOpen(false); }}>
    <span id={id + "-label"} className="block text-xs font-medium text-neutral-300">{label}</span>
    <button ref={trigger} type="button" role="combobox" data-form-value={value} aria-labelledby={id + "-label"} aria-required="true" aria-invalid={invalid || undefined} aria-expanded={open && !disabled} aria-haspopup="listbox" aria-controls={open && !disabled ? id + "-options" : undefined} disabled={disabled} onClick={() => open ? close() : show()} className={inputClass + " relative !h-auto min-h-10 py-2.5 pr-9 text-left disabled:cursor-not-allowed disabled:opacity-50 " + (invalid ? "border-red-500/70" : "")}>
      <span className={"block break-words " + (selected ? "" : "text-neutral-400")}>{selected ? selected.name + " · " + typeOf(selected) : value ? "Selected ingredient unavailable" : "Select raw or prepared ingredient"}</span><ChevronDown aria-hidden="true" className={"absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500 " + (open ? "rotate-180" : "")}/>
    </button>
    <input tabIndex={-1} aria-hidden="true" className="sr-only" value={value} onChange={() => undefined} required disabled={disabled} onInvalid={event => { event.preventDefault(); setInvalid(true); trigger.current?.focus(); }}/>
    {value && !selected && <p role="alert" className="text-xs text-amber-200">Saved ingredient is unavailable. Replace it or remove this row.</p>}
    {open && !disabled && position && createPortal(<div ref={panel} data-preparation-picker-panel data-draft-ignore style={position} className="fixed z-[120] flex flex-col overflow-hidden rounded-xl border border-white/15 bg-[#111618] text-sm text-neutral-200 shadow-2xl shadow-black/70">
      <div className="shrink-0 space-y-2 border-b border-white/10 p-3">
        <label className="relative block"><span className="sr-only">{"Search stock item " + (index + 1)}</span><Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-neutral-400"/><input ref={searchInput} className={inputClass + " pl-9"} placeholder="Name or SKU" value={search} onChange={event => { setSearch(event.target.value); setLimit(pageSize); }}/></label>
        <div role="group" aria-label={"Ingredient type " + (index + 1)} className="flex gap-1 rounded-lg bg-black/20 p-1">{[["all","All ingredients"],["raw","Raw"],["prepared","Prepared"]].map(([type, text]) => <button key={type} type="button" aria-pressed={kind === type} onClick={() => { setKind(type); setLimit(pageSize); }} className={"min-h-9 flex-1 rounded-md px-2 py-1.5 text-xs " + (kind === type ? "bg-dune-amber text-black" : "text-neutral-300 hover:bg-white/5")}>{text}</button>)}</div>
      </div>
      <div id={id + "-options"} role="listbox" aria-labelledby={id + "-label"} className="dune-select-scrollbar min-h-0 overflow-y-auto p-1.5">
        {filtered.slice(0, limit).map(item => <button key={item._id} type="button" role="option" aria-label={item.name + " · " + typeOf(item)} aria-describedby={id + "-" + item._id} aria-selected={String(value) === String(item._id)} onClick={() => choose(item)} className={"flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/[0.07] focus:bg-white/[0.07] " + (String(value) === String(item._id) ? "bg-dune-amber/10 text-dune-amberLight" : "")}><span className="min-w-0"><span className="block break-words">{item.name} · {typeOf(item)}</span><span id={id + "-" + item._id} className="mt-0.5 block break-words text-xs text-neutral-400">{item.sku} · {item.unit}</span></span>{String(value) === String(item._id) && <Check aria-hidden="true" className="h-4 w-4 shrink-0"/>}</button>)}
      </div>
      {!filtered.length && <p role="status" className="px-4 py-3 text-xs text-neutral-300">No matching ingredients. Change the search or filter.</p>}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2"><span role="status" className="text-xs text-neutral-400">{Math.min(limit, filtered.length)} of {filtered.length} ingredients</span>{filtered.length > limit && <button type="button" className="min-h-9 text-xs text-dune-amber hover:underline" onClick={() => setLimit(current => current + pageSize)}>Load more ingredients</button>}<button type="button" className="min-h-9 text-xs text-neutral-300 hover:underline" onClick={close}>Close item search</button></div>
    </div>, document.body)}
  </div>;
}
