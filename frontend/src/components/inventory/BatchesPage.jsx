"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes, CalendarClock, CircleDollarSign, PackageCheck, Search } from "lucide-react";
import { fetchInventoryBatches, fetchInventoryItems, fetchSuppliers } from "@/src/api/inventoryApi.js";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import {
  Badge,
  DataTable,
  EmptyState,
  LoadingState,
  Money,
  PageHeader,
  Pagination,
  StatCard,
  cardClass,
  inputClass,
} from "./InventoryUI.jsx";
import { apiErrorMessage, daysUntil, formatDate, formatQuantity, humanize } from "./inventoryUtils.js";
import useInventoryResource from "./useInventoryResource.js";

const batchStatus = (batch) => {
  if (Number(batch.remainingQuantity) <= 0) return { label: "Depleted", tone: "neutral" };
  if (!batch.expiryDate) return { label: "Active", tone: "success" };
  const days = daysUntil(batch.expiryDate);
  if (days < 0) return { label: "Expired", tone: "danger" };
  if (days <= 7) return { label: `${days}d left`, tone: "warning" };
  return { label: "Active", tone: "success" };
};

export default function BatchesPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [item, setItem] = useState("");
  const [supplier, setSupplier] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    Promise.all([
      fetchInventoryItems({ limit: 100, status: "all", sortBy: "name", sortOrder: "asc" }),
      fetchSuppliers(),
    ])
      .then(([itemResponse, supplierRows]) => { setItems(itemResponse.data); setSuppliers(supplierRows); })
      .catch(() => undefined);
  }, []);

  const { data, loading, error } = useInventoryResource(
    () => fetchInventoryBatches({
      page,
      limit: 25,
      search: debouncedSearch || undefined,
      status,
      item: item || undefined,
      supplier: supplier || undefined,
    }),
    [page, debouncedSearch, status, item, supplier]
  );

  const columns = useMemo(() => [
    { key: "item", label: "Inventory item", render: (batch) => <div><p className="font-medium text-white">{batch.item?.name || "Archived item"}</p><p className="text-[0.65rem] text-neutral-600">{batch.item?.sku || "—"}</p></div> },
    { key: "lot", label: "Batch / Lot", render: (batch) => <div><p className="font-medium text-dune-amberLight">{batch.lotNumber}</p>{batch.isLegacy && <p className="text-[0.62rem] text-neutral-600">Preserved existing stock</p>}</div> },
    { key: "received", label: "Received", render: (batch) => <div><p>{formatQuantity(batch.receivedQuantity, batch.item?.unit)}</p><p className="text-[0.65rem] text-neutral-600">{formatDate(batch.receivedAt)}</p></div> },
    { key: "remaining", label: "Remaining", render: (batch) => <span className="font-semibold text-white">{formatQuantity(batch.remainingQuantity, batch.item?.unit)}</span> },
    { key: "purchase", label: "Purchase conversion", render: (batch) => <div><p>{formatQuantity(batch.purchaseQuantity, batch.purchaseUnit)}</p><p className="text-[0.65rem] text-neutral-600">1 {batch.purchaseUnit} = {batch.conversionFactor} {batch.item?.unit}</p></div> },
    { key: "expiry", label: "Expiry", render: (batch) => formatDate(batch.expiryDate) },
    { key: "cost", label: "Base unit cost", render: (batch) => <Money value={batch.unitCost} /> },
    { key: "supplier", label: "Supplier / reference", render: (batch) => <div><p>{batch.supplier?.name || "—"}</p><p className="text-[0.65rem] text-neutral-600">{batch.purchaseOrder?.orderNumber || humanize(batch.source)}</p></div> },
    { key: "status", label: "Status", render: (batch) => { const current = batchStatus(batch); return <Badge tone={current.tone}>{current.label}</Badge>; } },
  ], []);
  const summary = data?.summary || {};

  return (
    <div className="mx-auto max-w-[1800px]">
      <PageHeader
        eyebrow="FEFO Inventory"
        title="Batches / Lots"
        description="Track received quantities, remaining balances, supplier lots, expiry dates and base-unit costs. Outbound stock is consumed by earliest expiry first."
      />
      <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Active Batches" value={summary.active || 0} caption="With stock remaining" icon={PackageCheck} tone="green" />
        <StatCard label="Expiring Soon" value={summary.expiring || 0} caption="Within seven days" icon={CalendarClock} tone="amber" />
        <StatCard label="Expired" value={summary.expired || 0} caption="Requires action" icon={Boxes} tone="red" />
        <StatCard label="Depleted" value={summary.depleted || 0} caption="Visible with filter" icon={Boxes} />
        <StatCard label="Batch Stock Value" value={<Money value={summary.stockValue} />} caption="Current filtered value" icon={CircleDollarSign} tone="green" />
      </section>
      <section className={cardClass}>
        <div className="grid gap-3 border-b border-white/10 p-4 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.4fr)_1fr_1fr_1fr]">
          <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-neutral-600" /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item, SKU or lot number…" /></label>
          <DarkSelect className={inputClass} value={item} onChange={(event) => { setItem(event.target.value); setPage(1); }}><option value="">All inventory items</option>{items.map((row) => <option key={row._id} value={row._id}>{row.name} · {row.sku}</option>)}</DarkSelect>
          <DarkSelect className={inputClass} value={supplier} onChange={(event) => { setSupplier(event.target.value); setPage(1); }}><option value="">All suppliers</option>{suppliers.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</DarkSelect>
          <DarkSelect className={inputClass} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="active">Active batches</option><option value="expiring">Expiring soon</option><option value="expired">Expired</option><option value="depleted">Depleted</option><option value="all">All batches</option></DarkSelect>
        </div>
        {loading ? <LoadingState label="Loading batches…" /> : error ? <EmptyState title="Unable to load batches" description={apiErrorMessage(error)} /> : <DataTable columns={columns} rows={data?.data || []} empty={<EmptyState title="No batches found" description="Receive stock or change the current filters." />} />}
        <Pagination pagination={data?.pagination} onPageChange={setPage} />
      </section>
    </div>
  );
}
