"use client";

import { useEffect, useRef } from "react";

// Keep keyboard focus inside POS overlays without changing their sale state.
export default function usePosDialog(open, onClose) {
  const element = useRef(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open || !element.current) return;
    const dialog = element.current;
    const previous = document.activeElement;
    const controls = () => [...dialog.querySelectorAll('button, input, textarea, select, [tabindex="0"]')]
      .filter(node => !node.disabled && node.getClientRects().length);
    (controls()[0] || dialog).focus();
    const handleKey = event => {
      // Let the existing shared select dismiss its own portal first.
      if (event.key === "Escape" && event.target.closest?.('[role="combobox"][aria-expanded="true"]')) return;
      if (event.key === "Escape") { event.preventDefault(); close.current?.(); }
      if (event.key !== "Tab") return;
      const nodes = controls();
      if (!nodes.length) { event.preventDefault(); dialog.focus(); return; }
      const first = nodes[0]; const last = nodes.at(-1);
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    dialog.addEventListener("keydown", handleKey);
    return () => { dialog.removeEventListener("keydown", handleKey); if (previous?.isConnected) previous.focus(); };
  }, [open]);
  return element;
}
