"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext.jsx";
import { allowedNavigation, navigationGroups, navigationPreferences } from "./inventoryNavigation.js";
import { ChevronDown, Pin, PinOff } from "lucide-react";
import { useRef } from "react";
import WorkspaceThemeToggle from "../ui/WorkspaceThemeToggle.jsx";
import StockAlertBell from "./StockAlertBell.jsx";
import {
  Archive,
  PackageOpen,
  BarChart3,
  BellRing,
  Boxes,
  Building2,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageMinus,
  PackagePlus,
  ReceiptText,
  BadgeDollarSign,
  ChartNoAxesCombined,
  Settings,
  Tags,
  TimerReset,
  ArrowLeftRight,
  ChefHat,
  CookingPot,
  Factory,
  Trash2,
  ListChecks,
  Lightbulb,
  ShoppingCart,
  X,
} from "lucide-react";

const navigation = [
  ["Overview", "/inventory", LayoutDashboard],
  ["Stock Items", "/inventory/stock-items", Boxes],
  ["Batches / Lots", "/inventory/batches", PackageOpen],
  ["Categories", "/inventory/categories", Tags],
  ["Suppliers", "/inventory/suppliers", Building2],
  ["Purchase Orders", "/inventory/purchase-orders", ReceiptText],
  ["Supplier Invoices", "/inventory/supplier-invoices", BadgeDollarSign, ["admin", "manager", "accountant"]],
  ["Purchase Prices", "/inventory/purchase-prices", ChartNoAxesCombined],
  ["Reorder Suggestions", "/inventory/reorder-suggestions", ShoppingCart, ["admin", "manager", "inventory", "storekeeper"]],
  ["Purchasing Actions", "/inventory/purchasing-actions", ListChecks, ["admin", "manager", "inventory", "storekeeper", "accountant"]],
  ["Stock In", "/inventory/stock-in", PackagePlus],
  ["Stock Out", "/inventory/stock-out", PackageMinus],
  ["Stock Movements", "/inventory/stock-movements", ArrowLeftRight],
  ["Menu Item Recipes", "/inventory/recipes", ChefHat],
  ["Preparation Recipes", "/inventory/preparation-recipes", CookingPot],
  ["Production", "/inventory/production", Factory],
  ["Waste / Damaged", "/inventory/waste-damaged", Trash2],
  ["Inventory Count", "/inventory/inventory-count", ClipboardCheck],
  ["Expiry Tracking", "/inventory/expiry-tracking", TimerReset],
  ["Low Stock Alerts", "/inventory/low-stock-alerts", BellRing],
  ["Reports", "/inventory/reports", BarChart3],
  ["Settings", "/inventory/settings", Settings, ["admin", "manager"]],
  ["Tips & Tricks", "/tips-and-tricks", Lightbulb],
];

