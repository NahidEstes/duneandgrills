"use client";
import ResourceStatus from "../../ui/ResourceStatus.jsx";
import TableTools, { useTablePreferences } from "../../ui/TableTools.jsx";
import useInventoryResource from "../../inventory/useInventoryResource.js";
import { DataTable } from "../../inventory/InventoryUI.jsx";
import RecordId from "@/src/components/ui/RecordId.jsx";

import DarkSelect from "../../ui/DarkSelect.jsx";
import { Eye, Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAdminCustomers } from "../../../api/api.js";
import SmartImage from "../../SmartImage.jsx";
import { formatAdminCurrency, formatAdminDate } from "../adminUi.js";
import CustomerDetailsDrawer from "./CustomerDetailsDrawer.jsx";
import { customerCardClass, customerInputClass, EmptySection, Pagination, SectionLoading } from "./customerUi.jsx";

export default function CustomersPage() {
  const table = useTablePreferences("admin-customers", 20);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activity, setActivity] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const columns = [
    { key: "customer", label: "Customer", className: "px-4 py-3", render: customer => <><div className="flex items-center gap-3">{customer.avatar ? <SmartImage src={customer.avatar} alt="" width={72} height={72} sizes="38px" className="h-10 w-10 rounded-full object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-full bg-dune-amber/10 font-semibold text-dune-amber">{customer.name?.charAt(0)?.toUpperCase()}</span>}<div><p className="font-medium text-white">{customer.name}</p><RecordId value={customer.customerNumber} /><p className="mt-0.5 text-xs text-neutral-600">Joined {formatAdminDate(customer.createdAt)}</p></div></div></> },
    { key: "contact", label: "Contact", className: "px-3 py-3", render: customer => <><p className="text-neutral-300">{customer.email}</p><p className="mt-0.5 text-xs text-neutral-600">{customer.phone || "No phone saved"}</p></> },
    { key: "orders", label: "Orders", className: "px-3 py-3", render: customer => <><p className="font-semibold text-white">{customer.totalOrders}</p><p className="text-xs text-neutral-600">{customer.validOrders} valid</p></> },
    { key: "spending", label: "Total spending", className: "px-3 py-3 font-semibold text-dune-amber", render: customer => <>{formatAdminCurrency(customer.totalSpent)}</> },
    { key: "lastOrder", label: "Last order", className: "px-3 py-3 text-xs text-neutral-400", render: customer => <>{customer.lastOrderAt ? formatAdminDate(customer.lastOrderAt, { hour: "2-digit", minute: "2-digit" }) : "No orders"}</> },
    { key: "points", label: "Points", className: "px-3 py-3 text-dune-amber", render: customer => <>{customer.pointsBalance || 0} pts</> },
    { key: "actions", label: "Action", className: "px-4 py-3 text-right", render: customer => <><button type="button" onClick={() => setSelected(customer)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-dune-amber/30 px-3 text-xs font-semibold text-dune-amber hover:bg-dune-amber/10"><Eye className="h-4 w-4" />View details</button></> },
  ];

  const { data: result, loading, error, lastSuccessAt, refreshing, reload } = useInventoryResource(() => fetchAdminCustomers({ search: debouncedQuery || undefined, activity, sort, page, limit: table.pageSize }), [activity, debouncedQuery, page, sort, refreshKey, table.pageSize]);
  const payload = result || { data: [], pagination: {} };

  return (
    <div className="space-y-4"><ResourceStatus lastSuccessAt={lastSuccessAt} refreshing={refreshing} loading={loading} error={error} hasData={Boolean(result)} onRetry={() => reload({ silent: true })} /><TableTools preferences={table} columns={columns} filters={{ query, activity, sort }} onApplyFilters={value => { setQuery(value.query); setActivity(value.activity); setSort(value.sort); setPage(1); }} onPageSizeChange={size => { table.update(value => ({ ...value, pageSize: size })); setPage(1); }} />
      <section className={`${customerCardClass} flex flex-col gap-3 p-4 lg:flex-row lg:items-center`}>
        <div className="relative min-w-0 flex-1 lg:max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer ID, name, email or phone…" className={`${customerInputClass} w-full pl-9`} /></div>
        <DarkSelect value={activity} onChange={(event) => { setActivity(event.target.value); setPage(1); }} className={customerInputClass}><option value="all">All customers</option><option value="with-orders">With orders</option><option value="no-orders">No orders yet</option></DarkSelect>
        <DarkSelect value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} className={customerInputClass}><option value="newest">Newest accounts</option><option value="recent">Most recent order</option><option value="spending">Highest spending</option><option value="orders">Most orders</option><option value="name">Name A–Z</option></DarkSelect>
        <span className="inline-flex items-center gap-2 text-xs text-neutral-600"><Users className="h-4 w-4 text-dune-amber" />{payload.pagination.total || 0} customers</span>
      </section>

      <section className={`${customerCardClass} overflow-hidden`}>
        {loading ? <SectionLoading label="Loading customer directory…" /> : error && !result ? null : payload.data.length ? <DataTable columns={table.visibleColumns(columns)} rows={payload.data} /> : <EmptySection>No customers match the current search and filters.</EmptySection>}
        {!loading && <Pagination pagination={payload.pagination} onPage={setPage} />}
      </section>

      {selected && <CustomerDetailsDrawer customer={selected} onClose={() => setSelected(null)} onCustomerChanged={() => setRefreshKey((value) => value + 1)} />}
    </div>
  );
}
