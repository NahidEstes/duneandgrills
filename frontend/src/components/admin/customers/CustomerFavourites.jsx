"use client";

import { Heart, PackageOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchAdminCustomerFavourites } from "../../../api/api.js";
import { formatAdminCurrency, formatAdminDate, labelStatus } from "../adminUi.js";
import { customerCardClass, EmptySection, SectionLoading } from "./customerUi.jsx";

export default function CustomerFavourites({ customerId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchAdminCustomerFavourites(customerId)
      .then((data) => active && setRows(data))
      .catch((error) => active && toast.error(error.response?.data?.message || "Unable to load favourite items."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [customerId]);

  if (loading) return <SectionLoading label="Calculating favourite items…" />;
  if (!rows.length) return <EmptySection>This customer has no valid order history to calculate favourites from.</EmptySection>;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((row, index) => (
        <article key={`${row.productType}-${row.product || row.name}`} className={`${customerCardClass} p-4`}>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-dune-amber/10 text-dune-amber">{index < 3 ? <Heart className="h-4 w-4 fill-current" /> : <PackageOpen className="h-4 w-4" />}</span>
            <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-white">{row.name}</h3><p className="mt-0.5 text-xs text-neutral-600">{labelStatus(row.productType)} · Last bought {formatAdminDate(row.lastPurchasedAt)}</p></div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-3 text-xs">
            <div><p className="text-neutral-600">Quantity</p><p className="mt-1 font-semibold text-white">{row.totalQuantity}</p></div>
            <div><p className="text-neutral-600">Orders</p><p className="mt-1 font-semibold text-white">{row.orderCount}</p></div>
            <div><p className="text-neutral-600">Item spend</p><p className="mt-1 font-semibold text-dune-amber">{formatAdminCurrency(row.totalSpending)}</p></div>
          </div>
        </article>
      ))}
    </div>
  );
}
