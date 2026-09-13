import { ChevronLeft, ChevronRight } from "lucide-react";
import { labelStatus, statusStyles } from "../adminUi.js";

export const customerCardClass = "rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.045] to-white/[0.018]";
export const customerInputClass = "h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/60";

export const StatusPill = ({ value }) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold ${statusStyles[value] || "border-white/10 bg-white/5 text-neutral-300"}`}>
    {labelStatus(value || "unknown")}
  </span>
);

export const Pagination = ({ pagination = {}, onPage }) => {
  const page = pagination.page || 1;
  const pages = pagination.pages || 1;
  return (
    <div className="flex flex-col gap-2 border-t border-white/[0.07] px-4 py-3 text-xs text-neutral-600 sm:flex-row sm:items-center sm:justify-between">
      <span>{pagination.total || 0} records · Page {page} of {pages}</span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 px-3 text-neutral-300 disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" />Previous</button>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 px-3 text-neutral-300 disabled:opacity-30">Next<ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
};

export const SectionLoading = ({ label = "Loading…" }) => (
  <div className="grid min-h-44 place-items-center text-sm text-neutral-500">{label}</div>
);

export const EmptySection = ({ children }) => (
  <div className="grid min-h-36 place-items-center px-5 text-center text-sm text-neutral-600">{children}</div>
);
