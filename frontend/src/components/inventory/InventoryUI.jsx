"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, PackageOpen, X } from "lucide-react";
import { formatSar } from "./inventoryUtils.js";

export const cardClass = "rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.055] to-white/[0.02] shadow-xl shadow-black/10";

export function Button({ children, variant = "primary", size = "md", className = "", type = "button", ...props }) {
  const variants = {
    primary: "bg-dune-amber text-black hover:bg-dune-amberLight disabled:bg-dune-amber/40",
    secondary: "border border-white/10 bg-white/[0.035] text-neutral-200 hover:border-white/20 hover:bg-white/[0.07]",
    danger: "border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/20",
    ghost: "text-neutral-400 hover:bg-white/5 hover:text-white",
  };
  const sizes = { sm: "px-3 py-2 text-xs", md: "px-4 py-2.5 text-sm", icon: "h-9 w-9" };
  return <button type={type} className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${sizes[size]} ${className}`} {...props}>{children}</button>;
}

export function Badge({ children, tone = "neutral" }) {
  const tones = {
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    danger: "border-red-500/20 bg-red-500/10 text-red-300",
    info: "border-blue-500/20 bg-blue-500/10 text-blue-300",
    violet: "border-violet-500/20 bg-violet-500/10 text-violet-300",
    neutral: "border-white/10 bg-white/5 text-neutral-400",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${tones[tone] || tones.neutral}`}>{children}</span>;
}

export function PageHeader({ eyebrow = "Inventory", title, description, actions }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-dune-amber">{eyebrow}</p><h1 className="font-body text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1><p className="mt-1 max-w-3xl text-sm text-neutral-500">{description}</p></div>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>;
}

export function StatCard({ label, value, caption, icon: Icon, tone = "orange" }) {
  const tones = { orange: "bg-orange-500/15 text-orange-400", green: "bg-emerald-500/15 text-emerald-400", amber: "bg-amber-500/15 text-amber-400", red: "bg-red-500/15 text-red-400", violet: "bg-violet-500/15 text-violet-400", blue: "bg-blue-500/15 text-blue-400" };
  return <article className={`${cardClass} p-4`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-neutral-400">{label}</p><p className="mt-1 truncate text-2xl font-semibold text-white">{value}</p></div>{Icon && <span className={`rounded-xl p-2.5 ${tones[tone]}`}><Icon className="h-5 w-5" /></span>}</div>{caption && <p className="mt-4 text-[0.7rem] text-neutral-600">{caption}</p>}</article>;
}

export function Field({ label, hint, error, children, className = "" }) {
  return <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-medium text-neutral-300">{label}</span>{children}{hint && !error && <span className="mt-1 block text-[0.68rem] text-neutral-600">{hint}</span>}{error && <span className="mt-1 block text-[0.68rem] text-red-400">{error}</span>}</label>;
}

export const inputClass = "h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white placeholder:text-neutral-700 transition focus:border-dune-amber/60 focus:outline-none";
export const textareaClass = `${inputClass} h-auto min-h-24 py-2.5`;

export function Modal({ open, onClose, title, description, children, maxWidth = "max-w-2xl" }) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [onClose, open]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className={`max-h-[92vh] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#111416] shadow-2xl ${maxWidth}`}><div className="flex items-start justify-between gap-4 border-b border-white/10 p-5"><div><h2 className="font-body text-lg font-semibold text-white">{title}</h2>{description && <p className="mt-1 text-xs text-neutral-500">{description}</p>}</div><button type="button" onClick={onClose} className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></button></div><div className="max-h-[calc(92vh-82px)] overflow-y-auto p-5">{children}</div></div></div>;
}

export function LoadingState({ label = "Loading inventory data…" }) {
  return <div className="grid min-h-60 place-items-center p-8 text-sm text-neutral-500"><div className="text-center"><LoaderCircle className="mx-auto mb-3 h-6 w-6 animate-spin text-dune-amber" />{label}</div></div>;
}

export function EmptyState({ title = "No records found", description = "Try changing the filters or add your first record.", action }) {
  return <div className="grid min-h-60 place-items-center p-8 text-center"><div><PackageOpen className="mx-auto h-9 w-9 text-dune-amber/60" /><p className="mt-3 text-sm font-medium text-neutral-300">{title}</p><p className="mt-1 max-w-sm text-xs text-neutral-600">{description}</p>{action && <div className="mt-4">{action}</div>}</div></div>;
}

export function DataTable({ columns, rows, rowKey = "_id", empty, onRowClick }) {
  if (!rows?.length) return empty || <EmptyState />;
  return <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-white/10 bg-black/20 text-[0.68rem] uppercase tracking-wider text-neutral-600"><tr>{columns.map((column) => <th key={column.key} className={`whitespace-nowrap px-4 py-3 font-medium ${column.className || ""}`}>{column.label}</th>)}</tr></thead><tbody className="divide-y divide-white/[0.06]">{rows.map((row) => <tr key={row[rowKey]} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? "cursor-pointer transition hover:bg-white/[0.035]" : "transition hover:bg-white/[0.02]"}>{columns.map((column) => <td key={column.key} className={`whitespace-nowrap px-4 py-3 text-neutral-300 ${column.className || ""}`}>{column.render ? column.render(row) : row[column.key] ?? "—"}</td>)}</tr>)}</tbody></table></div>;
}

export function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.pages <= 1) return null;
  return <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-neutral-500"><span>{pagination.total} records · Page {pagination.page} of {pagination.pages}</span><div className="flex gap-1"><Button variant="secondary" size="icon" disabled={pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button><Button variant="secondary" size="icon" disabled={pagination.page >= pagination.pages} onClick={() => onPageChange(pagination.page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button></div></div>;
}

export function Money({ value }) { return <span className="tabular-nums">{formatSar(value)}</span>; }
