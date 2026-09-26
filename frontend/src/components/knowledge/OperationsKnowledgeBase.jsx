"use client";

import { CalendarDays, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext.jsx";
import AdminShell from "../admin/AdminShell.jsx";
import { CategoryGrid, GuideLibrary, RecentUpdates, TipOfTheDay } from "./KnowledgeCards.jsx";
import {
  CriticalNotes,
  GuideDialog,
  NeedHelp,
  QuickActions,
  RecentlyViewed,
  SuggestGuideDialog,
} from "./KnowledgeSidePanels.jsx";
import {
  CRITICAL_NOTES,
  DEFAULT_RECENT_GUIDE_IDS,
  KNOWLEDGE_BASE_UPDATED_AT,
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_GUIDES,
  RECENT_UPDATE_IDS,
  ROLE_FILTERS,
  TIP_OF_THE_DAY,
} from "./knowledgeBaseData.js";
import { KNOWLEDGE_ADMIN_WORKFLOW_ROLES, KNOWLEDGE_INVENTORY_WORKFLOW_ROLES } from "./knowledgePermissions.js";
import { filterKnowledgeGuides, lastUpdatedLabel } from "./knowledgeBaseUtils.js";

const RECENT_STORAGE_KEY = "dg_knowledge_recent_guides";
const DRAFT_STORAGE_KEY = "dg_knowledge_local_drafts";

const safeStoredList = (key, fallback = []) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export default function OperationsKnowledgeBase() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [activeGuide, setActiveGuide] = useState(null);
  const [suggestMode, setSuggestMode] = useState(null);
  const [recentIds, setRecentIds] = useState(DEFAULT_RECENT_GUIDE_IDS);

  useEffect(() => {
    setRecentIds(safeStoredList(RECENT_STORAGE_KEY, DEFAULT_RECENT_GUIDE_IDS).filter((id) => KNOWLEDGE_GUIDES.some((guide) => guide.id === id)).slice(0, 4));
  }, []);

  const filtersActive = Boolean(query.trim() || category || type || role !== "all");
  const filteredGuides = useMemo(() => filterKnowledgeGuides(KNOWLEDGE_GUIDES, { query, role, category, type }), [category, query, role, type]);
  const libraryGuides = filtersActive ? filteredGuides : KNOWLEDGE_GUIDES.filter((guide) => guide.isPinned);
  const recentGuides = recentIds.map((id) => KNOWLEDGE_GUIDES.find((guide) => guide.id === id)).filter(Boolean);
  const updatedGuides = RECENT_UPDATE_IDS.map((id) => KNOWLEDGE_GUIDES.find((guide) => guide.id === id)).filter(Boolean);

  const clearFilters = () => {
    setQuery("");
    setRole("all");
    setCategory("");
    setType("");
  };

  const showLibrary = () => setTimeout(() => document.getElementById("guide-library")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  const selectCategory = (nextCategory) => {
    setCategory(nextCategory);
    setType("");
    if (nextCategory) showLibrary();
  };

  const openGuide = (guide) => {
    setActiveGuide(guide);
    const next = [guide.id, ...recentIds.filter((id) => id !== guide.id)].slice(0, 4);
    setRecentIds(next);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  };

  const saveLocalDraft = (draft) => {
    const current = safeStoredList(DRAFT_STORAGE_KEY);
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify([{ ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...current].slice(0, 20)));
    setSuggestMode(null);
    toast.info("Draft saved on this device. Share it with your manager for follow-up.");
  };

  const quickActions = [
    { label: "Open Checklists", icon: "checklist", onClick: () => { setQuery(""); setCategory(""); setRole("all"); setType("checklist"); showLibrary(); } },
    ...(KNOWLEDGE_INVENTORY_WORKFLOW_ROLES.includes(user?.role) ? [
      { label: "Stock In", icon: "stock", href: "/inventory/stock-in" },
      { label: "Record Waste", icon: "waste", href: "/inventory/waste-damaged" },
    ] : []),
    { label: "Report an Issue", icon: "issue", onClick: () => setSuggestMode("issue") },
  ];

  const canOpenRelated = (guide) => {
    if (!guide?.relatedRoute) return false;
    if (guide.relatedRoute.startsWith("/inventory")) return KNOWLEDGE_INVENTORY_WORKFLOW_ROLES.includes(user?.role);
    if (guide.relatedRoute.startsWith("/admin")) return KNOWLEDGE_ADMIN_WORKFLOW_ROLES.includes(user?.role);
    return true;
  };

  return <AdminShell
    activeTab="tips"
    onTabChange={(tab) => { router.push(`/admin?tab=${tab}`); return true; }}
    title=""
    subtitle=""
    user={user}
    onLogout={logout}
    showGlobalSearch={false}
    showOrderControls={false}
    showPageHeading={false}
    showSidebarUserCard
  >
    <div className="mx-auto max-w-6xl space-y-7 pb-10">
      <header className="flex flex-col gap-5 border-b border-white/[0.07] pb-6 md:flex-row md:items-end md:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-dune-amber">Operations</p><h1 className="mt-2 font-body text-3xl font-semibold tracking-tight text-white sm:text-4xl">Operations Knowledge Base</h1><p className="mt-1 text-lg font-medium text-neutral-200">Internal Staff Guide</p><p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">Standard procedures, practical tips, and daily operations — all in one place.</p></div>
        <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-xs text-neutral-400"><CalendarDays className="h-4 w-4 text-dune-amber" />{lastUpdatedLabel(KNOWLEDGE_BASE_UPDATED_AT)}</div>
      </header>

      <section aria-label="Search and filter guides">
        <label className="relative block"><span className="sr-only">Search knowledge base</span><Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search SOPs, guides, and checklists…" className="h-14 w-full rounded-2xl border border-white/10 bg-white/[0.03] pl-12 pr-4 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-dune-amber/60" /></label>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Filter guides by assigned role">{ROLE_FILTERS.map((filter) => <button key={filter.id} type="button" onClick={() => setRole(filter.id)} aria-pressed={role === filter.id} className={`min-h-10 shrink-0 rounded-xl border px-4 text-xs font-semibold transition-colors ${role === filter.id ? "border-dune-amber bg-dune-amber/10 text-dune-amber" : "border-white/10 text-neutral-400 hover:border-dune-amber/30 hover:text-white"}`}>{filter.label}</button>)}</div>
        <p className="mt-2 text-right text-xs text-neutral-600" aria-live="polite">{filtersActive ? `${filteredGuides.length} matching guide${filteredGuides.length === 1 ? "" : "s"}` : "Showing staff essentials"}</p>
      </section>

      <CategoryGrid categories={KNOWLEDGE_CATEGORIES} selectedCategory={category} onSelect={selectCategory} />
      <TipOfTheDay tip={TIP_OF_THE_DAY} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(290px,1fr)]">
        <div className="min-w-0 space-y-6">
          <GuideLibrary guides={libraryGuides} filtered={filtersActive} onOpen={openGuide} onClear={clearFilters} />
          <RecentUpdates guides={updatedGuides} onOpen={openGuide} />
        </div>
        <aside className="space-y-4" aria-label="Knowledge base tools">
          <CriticalNotes notes={CRITICAL_NOTES} />
          <QuickActions actions={quickActions} />
          <RecentlyViewed guides={recentGuides} onOpen={openGuide} />
          <NeedHelp onSuggest={() => setSuggestMode("guide")} />
        </aside>
      </div>
    </div>

    <GuideDialog guide={activeGuide} onClose={() => setActiveGuide(null)} canOpenRelated={canOpenRelated(activeGuide)} />
    {suggestMode && <SuggestGuideDialog mode={suggestMode} onClose={() => setSuggestMode(null)} onSubmit={saveLocalDraft} />}
  </AdminShell>;
}
