"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

export const inputClass = "h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/60";
export const panelClass = "rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-white/[0.018]";

export const formatRiyadhTime = (value) => value ? new Intl.DateTimeFormat("en-SA", {
  hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Riyadh",
}).format(new Date(value)) : "—";

export const formatMinutes = (minutes) => {
  const total = Math.max(0, Number(minutes) || 0);
  if (!total) return "—";
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return `${hours ? `${hours}h ` : ""}${remainder}m`.trim();
};

export const todayRiyadh = () => new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Riyadh",
}).format(new Date());

export const monthRiyadh = () => todayRiyadh().slice(0, 7);

export function StaffDialog({ title, open, onClose, children, maxWidth = "max-w-2xl" }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    dialogRef.current?.focus();
    const handleKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); previous?.focus?.(); };
  }, [onClose, open]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[140] grid place-items-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:p-5"><button type="button" className="absolute inset-0" aria-label="Close dialog" onClick={onClose} /><section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`relative z-10 my-auto max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#101416] p-5 shadow-2xl outline-none ${maxWidth}`}><div className="mb-5 flex items-center justify-between gap-4"><h2 className="font-body text-lg font-semibold text-white">{title}</h2><button type="button" onClick={onClose} className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></button></div>{children}</section></div>;
}
