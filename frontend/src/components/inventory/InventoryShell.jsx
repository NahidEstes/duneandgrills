"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/src/context/AuthContext.jsx";
import {
  Archive,
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
  Settings,
  Tags,
  TimerReset,
  ArrowLeftRight,
  ChefHat,
  Trash2,
  X,
} from "lucide-react";

const navigation = [
  ["Overview", "/inventory", LayoutDashboard],
  ["Stock Items", "/inventory/stock-items", Boxes],
  ["Categories", "/inventory/categories", Tags],
  ["Suppliers", "/inventory/suppliers", Building2],
  ["Purchase Orders", "/inventory/purchase-orders", ReceiptText],
  ["Stock In", "/inventory/stock-in", PackagePlus],
  ["Stock Out", "/inventory/stock-out", PackageMinus],
  ["Stock Movements", "/inventory/stock-movements", ArrowLeftRight],
  ["Recipes", "/inventory/recipes", ChefHat],
  ["Waste / Damaged", "/inventory/waste-damaged", Trash2],
  ["Inventory Count", "/inventory/inventory-count", ClipboardCheck],
  ["Expiry Tracking", "/inventory/expiry-tracking", TimerReset],
  ["Low Stock Alerts", "/inventory/low-stock-alerts", BellRing],
  ["Reports", "/inventory/reports", BarChart3],
  ["Settings", "/inventory/settings", Settings],
];

export default function InventoryShell({ children }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="min-h-screen bg-[#07090a] font-body text-neutral-200">
      {mobileOpen && <button type="button" className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close inventory navigation" />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-white/10 bg-[#090c0e] flex-col transition-transform lg:flex lg:translate-x-0 ${mobileOpen ? "flex translate-x-0" : "hidden -translate-x-full"}`}>
        <Link href="/inventory" className="flex h-24 items-center gap-3 border-b border-white/10 px-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-dune-amber text-black shadow-amberGlow">
            <Archive className="h-6 w-6" />
          </span>
          <button type="button" className="ml-auto rounded-lg p-1.5 text-neutral-500 lg:hidden" onClick={(event) => { event.preventDefault(); setMobileOpen(false); }} aria-label="Close navigation"><X className="h-4 w-4" /></button>
          <span>
            <span className="block text-lg font-extrabold tracking-tight text-white">DUNE &amp; GRILLS</span>
            <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-dune-amberLight">Inventory Management</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navigation.map(([label, href, Icon]) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-gradient-to-r from-dune-amberDeep to-[#6a300c] text-white shadow-lg shadow-orange-950/30"
                    : "text-neutral-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className={`h-4.5 w-4.5 ${active ? "text-dune-amberLight" : ""}`} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
            <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-dune-amber/15 text-sm font-bold text-dune-amber">{user?.name?.charAt(0)?.toUpperCase() || "A"}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{user?.name || "Inventory Manager"}</p><p className="truncate text-[0.65rem] capitalize text-neutral-600">{user?.role || "Manager"} · SAR</p></div><button type="button" onClick={logout} className="rounded-lg p-2 text-neutral-600 hover:bg-red-500/10 hover:text-red-300" aria-label="Log out"><LogOut className="h-4 w-4" /></button></div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#090c0e]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMobileOpen(true)} className="rounded-xl border border-white/10 p-2 text-neutral-400 lg:hidden" aria-label="Open inventory navigation"><Menu className="h-4 w-4" /></button>
            <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-dune-amber">Operations</p>
            <p className="text-sm text-neutral-400">Inventory control center</p>
            </div>
          </div>
          <Link href="/admin" className="rounded-xl border border-white/10 px-3 py-2 text-xs text-neutral-300 hover:border-dune-amber/40 hover:text-white">
            Admin Dashboard
          </Link>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
