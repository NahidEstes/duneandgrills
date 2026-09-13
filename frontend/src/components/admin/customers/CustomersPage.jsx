"use client";

import DarkSelect from "../../ui/DarkSelect.jsx";
import { Eye, Search, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fetchAdminCustomers } from "../../../api/api.js";
import SmartImage from "../../SmartImage.jsx";
import { formatAdminCurrency, formatAdminDate } from "../adminUi.js";
import CustomerDetailsDrawer from "./CustomerDetailsDrawer.jsx";
import { customerCardClass, customerInputClass, EmptySection, Pagination, SectionLoading } from "./customerUi.jsx";

export default function CustomersPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activity, setActivity] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState({ data: [], pagination: {} });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPayload(await fetchAdminCustomers({ search: debouncedQuery || undefined, activity, sort, page, limit: 20 }));
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load customers.");
    } finally {
      setLoading(false);
    }
  }, [activity, debouncedQuery, page, sort]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className="space-y-4">
      <section className={`${customerCardClass} flex flex-col gap-3 p-4 lg:flex-row lg:items-center`}>
        <div className="relative min-w-0 flex-1 lg:max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or phone…" className={`${customerInputClass} w-full pl-9`} /></div>
        <DarkSelect value={activity} onChange={(event) => { setActivity(event.target.value); setPage(1); }} className={customerInputClass}><option value="all">All customers</option><option value="with-orders">With orders</option><option value="no-orders">No orders yet</option></DarkSelect>
        <DarkSelect value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} className={customerInputClass}><option value="newest">Newest accounts</option><option value="recent">Most recent order</option><option value="spending">Highest spending</option><option value="orders">Most orders</option><option value="name">Name A–Z</option></DarkSelect>
        <span className="inline-flex items-center gap-2 text-xs text-neutral-600"><Users className="h-4 w-4 text-dune-amber" />{payload.pagination.total || 0} customers</span>
      </section>

      <section className={`${customerCardClass} overflow-hidden`}>
        {loading ? <SectionLoading label="Loading customer directory…" /> : payload.data.length ? <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="border-b border-white/[0.07] text-xs text-neutral-600"><tr><th className="px-4 py-3 font-medium">Customer</th><th className="px-3 py-3 font-medium">Contact</th><th className="px-3 py-3 font-medium">Orders</th><th className="px-3 py-3 font-medium">Total spending</th><th className="px-3 py-3 font-medium">Last order</th><th className="px-3 py-3 font-medium">Points</th><th className="px-4 py-3 text-right font-medium">Action</th></tr></thead><tbody className="divide-y divide-white/[0.055]">{payload.data.map((customer) => <tr key={customer._id} className="hover:bg-white/[0.025]"><td className="px-4 py-3"><div className="flex items-center gap-3">{customer.avatar ? <SmartImage src={customer.avatar} alt="" width={72} height={72} sizes="38px" className="h-10 w-10 rounded-full object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-full bg-dune-amber/10 font-semibold text-dune-amber">{customer.name?.charAt(0)?.toUpperCase()}</span>}<div><p className="font-medium text-white">{customer.name}</p><p className="mt-0.5 text-xs text-neutral-600">Joined {formatAdminDate(customer.createdAt)}</p></div></div></td><td className="px-3 py-3"><p className="text-neutral-300">{customer.email}</p><p className="mt-0.5 text-xs text-neutral-600">{customer.phone || "No phone saved"}</p></td><td className="px-3 py-3"><p className="font-semibold text-white">{customer.totalOrders}</p><p className="text-xs text-neutral-600">{customer.validOrders} valid</p></td><td className="px-3 py-3 font-semibold text-dune-amber">{formatAdminCurrency(customer.totalSpent)}</td><td className="px-3 py-3 text-xs text-neutral-400">{customer.lastOrderAt ? formatAdminDate(customer.lastOrderAt, { hour: "2-digit", minute: "2-digit" }) : "No orders"}</td><td className="px-3 py-3 text-dune-amber">{customer.pointsBalance || 0} pts</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => setSelected(customer)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-dune-amber/30 px-3 text-xs font-semibold text-dune-amber hover:bg-dune-amber/10"><Eye className="h-4 w-4" />View details</button></td></tr>)}</tbody></table></div> : <EmptySection>No customers match the current search and filters.</EmptySection>}
        {!loading && <Pagination pagination={payload.pagination} onPage={setPage} />}
      </section>

      {selected && <CustomerDetailsDrawer customer={selected} onClose={() => setSelected(null)} onCustomerChanged={() => setRefreshKey((value) => value + 1)} />}
    </div>
  );
}
