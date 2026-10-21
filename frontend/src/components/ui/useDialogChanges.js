"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";

export const DialogCloseContext = createContext(null);
export const useDialogClose = fallback => useContext(DialogCloseContext) || fallback;

// Only compare in-memory control values. Drafts, credentials and payment details are never stored.
export function readDialogForm(root) {
  return JSON.stringify(Array.from(root?.querySelectorAll('form input, form textarea, form select, form [role=combobox], form button[aria-haspopup="dialog"]') || [])
    .filter(control => !["submit", "button"].includes(control.type) || control.getAttribute("role") === "combobox" || control.getAttribute("aria-haspopup") === "dialog")
    .map(control => control.tagName === "BUTTON" ? control.getAttribute("data-form-value") ?? control.textContent
      : [control.type, control.type === "checkbox" || control.type === "radio" ? control.checked : control.value]));
}

export default function useDialogChanges({ open, rootRef, onClose, resetKey, escape = false }) {
  const baseline = useRef(null), touched = useRef(false), closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const isDirty = useCallback(() => touched.current && baseline.current !== readDialogForm(rootRef.current), [rootRef]);
  const isBusy = useCallback(() => Boolean(rootRef.current?.querySelector('form[aria-busy="true"]')), [rootRef]);
  const confirmDiscard = useCallback(() => {
    if (isBusy()) return false;
    if (isDirty() && !window.confirm("Discard unsaved changes? Your changes have not been saved.")) return false;
    return true;
  }, [isBusy, isDirty]);
  const requestClose = useCallback(() => {
    if (!confirmDiscard()) return false;
    closeRef.current?.();
    return true;
  }, [confirmDiscard]);
  useEffect(() => {
    if (!open || !escape) return undefined;
    const closeOnEscape = event => { const nested = event.target.closest?.('[role="dialog"]'); if (nested && nested !== rootRef.current) return; if (event.key === "Escape" && !event.defaultPrevented) requestClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, escape, requestClose, rootRef]);
  useEffect(() => {
    if (!open) return undefined;
    touched.current = false;
    baseline.current = readDialogForm(rootRef.current);
    const frame = requestAnimationFrame(() => { if (!touched.current) baseline.current = readDialogForm(rootRef.current); });
    const beforeUnload = event => { if (isDirty() || isBusy()) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("beforeunload", beforeUnload); };
  }, [open, resetKey, rootRef, isDirty, isBusy]);
  const beforeEdit = useCallback(event => {
    if (!event.target.closest?.("form")) return;
    if (!touched.current) baseline.current = readDialogForm(rootRef.current);
    touched.current = true;
  }, [rootRef]);
  const afterEdit = useCallback(() => { touched.current = true; }, []);
  return { requestClose, confirmDiscard, capture: { onPointerDownCapture: beforeEdit, onKeyDownCapture: beforeEdit, onBeforeInputCapture: beforeEdit, onInputCapture: afterEdit, onChangeCapture: afterEdit } };
}

export function usePageFormChanges(options) {
  const guard = useDialogChanges(options);
  const { confirmDiscard } = guard;
  useEffect(() => {
    if (!options.open) return undefined;
    const navigate = event => {
      const anchor = event.target.closest?.("a[href]");
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.getAttribute("href").startsWith("#")) return;
      if (!confirmDiscard()) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener("click", navigate, true);
    return () => document.removeEventListener("click", navigate, true);
  }, [options.open, confirmDiscard]);
  return guard;
}
