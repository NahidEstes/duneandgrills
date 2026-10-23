"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/src/context/AuthContext.jsx";
import { INVENTORY_ROLES } from "./inventoryAccess.js";
export default function StockItemActions({ item, disabled = false, onEdit, onView, inline = false }) {
  const { user } = useAuth();
  const root = useRef(null), [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 320 });
  useEffect(() => {
    if (!open || inline) return;
    const close = event => { if (!root.current?.contains(event.target)) { if (root.current) root.current.open = false; } };
    document.addEventListener("pointerdown", close); window.addEventListener("scroll", close, true); window.addEventListener("resize", close);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open, inline]);
  const toggle = event => {
    const expanded = event.currentTarget.open; setOpen(expanded);
    if (!expanded || inline) return;
    const rect = event.currentTarget.querySelector("summary").getBoundingClientRect();
    const height = Math.min(340, innerHeight - 24), below = innerHeight - rect.bottom - 12;
    setPosition({ left: Math.max(12, Math.min(rect.right - 224, innerWidth - 236)), top: below >= height ? rect.bottom + 4 : Math.max(12, rect.top - height - 4), maxHeight: height });
  };
  const write = INVENTORY_ROLES.includes(user?.role) && item.isActive !== false;
  const path = (route, params = "") => `/inventory/${route}?item=${encodeURIComponent(item._id)}${params}`;
  return <details ref={root} onToggle={toggle} onKeyDown={event => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); root.current.open = false; root.current.querySelector("summary").focus(); } }} className="relative inline-block"><summary className="min-h-11 cursor-pointer rounded-xl border border-white/15 px-3 py-2 text-sm text-neutral-200">Actions<span className="sr-only"> for {item.name}</span></summary><div style={inline ? undefined : position} className={`${inline ? "mt-2" : "fixed z-[80]"} w-56 max-w-[calc(100vw-3rem)] space-y-1 overflow-y-auto rounded-xl border border-white/20 bg-[#111416] p-2 shadow-xl`}>
    {onView && <button type="button" onClick={event => { event.currentTarget.closest("details").open = false; onView(item); }} className="block min-h-11 w-full px-3 py-2 text-left text-sm">View item details</button>}
    {[["View batches", path("batches")], ["View movement history", path("stock-movements")], ...(write && !disabled ? [["Receive stock (outside PO)", path("stock-in")], ["Record usage", path("stock-out")], ["Record waste", path("waste-damaged", "&action=add")]] : [])].map(([label, href]) => <Link key={label} href={href} className="block min-h-11 rounded-lg px-3 py-2 text-sm hover:bg-white/10">{label}</Link>)}
    {write && onEdit && <button type="button" disabled={disabled} onClick={event => { event.currentTarget.closest("details").open = false; onEdit(item); }} className="block min-h-11 w-full px-3 py-2 text-left text-sm disabled:opacity-50">Edit item</button>}
  </div></details>;
}
