"use client";
import { useEffect, useRef } from "react";
import { lockCustomerScroll } from "../utils/customerDialog.js";
export default function useCustomerDialog(open) {
  const dialog = useRef(null);
  useEffect(() => {
    if (!open) return;
    const node = dialog.current, previous = document.activeElement;
    const release = lockCustomerScroll(document.body);
    node.showModal();
    const trap = event => {
      if (event.key !== "Tab") return;
      const elements = [...node.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(element => element.getClientRects().length && element.tabIndex >= 0);
      const first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); node.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === node)) { event.preventDefault(); first.focus(); }
    };
    node.addEventListener("keydown", trap);
    return () => { node.removeEventListener("keydown", trap); node.close(); release(); if (previous?.isConnected && !previous.disabled && previous.getClientRects().length) previous.focus(); else document.querySelector("dialog[open] button:not(:disabled)")?.focus(); };
  }, [open]);
  return dialog;
}
