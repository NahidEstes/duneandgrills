"use client";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

// Native modal focus trap/inert background. Children stay mounted when closed so
// the selected delivery's drafts and expanded timeline survive explicit refresh.
export default function DeliveryDialog({ open, onClose, title, busy = false, centered = false, children }) {
  const dialog = useRef(null), titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    if (!open) return;
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    return () => {
      node.close(); document.body.style.overflow = overflow;
      if (previous?.isConnected && !previous.disabled && previous.getClientRects().length) previous.focus();
      else (document.querySelector('dialog[open] button:not(:disabled)') || document.getElementById("delivery-selected-control"))?.focus();
    };
  }, [open]);
  const containFocus = event => {
    if (event.key !== "Tab") return;
    const node = dialog.current;
    const choices = [...node.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, a[href], [tabindex="0"]')]
      .filter(element => element.getClientRects().length && element.tabIndex >= 0);
    const first = choices[0], last = choices.at(-1);
    if (!first) { event.preventDefault(); node.focus(); }
    else if (event.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  };
  return <dialog ref={dialog} aria-labelledby={titleId} aria-modal="true" onKeyDown={containFocus} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} className={`border border-white/15 bg-[#101416] p-0 text-white shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm ${centered ? "fixed inset-0 !m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg rounded-2xl" : "fixed inset-y-0 left-auto right-0 !m-0 h-dvh max-h-none w-full max-w-3xl rounded-l-2xl"}`}>
    <div className={`flex max-h-[inherit] flex-col ${centered ? "" : "h-full"}`}><header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 p-4"><h2 id={titleId} className="font-body text-lg font-semibold">{title}</h2><button type="button" disabled={busy} onClick={onClose} aria-label={`Close ${title}`} className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-white/10 disabled:opacity-40"><X size={20} /></button></header><div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">{children}</div></div>
  </dialog>;
}
