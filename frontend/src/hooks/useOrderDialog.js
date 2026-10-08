"use client";
import { useEffect, useRef } from "react";

export function useOrderDialog(onClose) {
  const dialog = useRef(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    const node = dialog.current;
    node?.focus();
    const keydown = event => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") { event.preventDefault(); close.current?.(); }
      if (event.key !== "Tab") return;
      const elements = Array.from(node?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter(el => el.getClientRects().length);
      const first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); node?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === node)) { event.preventDefault(); first.focus(); }
    };
    node?.addEventListener("keydown", keydown);
    return () => { node?.removeEventListener("keydown", keydown); if (previous?.isConnected) previous.focus(); };
  }, []);
  return dialog;
}
