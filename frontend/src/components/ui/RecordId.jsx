"use client";
import { Copy } from "lucide-react";
import { toast } from "sonner";

export default function RecordId({ value, className = "" }) {
  if (!value) return <span className="text-neutral-500">—</span>;
  const copy = async event => {
    event.stopPropagation();
    try { await navigator.clipboard.writeText(String(value)); toast.success("ID copied"); }
    catch { toast.error("Copy unavailable. Select and copy the ID manually."); }
  };
  return <span className={`inline-flex max-w-full items-center gap-1.5 ${className}`}><span className="select-text break-all font-mono">{value}</span><button type="button" onClick={copy} aria-label={`Copy ID ${value}`} title="Copy ID" className="shrink-0 rounded p-1 text-neutral-500 hover:text-dune-amber focus-visible:outline focus-visible:outline-amber-500"><Copy className="h-3.5 w-3.5" /></button></span>;
}
