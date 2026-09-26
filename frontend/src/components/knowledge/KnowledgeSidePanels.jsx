"use client";

import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  ClipboardCheck,
  FileWarning,
  HelpCircle,
  History,
  Lightbulb,
  PackagePlus,
  Send,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { badgeTone, ICONS } from "./KnowledgeCards.jsx";

const panelClass = "rounded-2xl border border-white/[0.08] bg-white/[0.022] p-4";

export function CriticalNotes({ notes }) {
  return <section aria-labelledby="critical-notes-heading" className="rounded-2xl border border-red-500/25 bg-red-500/[0.055] p-4">
    <div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-red-400" /><h2 id="critical-notes-heading" className="font-body text-base font-semibold text-white">Critical Notes</h2><span className="ml-auto rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">{notes.length}</span></div>
    <ul className="mt-4 space-y-3">{notes.map((note) => <li key={note} className="flex gap-3 text-sm leading-5 text-neutral-300"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden="true" />{note}</li>)}</ul>
  </section>;
}

const QUICK_ICONS = { checklist: ClipboardCheck, stock: PackagePlus, waste: Trash2, issue: FileWarning };

export function QuickActions({ actions }) {
  return <section aria-labelledby="quick-actions-heading" className={panelClass}>
    <div className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-dune-amber" /><h2 id="quick-actions-heading" className="font-body text-base font-semibold text-white">Quick Actions</h2></div>
    <div className="mt-3 space-y-2">{actions.map((action) => {
      const Icon = QUICK_ICONS[action.icon] || ClipboardCheck;
      const content = <><Icon className="h-4 w-4 text-dune-amber" /><span className="min-w-0 flex-1 truncate">{action.label}</span><ChevronRight className="h-4 w-4 text-neutral-600" /></>;
      const className = "flex min-h-11 w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-black/15 px-3 text-left text-sm text-neutral-300 transition-colors hover:border-dune-amber/30 hover:text-white";
      return action.href
        ? <Link key={action.label} href={action.href} className={className}>{content}</Link>
        : <button key={action.label} type="button" onClick={action.onClick} className={className}>{content}</button>;
    })}</div>
  </section>;
}

export function RecentlyViewed({ guides, onOpen }) {
  return <section aria-labelledby="recently-viewed-heading" className={panelClass}>
    <div className="flex items-center gap-2"><History className="h-5 w-5 text-neutral-400" /><h2 id="recently-viewed-heading" className="font-body text-base font-semibold text-white">Recently Viewed</h2></div>
    <div className="mt-3 divide-y divide-white/[0.07]">{guides.map((guide) => {
      const Icon = ICONS[guide.icon] || ClipboardCheck;
      return <button key={guide.id} type="button" onClick={() => onOpen(guide)} className="flex min-h-12 w-full items-center gap-3 py-2 text-left"><Icon className="h-4 w-4 shrink-0 text-neutral-500" /><span className="min-w-0 flex-1 truncate text-xs text-neutral-300 hover:text-white">{guide.title}</span><span className={`rounded-full border px-2 py-0.5 text-[0.58rem] font-semibold ${badgeTone(guide.type)}`}>{guide.type}</span></button>;
    })}</div>
  </section>;
}

export function NeedHelp({ onSuggest }) {
  return <section className="rounded-2xl border border-dune-amber/25 bg-dune-amber/[0.055] p-4">
    <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-dune-amber text-black"><HelpCircle className="h-5 w-5" /></span><div><h2 className="font-body text-base font-semibold text-white">Need Help?</h2><p className="mt-1 text-xs leading-5 text-neutral-400">Can&apos;t find what you&apos;re looking for?</p></div></div>
    <button type="button" onClick={onSuggest} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-dune-amber px-4 text-sm font-bold text-black transition-colors hover:bg-dune-amberLight"><Send className="h-4 w-4" />Suggest a Guide<ArrowRight className="h-4 w-4" /></button>
  </section>;
}

function ModalFrame({ title, description, onClose, children }) {
  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section role="dialog" aria-modal="true" aria-labelledby="knowledge-dialog-title" aria-describedby={description ? "knowledge-dialog-description" : undefined} className="my-8 w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d1113] p-5 shadow-2xl shadow-black/60 sm:p-6">
      <div className="flex items-start gap-4"><div className="min-w-0 flex-1"><h2 id="knowledge-dialog-title" className="font-body text-xl font-semibold text-white">{title}</h2>{description && <p id="knowledge-dialog-description" className="mt-1 text-sm leading-6 text-neutral-500">{description}</p>}</div><button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-neutral-400 hover:border-dune-amber/30 hover:text-white" aria-label="Close dialog"><X className="h-4 w-4" /></button></div>
      {children}
    </section>
  </div>;
}

export function GuideDialog({ guide, onClose, canOpenRelated }) {
  if (!guide) return null;
  return <ModalFrame title={guide.title} description={guide.description} onClose={onClose}>
    <div className="mt-4 flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeTone(guide.type)}`}>{guide.type}</span><span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-xs capitalize text-neutral-400">{guide.roles.join(" · ")}</span></div>
    <div className="mt-6 space-y-4">{guide.sections.map((section) => <section key={section.heading} className="rounded-xl border border-white/[0.07] bg-black/15 p-4"><h3 className="font-body text-sm font-semibold text-white">{section.heading}</h3><p className="mt-2 text-sm leading-6 text-neutral-400">{section.body}</p></section>)}</div>
    {guide.relatedRoute && canOpenRelated && <Link href={guide.relatedRoute} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-dune-amber px-4 text-sm font-bold text-black hover:bg-dune-amberLight">Open related workflow<ArrowRight className="h-4 w-4" /></Link>}
  </ModalFrame>;
}

export function SuggestGuideDialog({ mode = "guide", onClose, onSubmit }) {
  const [form, setForm] = useState({ title: "", details: "" });
  const isIssue = mode === "issue";
  const submit = (event) => {
    event.preventDefault();
    onSubmit({ ...form, type: mode });
  };
  return <ModalFrame title={isIssue ? "Report an Operational Issue" : "Suggest a Guide"} description="This form saves a local draft on this device. It is not sent to a server or manager automatically." onClose={onClose}>
    <form onSubmit={submit} className="mt-5 space-y-4">
      <label className="block text-sm text-neutral-300">{isIssue ? "Issue title" : "Guide title"}<input autoFocus required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/60" placeholder={isIssue ? "What needs attention?" : "What should the guide cover?"} /></label>
      <label className="block text-sm text-neutral-300">Details<textarea required rows={5} maxLength={1000} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/25 p-3 text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/60" placeholder="Add enough context for your manager to review this draft." /></label>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-white/10 px-4 text-sm text-neutral-300 hover:bg-white/5">Cancel</button><button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-dune-amber px-5 text-sm font-bold text-black hover:bg-dune-amberLight"><Send className="h-4 w-4" />Save local draft</button></div>
    </form>
  </ModalFrame>;
}