export default function InventoryShell({ children }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const allowed = allowedNavigation(user?.role, navigation);
  const preferenceKey = user ? `dg-inventory-navigation:${user._id || user.id}:${user.role}` : null;
  const [saved, setSaved] = useState({ key: null, pinned: [], collapsed: [] }), [storageError, setStorageError] = useState("");
  const trigger = useRef(null), drawer = useRef(null);
  const prefs = saved.key === preferenceKey ? navigationPreferences(saved, allowed) : navigationPreferences(null, allowed);
  useEffect(() => {
    try { setSaved({ key: preferenceKey, ...navigationPreferences(preferenceKey ? JSON.parse(localStorage.getItem(preferenceKey) || "null") : null, allowedNavigation(user?.role, navigation)) }); setStorageError(""); }
    catch { setSaved({ key: preferenceKey, pinned: [], collapsed: [] }); setStorageError("Navigation preferences could not be restored."); }
  }, [preferenceKey, user?.role]);
  const update = values => {
    const next = navigationPreferences({ ...prefs, ...values }, allowed); setSaved({ key: preferenceKey, ...next });
    try { if (preferenceKey) localStorage.setItem(preferenceKey, JSON.stringify(next)); setStorageError(""); }
    catch { setStorageError("Preferences apply to this visit only; browser storage is unavailable."); }
  };
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawer.current?.querySelector("a,button")?.focus();
    const key = event => {
      if (event.key === "Escape") { event.preventDefault(); setMobileOpen(false); }
      if (event.key === "Tab" && matchMedia("(max-width: 1023px)").matches) {
        const choices = [...drawer.current.querySelectorAll("a,button")].filter(node => node.getClientRects().length && !node.disabled), first = choices[0], last = choices.at(-1);
        if (event.shiftKey && (document.activeElement === first || !drawer.current.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); if (previous?.isConnected) previous.focus(); };
  }, [mobileOpen]);
  const entry = ([label, href, Icon], favourite = false) => <div key={href} className="flex min-w-0 items-center gap-1"><Link href={href} aria-current={pathname === href ? "page" : undefined} className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-sm ${pathname === href ? "bg-dune-amber/15 text-dune-amberLight" : "text-neutral-300 hover:bg-white/5"}`}><Icon className="h-4 w-4 shrink-0"/><span className="break-words">{label}</span></Link><button type="button" className="grid min-h-11 min-w-9 shrink-0 place-items-center rounded-lg text-neutral-400 hover:bg-white/10" title={`${prefs.pinned.includes(href) ? "Unpin" : "Pin"} ${label}`} aria-label={`${prefs.pinned.includes(href) ? "Unpin" : "Pin"} ${label}${favourite ? " from favourites" : ""}`} aria-pressed={prefs.pinned.includes(href)} onClick={() => update({ pinned: prefs.pinned.includes(href) ? prefs.pinned.filter(path => path !== href) : [...prefs.pinned, href] })}>{prefs.pinned.includes(href) ? <PinOff size={14}/> : <Pin size={14}/>}</button></div>;

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    const desktop = matchMedia("(min-width: 1024px)");
    const updateLayout = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener("change", updateLayout); return () => desktop.removeEventListener("change", updateLayout);
  }, []);

  return (
    <div className="min-h-screen bg-[#07090a] font-body text-neutral-200">
      {mobileOpen && <button type="button" className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close inventory navigation" />}
      <aside ref={drawer} role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen ? true : undefined} aria-label="Inventory navigation" className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-white/10 bg-[#090c0e] flex-col transition-transform lg:flex lg:translate-x-0 ${mobileOpen ? "flex translate-x-0" : "hidden -translate-x-full"}`}>
        <div className="flex items-center">          <button type="button" className="ml-auto rounded-lg p-1.5 text-neutral-400 lg:hidden" onClick={(event) => { event.preventDefault(); setMobileOpen(false); }} aria-label="Close navigation"><X className="h-4 w-4" /></button><Link href={user?.role === "accountant" ? "/inventory/supplier-invoices" : "/inventory"} className="flex h-24 min-w-0 flex-1 items-center gap-3 border-b border-white/10 px-3">
          <span className="hidden h-11 w-11 shrink-0 items-center lg:flex justify-center rounded-2xl bg-dune-amber text-black shadow-amberGlow">
            <Archive className="h-6 w-6" />
          </span>

          <span>
            <span className="block text-base font-extrabold tracking-tight text-white">DUNE &amp; GRILLS</span>
            <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-dune-amberLight">Inventory Management</span>
          </span>
        </Link></div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {prefs.pinned.length > 0 && <section aria-label="Favourites" className="mb-4"><h2 className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-dune-amber">Favourites</h2>{prefs.pinned.map(path => allowed.find(row => row[1] === path)).filter(Boolean).map(row => entry(row, true))}</section>}
          {navigationGroups.map(([name, paths]) => {
            const rows = paths.map(path => allowed.find(row => row[1] === path)).filter(Boolean);
            if (!rows.length) return null;
            const expanded = paths.includes(pathname) || !prefs.collapsed.includes(name);
            return <section key={name} className="mb-2"><button type="button" aria-expanded={expanded} aria-controls={`inventory-group-${paths[0].replaceAll('/', '-') }`} onClick={() => update({ collapsed: prefs.collapsed.includes(name) ? prefs.collapsed.filter(value => value !== name) : [...prefs.collapsed, name] })} className="flex min-h-11 w-full items-center justify-between px-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{name}<ChevronDown size={14} className={expanded ? "" : "-rotate-90"}/></button><div hidden={!expanded} id={`inventory-group-${paths[0].replaceAll('/', '-')}`}>{rows.map(row => entry(row))}</div></section>;
          })}
          {storageError && <p role="status" className="px-3 text-xs text-amber-200">{storageError}</p>}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
            <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-dune-amber/15 text-sm font-bold text-dune-amber">{user?.name?.charAt(0)?.toUpperCase() || "A"}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{user?.name || "Inventory Manager"}</p><p className="truncate text-[0.65rem] capitalize text-neutral-400">{user?.role || "Manager"} · SAR</p></div><button type="button" onClick={logout} className="rounded-lg p-2 text-neutral-400 hover:bg-red-500/10 hover:text-red-300" aria-label="Log out"><LogOut className="h-4 w-4" /></button></div>
          </div>
        </div>
      </aside>

      <div inert={mobileOpen ? "" : undefined} className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#090c0e]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button ref={trigger} type="button" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="rounded-xl border border-white/10 p-2 text-neutral-400 lg:hidden" aria-label="Open inventory navigation"><Menu className="h-4 w-4" /></button>
            <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-dune-amber">Operations</p>
            <p className="truncate text-sm text-neutral-400">Inventory control center</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2"><StockAlertBell user={user}/><WorkspaceThemeToggle />{["admin", "manager"].includes(user?.role) && <Link href="/admin" aria-label="Admin Dashboard" className="rounded-xl border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:border-dune-amber/40 hover:text-white">Admin<span className="hidden sm:inline"> Dashboard</span></Link>}</div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
