"use client";
import { POS_SHORTCUTS } from "@/src/utils/posShortcuts.js";
import usePosDialog from "@/src/hooks/usePosDialog.js";
export default function PosShortcutHelp({ onClose }) {
  const dialog = usePosDialog(true, onClose);
  return <div className="fixed inset-0 z-[120] grid place-items-center bg-black/80 p-4" onClick={onClose}><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="pos-shortcut-title" onClick={event => event.stopPropagation()} className="w-full max-w-md rounded-2xl border border-dune-amber/20 bg-[#101618] p-6"><div className="flex justify-between"><h2 id="pos-shortcut-title" className="text-xl font-semibold">Keyboard Shortcuts</h2><button onClick={onClose} aria-label="Close shortcut help">✕</button></div><div className="mt-4 space-y-3">{POS_SHORTCUTS.map(([keys, name]) => <div key={keys} className="flex justify-between text-sm"><span className="text-neutral-400">{name}</span><kbd className="text-dune-amber">{keys}</kbd></div>)}</div><p className="mt-5 text-xs text-neutral-500">Shortcuts pause while typing or when a dialog is open.</p></section></div>;
}
