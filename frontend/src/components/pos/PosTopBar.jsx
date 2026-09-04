"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Flame, LockKeyhole, LogOut, Monitor, Settings, UserRound } from "lucide-react";

export default function PosTopBar({ user, onLock, onLogout, clock24, onClockChange, displayUrl }) {
  const [now, setNow] = useState(null);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const initials = (user.name || "Cashier").split(/\s+/).map((part) => part[0]).slice(0, 2).join("");

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!dropdownRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b border-white/10 bg-[#080c0e]/95 px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="mr-auto flex items-center gap-2">
        <Flame className="h-8 w-8 shrink-0 fill-dune-amber text-dune-amber" />
        <div>
          <p className="font-display text-xl tracking-wider text-white sm:text-2xl">DUNE <span className="text-dune-amber">&amp;</span> GRILLS</p>
          <p className="text-[0.55rem] font-semibold tracking-widest text-dune-amber">SMOKE. SAVOR. REPEAT.</p>
        </div>
      </div>
      {displayUrl && <a href={displayUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-neutral-300 hover:border-dune-amber/50 hover:text-dune-amber"><Monitor className="h-4 w-4" /><span className="hidden md:inline">Customer Display</span><span className="sr-only md:hidden">Open Customer Display</span></a>}
      <time dateTime={now?.toISOString()} className="hidden min-w-32 text-right sm:block">
        <span className="block text-[0.65rem] text-neutral-400">{now?.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) || "—"}</span>
        <span className="block text-lg font-semibold tabular-nums text-white">{now?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: !clock24 }) || "—"}</span>
      </time>
      <div ref={dropdownRef} className="relative" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}>
        <button ref={triggerRef} type="button" aria-expanded={open} aria-controls="pos-cashier-dropdown" onClick={() => setOpen((value) => !value)} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-left hover:border-dune-amber/50 focus-visible:outline focus-visible:outline-dune-amber">
          <span className="grid h-8 w-8 place-items-center rounded-full border border-white/15 text-xs text-neutral-300">{initials}</span>
          <span className="hidden min-w-0 sm:block"><span className="block max-w-32 truncate text-sm font-medium text-white">{user.name}</span><span className="block text-[0.65rem] capitalize text-neutral-500">{user.role} · Cashier</span></span>
          <ChevronDown className="h-4 w-4 text-neutral-400" />
          <span className="sr-only">Cashier options</span>
        </button>
        {open && (
          <div id="pos-cashier-dropdown" className="absolute right-0 top-[calc(100%+0.5rem)] w-60 rounded-xl border border-white/10 bg-[#0e1416] p-2 shadow-2xl shadow-black/60">
            <div className="mb-1 border-b border-white/10 px-3 py-3"><p className="truncate text-sm font-medium text-white">{user.name}</p><p className="text-xs capitalize text-neutral-500">{user.role} · Cashier</p></div>
            <Link href="/profile" target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-neutral-300 hover:bg-white/5 hover:text-dune-amber"><UserRound className="h-4 w-4" />Profile<span className="sr-only"> (opens in a new tab)</span></Link>
            <details className="rounded-lg text-sm text-neutral-300">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-3 rounded-lg px-3 hover:bg-white/5 hover:text-dune-amber"><Settings className="h-4 w-4" />Preferences</summary>
              <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-3 text-xs"><span>24-hour clock</span><input type="checkbox" checked={clock24} onChange={(event) => onClockChange(event.target.checked)} className="accent-orange-500" /></label>
            </details>
            <button type="button" onClick={onLogout} className="mt-1 flex min-h-10 w-full items-center gap-3 rounded-lg border-t border-white/10 px-3 text-sm text-red-400 hover:bg-red-500/10"><LogOut className="h-4 w-4" />Logout</button>
          </div>
        )}
      </div>
      <button type="button" onClick={onLock} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-neutral-300 hover:border-dune-amber/50 hover:text-dune-amber"><LockKeyhole className="h-4 w-4" /><span>Lock</span></button>
    </header>
  );
}
