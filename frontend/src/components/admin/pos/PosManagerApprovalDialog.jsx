"use client";

import { LoaderCircle, LockKeyhole } from "lucide-react";
import { useEffect } from "react";

export default function PosManagerApprovalDialog({ open, pin, onPinChange, loading, onClose, onSubmit }) {
  useEffect(() => { if (!open) return undefined; const close = (event) => event.key === "Escape" && onClose(); document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [open, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[120] grid place-items-center bg-black/80 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111517] p-5"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-dune-amber/10 text-dune-amber"><LockKeyhole className="h-5 w-5" /></span><div><h2 className="font-semibold text-white">Manager approval</h2><p className="text-xs text-neutral-500">Scoped to this discount for five minutes.</p></div></div><label className="mt-5 block text-xs text-neutral-400">Manager/Admin PIN<input autoFocus type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => onPinChange(event.target.value.replace(/\D/g, "").slice(0, 6))} className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-center text-xl tracking-[0.4em] text-white outline-none focus:border-dune-amber" /></label><button disabled={loading || pin.length < 4} className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-dune-amber font-semibold text-black disabled:opacity-50">{loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : "Approve discount"}</button></form></div>;
}
