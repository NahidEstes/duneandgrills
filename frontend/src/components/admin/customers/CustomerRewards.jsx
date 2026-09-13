"use client";

import DarkSelect from "../../ui/DarkSelect.jsx";
import { Award, RotateCcw, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchAdminCustomerRewards } from "../../../api/api.js";
import { formatAdminDate, labelStatus } from "../adminUi.js";
import { customerCardClass, customerInputClass, EmptySection, Pagination, SectionLoading, StatusPill } from "./customerUi.jsx";

const TYPE_ICON = { EARN: Award, REDEEM: ShoppingBag, REVERSAL: RotateCcw };

export default function CustomerRewards({ customerId }) {
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState({ data: [], pagination: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchAdminCustomerRewards(customerId, { type, page, limit: 15 })
      .then((data) => active && setPayload(data))
      .catch((error) => active && toast.error(error.response?.data?.message || "Unable to load reward history."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [customerId, page, type]);

  return (
    <section className={customerCardClass}>
      <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="text-sm font-semibold text-white">Reward transactions</h3><p className="mt-1 text-xs text-neutral-600">Existing points ledger—no separate CRM balance.</p></div>
        <DarkSelect value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className={`${customerInputClass} min-w-44`}><option value="all">All transactions</option><option value="EARN">Points earned</option><option value="REDEEM">Points redeemed</option><option value="REVERSAL">Reversals</option></DarkSelect>
      </div>
      {loading ? <SectionLoading /> : payload.data.length ? <div className="divide-y divide-white/[0.06]">{payload.data.map((row) => {
        const Icon = TYPE_ICON[row.type] || Award;
        return <article key={row._id} className="grid gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center"><span className="grid h-9 w-9 place-items-center rounded-xl bg-dune-amber/10 text-dune-amber"><Icon className="h-4 w-4" /></span><div><p className="text-sm text-white">{row.description}</p><p className="mt-1 text-xs text-neutral-600">{row.order?.orderNumber ? `Order #${row.order.orderNumber} · ` : ""}{formatAdminDate(row.createdAt, { hour: "2-digit", minute: "2-digit" })}</p></div><StatusPill value={row.type.toLowerCase()} /><div className="text-right"><p className={`font-semibold ${Number(row.points) >= 0 ? "text-emerald-400" : "text-red-300"}`}>{Number(row.points) > 0 ? "+" : ""}{row.points} pts</p><p className="text-xs text-neutral-600">Balance {row.balanceAfter}</p></div></article>;
      })}</div> : <EmptySection>No reward transactions found.</EmptySection>}
      {!loading && <Pagination pagination={payload.pagination} onPage={setPage} />}
    </section>
  );
}
