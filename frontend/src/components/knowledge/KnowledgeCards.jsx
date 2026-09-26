"use client";

import Image from "next/image";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  ChefHat,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Monitor,
  Moon,
  SearchX,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Tag,
  TriangleAlert,
  Users,
} from "lucide-react";
import { formatKnowledgeDate } from "./knowledgeBaseUtils.js";

const ICONS = {
  boxes: Boxes,
  chart: BarChart3,
  chef: ChefHat,
  clipboard: ClipboardCheck,
  monitor: Monitor,
  moon: Moon,
  settings: Settings,
  shield: ShieldCheck,
  sparkles: Sparkles,
  sun: Sun,
  tag: Tag,
  triangle: TriangleAlert,
  users: Users,
  cart: Monitor,
};

const iconTone = (tone) => tone === "critical"
  ? "border-red-500/20 bg-red-500/10 text-red-400"
  : tone === "safety"
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
    : "border-dune-amber/20 bg-dune-amber/10 text-dune-amber";

const badgeTone = (type) => type === "Important"
  ? "border-red-500/25 bg-red-500/10 text-red-300"
  : type === "Checklist"
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
    : "border-blue-500/25 bg-blue-500/10 text-blue-300";

export function CategoryGrid({ categories, selectedCategory, onSelect }) {
  return <section aria-labelledby="knowledge-categories-heading">
    <div className="mb-4 flex items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-dune-amber">Browse by department</p><h2 id="knowledge-categories-heading" className="mt-1 font-body text-xl font-semibold text-white">Guide Categories</h2></div>
      {selectedCategory && <button type="button" onClick={() => onSelect("")} className="text-xs font-semibold text-dune-amber hover:text-dune-amberLight">Clear category</button>}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {categories.map((category) => {
        const Icon = ICONS[category.icon] || Boxes;
        const active = selectedCategory === category.id;
        return <button key={category.id} type="button" onClick={() => onSelect(active ? "" : category.id)} aria-pressed={active} className={`group flex min-h-24 items-center gap-4 rounded-2xl border p-4 text-left shadow-lg shadow-black/10 transition-colors focus-visible:outline-none ${active ? "border-dune-amber/60 bg-dune-amber/[0.08]" : "border-white/[0.08] bg-white/[0.025] hover:border-dune-amber/30 hover:bg-white/[0.045]"}`}>
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border ${iconTone(category.tone)}`}><Icon className="h-6 w-6" /></span>
          <span className="min-w-0 flex-1"><span className="block font-body text-base font-semibold text-white">{category.name}</span><span className="mt-1 block text-xs text-neutral-500">{category.count} guides</span></span>
          <ChevronRight className="h-5 w-5 text-neutral-600 transition-transform group-hover:translate-x-1 group-hover:text-dune-amber" />
        </button>;
      })}
    </div>
  </section>;
}

export function TipOfTheDay({ tip }) {
  return <section aria-labelledby="tip-heading" className="relative min-h-48 overflow-hidden rounded-2xl border border-dune-amber/25 bg-[#16130d] shadow-xl shadow-black/20">
    <Image src={tip.image} alt={tip.imageAlt} fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover object-center opacity-65" priority={false} />
    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#15120c] via-[#15120c]/95 to-[#15120c]/15" />
    <div className="relative z-10 flex min-h-48 max-w-2xl items-start gap-4 p-5 sm:p-7">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-dune-amber/30 bg-dune-amber/15 text-dune-amber"><Sun className="h-6 w-6" /></span>
      <div><p className="text-sm font-semibold text-dune-amber">Tip of the Day</p><h2 id="tip-heading" className="mt-1 font-body text-2xl font-semibold text-white">{tip.title}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-neutral-300">{tip.description}</p></div>
    </div>
  </section>;
}

export function GuideCard({ guide, onOpen }) {
  const Icon = ICONS[guide.icon] || ClipboardCheck;
  return <button type="button" onClick={() => onOpen(guide)} className="group flex min-h-44 w-full flex-col rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 text-left transition-colors hover:border-dune-amber/30 hover:bg-white/[0.045] focus-visible:outline-none">
    <span className="flex w-full items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-dune-amber/20 bg-dune-amber/10 text-dune-amber"><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1"><span className="block font-body text-sm font-semibold text-white">{guide.title}</span><span className="mt-1 line-clamp-2 block text-xs leading-5 text-neutral-500">{guide.description}</span></span>
      <span className={`shrink-0 rounded-full border px-2 py-1 text-[0.62rem] font-semibold ${badgeTone(guide.type)}`}>{guide.type}</span>
    </span>
    <span className="mt-auto flex w-full items-center gap-2 pt-4 text-[0.68rem] text-neutral-500"><Clock3 className="h-3.5 w-3.5" />{guide.readingTime} min read<span className="mx-1 text-neutral-700">·</span><span className="truncate capitalize">{guide.roles.slice(0, 2).join(" / ")}</span><ArrowRight className="ml-auto h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:text-dune-amber" /></span>
  </button>;
}

export function GuideLibrary({ guides, filtered, onOpen, onClear }) {
  return <section id="guide-library" aria-labelledby="guide-library-heading" className="rounded-2xl border border-white/[0.08] bg-white/[0.018] p-4 sm:p-5">
    <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-dune-amber">{filtered ? "Filtered library" : "Staff essentials"}</p><h2 id="guide-library-heading" className="mt-1 font-body text-xl font-semibold text-white">{filtered ? "Matching Guides" : "Pinned Guides"}</h2></div>{filtered && <button type="button" onClick={onClear} className="text-xs font-semibold text-dune-amber hover:text-dune-amberLight">Clear filters</button>}</div>
    {guides.length ? <div className="grid gap-3 md:grid-cols-2">{guides.map((guide) => <GuideCard key={guide.id} guide={guide} onOpen={onOpen} />)}</div> : <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-white/10 bg-black/10 p-6 text-center"><div><SearchX className="mx-auto h-8 w-8 text-neutral-600" /><h3 className="mt-3 font-body text-sm font-semibold text-white">No matching guides</h3><p className="mt-1 text-xs text-neutral-500">Try another search term, category, or role.</p></div></div>}
  </section>;
}

export function RecentUpdates({ guides, onOpen }) {
  return <section aria-labelledby="recent-updates-heading" className="rounded-2xl border border-white/[0.08] bg-white/[0.018] p-4 sm:p-5">
    <div className="mb-3"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-dune-amber">What changed</p><h2 id="recent-updates-heading" className="mt-1 font-body text-xl font-semibold text-white">Recent Updates</h2></div>
    <div className="divide-y divide-white/[0.07]">{guides.map((guide) => {
      const Icon = ICONS[guide.icon] || ClipboardCheck;
      return <button key={guide.id} type="button" onClick={() => onOpen(guide)} className="group grid w-full gap-3 py-4 text-left sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-dune-amber/10 text-dune-amber"><Icon className="h-4 w-4" /></span>
        <span className="min-w-0"><span className="block text-sm font-semibold text-white group-hover:text-dune-amber">{guide.title}</span><span className="mt-1 block text-xs leading-5 text-neutral-500">{guide.updateSummary}</span></span>
        <span className="text-xs text-neutral-500">{formatKnowledgeDate(guide.lastUpdated)}</span>
        <span className={`w-fit rounded-full border px-2 py-1 text-[0.62rem] font-semibold ${guide.updateStatus === "New" ? "border-blue-500/25 bg-blue-500/10 text-blue-300" : "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"}`}>{guide.updateStatus}</span>
      </button>;
    })}</div>
  </section>;
}

export { ICONS, badgeTone };
