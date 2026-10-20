"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTableOrdering } from "@/src/context/TableOrderingContext.jsx";

export function TableContextNotice() {
  const { token, table, status, error, clearTable, selectTable } = useTableOrdering();
  if (!token) return null;
  return <aside lang="en" dir="ltr" className="rounded-xl border border-dune-amber/30 bg-dune-amber/5 p-4 text-sm text-neutral-300">
    {status === "loading" ? <p role="status">Checking table…</p> : error ? <p role="alert">{error} <button type="button" onClick={() => selectTable(token)} className="ml-2 text-dune-amber underline">Retry table</button></p> : <><p className="font-semibold text-dune-amber">Table {table?.code} · {table?.name}</p><p className="mt-1">Your order will be sent as dine-in to this table. Your cart items stay when you switch order type.</p></>}
    <button type="button" onClick={clearTable} className="mt-2 min-h-10 underline">Continue without a table</button>
  </aside>;
}
export default function TableOrderingBanner() {
  const token = useSearchParams().get("table"), seen = useRef(null);
  const { token: current, selectTable } = useTableOrdering();
  useEffect(() => {
    if (!token || seen.current === token) return;
    seen.current = token;
    if (current && current !== token && !window.confirm("Switch to the scanned table? Your cart items will be kept.")) return;
    selectTable(token);
  }, [token, current, selectTable]);
  return <TableContextNotice />;
}
