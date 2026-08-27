"use client";

import Link from "next/link";
import {
  BarChart3,
  Bell,
  BookOpenText,
  Boxes,
  ChevronDown,
  ClipboardList,
  Flame,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Search,
  Settings,
  Star,
  Store,
  Tag,
  Users,
  UserRoundCog,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import SmartImage from "../SmartImage.jsx";

const NAV_ITEMS = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "orders", label: "Orders", icon: ClipboardList, badge: "orders" },
  { id: "menu", label: "Menu Items", icon: UtensilsCrossed },
  { id: "categories", label: "Categories", icon: Boxes },
  { id: "customers", label: "Customers", icon: Users },
  { id: "offers", label: "Offers", icon: Tag },
  { id: "blog", label: "Blog", icon: BookOpenText },
  { id: "reviews", label: "Reviews", icon: Star },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "staff", label: "Staff", icon: UserRoundCog },
  { id: "settings", label: "Settings", icon: Settings },
];

const SearchResults = ({ results, searching, query, onSelect }) => {
  if (query.trim().length < 2) return null;

  return (
    <div className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-50 overflow-hidden rounded-xl border border-white/10 bg-[#101416] shadow-2xl shadow-black/60">
      {searching ? (
        <p className="px-4 py-5 text-sm text-neutral-400">Searching…</p>
      ) : results.length ? (
        <div className="max-h-80 overflow-y-auto p-1.5">
          {results.map((result) => (
            <button
              key={`${result.type}-${result.id}`}
              type="button"
              onClick={() => onSelect(result)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06]"
            >
              {result.image ? (
                <SmartImage
                  src={result.image}
                  alt=""
                  width={64}
                  height={64}
                  sizes="36px"
                  className="h-9 w-9 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-dune-amber/10 text-dune-amber">
                  <Search className="h-4 w-4" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">
                  {result.title}
                </span>
                <span className="block truncate text-xs text-neutral-500">
                  {result.type} · {result.subtitle}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="px-4 py-5 text-sm text-neutral-400">
          No matching dashboard records.
        </p>
      )}
    </div>
  );
};

const Sidebar = ({ activeTab, onTabChange, orderBadge, onClose }) => (
  <div className="flex h-full flex-col bg-[#080b0d]">
    <div className="flex h-20 items-center justify-between border-b border-white/[0.07] px-5">
      <Link href="/" className="flex items-center gap-2.5" aria-label="Dune & Grills home">
        <Flame className="h-7 w-7 fill-dune-amber text-dune-amber" />
        <span className="leading-none">
          <span className="font-display text-[1.35rem] tracking-[0.08em] text-white">
            DUNE <span className="text-dune-amber">&amp;</span> GRILLS
          </span>
          <span className="mt-1 block text-[0.55rem] font-semibold tracking-[0.17em] text-dune-amber">
            SMOKE. SAVOR. REPEAT.
          </span>
        </span>
      </Link>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-2 text-neutral-400 hover:bg-white/5 hover:text-white lg:hidden"
        aria-label="Close navigation"
      >
        <X className="h-5 w-5" />
      </button>
    </div>

    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Admin navigation">
      {NAV_ITEMS.map(({ id, label, icon: Icon, badge }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              onTabChange(id);
              onClose?.();
            }}
            className={`group flex min-h-11 w-full items-center gap-3 rounded-lg border-l-2 px-3.5 text-sm font-medium transition-all ${
              active
                ? "border-dune-amber bg-gradient-to-r from-dune-amber/15 to-dune-amber/[0.04] text-dune-amber"
                : "border-transparent text-neutral-300 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <Icon className={`h-[1.1rem] w-[1.1rem] ${active ? "text-dune-amber" : "text-neutral-400 group-hover:text-white"}`} />
            <span className="flex-1 text-left">{label}</span>
            {badge === "orders" && orderBadge > 0 && (
              <span className="min-w-6 rounded-md bg-dune-amber/15 px-1.5 py-0.5 text-center text-[0.68rem] text-dune-amber">
                {orderBadge}
              </span>
            )}
          </button>
        );
      })}
    </nav>

    <div className="border-t border-white/[0.07] p-4">
      <Link
        href="/"
        className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-neutral-400 transition-colors hover:bg-white/[0.04] hover:text-white"
      >
        <Store className="h-4 w-4" /> View Restaurant
      </Link>
      <p className="mt-4 px-3 text-[0.65rem] leading-5 text-neutral-600">
        © {new Date().getFullYear()} DUNE &amp; GRILLS
        <br />All rights reserved.
      </p>
    </div>
  </div>
);

const AdminShell = ({
  activeTab,
  onTabChange,
  title,
  subtitle,
  user,
  onLogout,
  dashboard,
  searchQuery,
  onSearchChange,
  searchResults,
  searching,
  children,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    const close = (event) => {
      if (!profileRef.current?.contains(event.target)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const selectSearchResult = (result) => {
    onTabChange(result.tab);
    onSearchChange("");
  };

  return (
    <div className="min-h-screen bg-[#070a0c] font-body text-neutral-200">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-white/[0.08] lg:block">
        <Sidebar
          activeTab={activeTab}
          onTabChange={onTabChange}
          orderBadge={dashboard?.stats?.openOrders || 0}
        />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          />
          <aside className="relative h-full w-[min(82vw,288px)] border-r border-white/10 shadow-2xl">
            <Sidebar
              activeTab={activeTab}
              onTabChange={onTabChange}
              orderBadge={dashboard?.stats?.openOrders || 0}
              onClose={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="min-w-0 lg:pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#080b0d]/95 backdrop-blur-xl">
          <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6 xl:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 text-neutral-300 hover:border-dune-amber/50 hover:text-white lg:hidden"
            >
              <MenuIcon className="h-5 w-5" />
            </button>

            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search orders, customers, menu items…"
                aria-label="Search dashboard"
                className="h-10 w-full rounded-full border border-white/10 bg-white/[0.035] pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-dune-amber/60"
              />
              <SearchResults
                results={searchResults}
                searching={searching}
                query={searchQuery}
                onSelect={selectSearchResult}
              />
            </div>

            <div className="ml-auto hidden items-center gap-2 sm:flex">
              <div className="hidden rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-neutral-400 xl:block">
                Live data · {new Date().toLocaleDateString("en-SA", { month: "short", day: "numeric", year: "numeric" })}
              </div>
              <button
                type="button"
                onClick={() => onTabChange("orders")}
                className="relative flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-white"
                aria-label="Open orders needing attention"
              >
                <Bell className="h-5 w-5" />
                {(dashboard?.stats?.openOrders || 0) > 0 && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-dune-amber ring-2 ring-[#080b0d]" />
                )}
              </button>
            </div>

            <div ref={profileRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-white/5 sm:px-2"
                aria-expanded={profileOpen}
              >
                {user?.avatar ? (
                  <SmartImage
                    src={user.avatar}
                    alt=""
                    width={64}
                    height={64}
                    sizes="34px"
                    className="h-9 w-9 rounded-full object-cover ring-1 ring-white/15"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-dune-amber/15 font-semibold text-dune-amber ring-1 ring-dune-amber/25">
                    {user?.name?.charAt(0)?.toUpperCase() || "A"}
                  </span>
                )}
                <span className="hidden text-left md:block">
                  <span className="block max-w-28 truncate text-xs font-semibold text-white">
                    {user?.name || "Admin"}
                  </span>
                  <span className="block text-[0.65rem] capitalize text-neutral-500">
                    {user?.role || "Administrator"}
                  </span>
                </span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-neutral-500 md:block" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-[calc(100%+0.5rem)] w-48 rounded-xl border border-white/10 bg-[#101416] p-1.5 shadow-2xl">
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
                  >
                    <LogOut className="h-4 w-4" /> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="px-4 py-5 sm:px-6 sm:py-6 xl:px-8">
          <div className="mx-auto max-w-[1600px]">
            <div className="mb-5">
              <h1 className="font-body text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                {title}
              </h1>
              <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminShell;
