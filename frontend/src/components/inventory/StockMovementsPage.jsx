"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Download, RefreshCw, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fetchInventoryItems, fetchStockMovements } from "@/src/api/inventoryApi.js";
import { Badge, Button, DataTable, EmptyState, LoadingState, PageHeader, Pagination, StatCard, cardClass, inputClass } from "./InventoryUI.jsx";
import { apiErrorMessage, downloadCsv, formatDate, formatQuantity, humanize } from "./inventoryUtils.js";
import useInventoryResource from "./useInventoryResource.js";

const movementTypes = ["STOCK_IN", "STOCK_OUT", "ADJUSTMENT", "PURCHASE_RECEIPT", "INVENTORY_COUNT", "WASTE", "DAMAGED", "OPENING_BALANCE"];

const movementTone = (type) => {
  if (["STOCK_IN", "PURCHASE_RECEIPT", "OPENING_BALANCE"].includes(type)) return "success";
  if (["WASTE", "DAMAGED", "STOCK_OUT"].includes(type)) return "danger";
  return "info";
};

export default function StockMovementsPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [movementType, setMovementType] = useState("");
  const [item, setItem] = useState("");
  const [user, setUser] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);

  useEffect(() => {
    const timeout = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    fetchInventoryItems({ limit: 100, status: "all", sortBy: "name", sortOrder: "asc" })
      .then((response) => setItems(response.data))
      .catch(() => toast.error("Unable to load inventory items."));
  }, []);

  const { data, loading, error, reload } = useInventoryResource(
    () => fetchStockMovements({ page, limit: 25, search: debouncedSearch || undefined, movementType: movementType || undefined, item: item || undefined, user: user || undefined, from: from || undefined, to: to || undefined }),
    [page, debouncedSearch, movementType, item, user, from, to]
  );
  const clearFilters = () => { setSearch(""); setMovementType(""); setItem(""); setUser(""); setFrom(""); setTo(""); setPage(1); };
  const rows = data?.data || [];
  const columns = useMemo(() => [
    { key: "date", label: "Date & time", render: (row) => formatDate(row.occurredAt, true) },
    { key: "item", label: "Item", render: (row) => <div><p className="font-medium text-white">{row.item?.name || "Archived item"}</p><p className="text-[0.65rem] text-neutral-600">{row.item?.sku || "—"}</p></div> },
    { key: "type", label: "Movement", render: (row) => <Badge tone={movementTone(row.movementType)}>{humanize(row.movementType)}</Badge> },
    { key: "quantity", label: "Quantity", render: (row) => formatQuantity(row.quantity, row.item?.unit) },
    { key: "before", label: "Stock before", render: (row) => formatQuantity(row.stockBefore, row.item?.unit) },
    { key: "after", label: "Stock after", render: (row) => <span className={row.stockAfter < row.stockBefore ? "text-red-400" : "text-emerald-400"}>{formatQuantity(row.stockAfter, row.item?.unit)}</span> },
    { key: "reason", label: "Reason / notes", render: (row) => <div className="max-w-56 whitespace-normal"><p>{row.reason}</p>{row.notes && <p className="mt-0.5 line-clamp-1 text-[0.65rem] text-neutral-600">{row.notes}</p>}</div> },
    { key: "reference", label: "Reference", render: (row) => row.reference || row.purchaseOrder?.orderNumber || row.inventoryCount?.countNumber || "—" },
    { key: "user", label: "Performed by", render: (row) => <div><p>{row.user?.name || "—"}</p><p className="text-[0.65rem] capitalize text-neutral-600">{row.user?.role || ""}</p></div> },
    { key: "status", label: "Status", render: (row) => <Badge tone="success">{humanize(row.status || "COMPLETED")}</Badge> },
  ], []);

  const exportCsv = () => {
    if (!rows.length) return toast.error("There are no movements to export.");
    downloadCsv(`stock-movements-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Date", (row) => new Date(row.occurredAt).toISOString()], ["Item", (row) => row.item?.name], ["SKU", (row) => row.item?.sku],
      ["Movement", (row) => row.movementType], ["Quantity", (row) => row.quantity], ["Unit", (row) => row.item?.unit],
      ["Stock Before", (row) => row.stockBefore], ["Stock After", (row) => row.stockAfter], ["Reason", (row) => row.reason],
      ["Notes", (row) => row.notes], ["Reference", (row) => row.reference], ["Performed By", (row) => row.user?.name], ["Status", (row) => row.status || "COMPLETED"],
    ], rows);
  };
  const summary = data?.summary || {};

  return <div className="mx-auto max-w-[1800px]">
    <PageHeader title="Stock Movements" description="Track every inventory transaction, adjustment, purchase receipt and loss from one audit ledger." actions={<><Button variant="secondary" onClick={() => reload()}><RefreshCw className="h-4 w-4" />Refresh</Button><Button onClick={exportCsv}><Download className="h-4 w-4" />Export CSV</Button></>} />
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard label="Total Movements" value={summary.total || 0} caption="Matching current filters" icon={ArrowLeftRight} />
      <StatCard label="Stock In" value={summary.stockIn || 0} caption="Receipts and opening stock" icon={ArrowDownToLine} tone="green" />
      <StatCard label="Stock Out" value={summary.stockOut || 0} caption="Operational deductions" icon={ArrowUpFromLine} tone="red" />
      <StatCard label="Adjustments" value={summary.adjustments || 0} caption="Counts and corrections" icon={SlidersHorizontal} tone="blue" />
      <StatCard label="Waste / Damaged" value={summary.wasteDamaged || 0} caption="Recorded stock losses" icon={Trash2} tone="violet" />
    </div>
    <section className={cardClass}>
      <div className="grid gap-3 border-b border-white/10 p-4 md:grid-cols-2 xl:grid-cols-[1.4fr_repeat(3,1fr)_0.9fr_0.9fr_auto]">
        <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-neutral-600" /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item, SKU, reference, notes…" /></label>
        <select className={inputClass} value={movementType} onChange={(event) => { setMovementType(event.target.value); setPage(1); }}><option value="">All movement types</option>{movementTypes.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}</select>
        <select className={inputClass} value={item} onChange={(event) => { setItem(event.target.value); setPage(1); }}><option value="">All inventory items</option>{items.map((row) => <option key={row._id} value={row._id}>{row.name} · {row.sku}</option>)}</select>
        <select className={inputClass} value={user} onChange={(event) => { setUser(event.target.value); setPage(1); }}><option value="">All users</option>{(data?.filters?.users || []).map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</select>
        <input aria-label="From date" title="From date" type="date" className={inputClass} value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
        <input aria-label="To date" title="To date" type="date" className={inputClass} value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
        <Button variant="secondary" onClick={clearFilters}>Clear</Button>
      </div>
      {loading ? <LoadingState label="Loading stock movements…" /> : error ? <EmptyState title="Unable to load movements" description={apiErrorMessage(error)} action={<Button onClick={() => reload()}>Try again</Button>} /> : <DataTable columns={columns} rows={rows} empty={<EmptyState title="No stock movements found" description="Try changing the current filters." />} />}
      <Pagination pagination={data?.pagination} onPageChange={setPage} />
    </section>
  </div>;
}
