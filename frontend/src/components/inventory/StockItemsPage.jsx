"use client";
import RecordId from "@/src/components/ui/RecordId.jsx";

import DarkSelect from "@/src/components/ui/DarkSelect.jsx";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ArrowDownToLine, ArrowUpFromLine, Pencil, Plus, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  archiveInventoryItem, createInventoryItem, fetchInventoryCategories, fetchInventoryItem, fetchInventoryItems,
  fetchSuppliers, updateInventoryItem,
} from "@/src/api/inventoryApi.js";
import { Badge, Button, DataTable, EmptyState, LoadingState, Modal, Money, PageHeader, Pagination, cardClass, inputClass } from "./InventoryUI.jsx";
import StockItemForm from "./StockItemForm.jsx";
import { apiErrorMessage, formatDate, formatQuantity, getStockStatus } from "./inventoryUtils.js";
import useInventoryResource from "./useInventoryResource.js";
import { initialInventoryStatus, inventoryHealthOptions, inventoryHealthReasonLabels } from "./inventoryHealthFilters.js";

function StockHealthStatus({ item }) {
  let status = getStockStatus(item);
  if (item.isActive !== false && item.stockHealth) {
    if (item.stockHealth.out) status = { tone: "danger", label: "Out of saleable stock" };
    else if (item.stockHealth.low) status = { tone: "warning", label: "Low saleable stock" };
    else status = { tone: "success", label: "Saleable stock available" };
  }
  const reasons = item.blockedReasons?.map(reason => inventoryHealthReasonLabels[reason] || reason) || [];
  const expiringDates = [...new Set(item.expiringDates?.map(date => formatDate(date)) || [])];
  return <div className="max-w-52 whitespace-normal">
    <Badge tone={status.tone}>{status.label}</Badge>
    {reasons.length > 0 && <p className="mt-1 text-xs text-amber-400">{reasons.join(" · ")}</p>}
    {expiringDates.length > 0 && <p className="mt-1 text-xs text-neutral-400">Expiring: {expiringDates.join(", ")}</p>}
  </div>;
}

export default function StockItemsPage({ initialStatus = "" }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [status, setStatus] = useState(() => initialInventoryStatus(initialStatus));
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [metadata, setMetadata] = useState({ categories: [], suppliers: [] });

  useEffect(() => { const timeout = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 250); return () => clearTimeout(timeout); }, [search]);
  useEffect(() => { Promise.all([fetchInventoryCategories(), fetchSuppliers()]).then(([categories, suppliers]) => setMetadata({ categories, suppliers })).catch(() => toast.error("Unable to load categories and suppliers.")); }, []);
  useEffect(() => { if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("action") === "add") setModalOpen(true); }, []);
  useEffect(() => { const id = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("edit") : null; if (id) fetchInventoryItem(id).then((row) => { setEditing(row); setModalOpen(true); }).catch(() => toast.error("The linked stock item could not be loaded.")); }, []);

  const { data, loading, reload } = useInventoryResource(
    () => fetchInventoryItems({ page, limit: 20, search: debouncedSearch || undefined, category: category || undefined, supplier: supplier || undefined, status: status || undefined, sortBy, sortOrder }),
    [page, debouncedSearch, category, supplier, status, sortBy, sortOrder]
  );

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const submit = async (payload) => {
    setSubmitting(true);
    try {
      if (editing) await updateInventoryItem(editing._id, payload); else await createInventoryItem(payload);
      toast.success(editing ? "Inventory item updated." : "Inventory item created with an audited opening balance.");
      setModalOpen(false); setEditing(null); await reload({ silent: true });
    } catch (error) { toast.error(apiErrorMessage(error, "Unable to save inventory item.")); }
    finally { setSubmitting(false); }
  };
  const archive = async (item) => {
    if (!window.confirm(`Archive ${item.name}? Its transaction history will be preserved.`)) return;
    try { await archiveInventoryItem(item._id); toast.success("Inventory item archived."); reload({ silent: true }); }
    catch (error) { toast.error(apiErrorMessage(error, "Unable to archive item.")); }
  };
  const columns = [
    { key: "name", label: "Item", render: (item) => <div><p className="font-medium text-white">{item.name}</p><p className="mt-0.5 text-[0.65rem] text-neutral-600"><RecordId value={item.sku} /></p></div> },
    { key: "category", label: "Category", render: (item) => item.category?.name || "—" },
    { key: "brand", label: "Preferred brand", render: (item) => item.preferredBrand || "—" },
    { key: "unit", label: "Usage unit" },
    { key: "purchaseUnit", label: "Purchase conversion", render: (item) => <div><p>{item.purchaseUnit || item.unit}</p><p className="text-[0.65rem] text-neutral-600">1 {item.purchaseUnit || item.unit} = {item.purchaseConversionFactor || 1} {item.unit}</p></div> },
    { key: "stock", label: "Physical / saleable stock", render: (item) => <div className="tabular-nums"><p>Physical: {formatQuantity(item.currentStock, item.unit)}</p><p className="mt-1 text-xs text-dune-amber">Saleable: {formatQuantity(item.saleableStock, item.unit)}</p></div> },
    { key: "reorder", label: "Reorder level", render: (item) => formatQuantity(item.reorderLevel, item.unit) },
    { key: "cost", label: "Unit cost", render: (item) => <Money value={item.unitCost} /> },
    { key: "supplier", label: "Supplier", render: (item) => item.supplier?.name || "—" },
    { key: "updated", label: "Updated", render: (item) => formatDate(item.updatedAt, true) },
    { key: "status", label: "Status", render: (item) => <StockHealthStatus item={item} /> },
    { key: "actions", label: "", render: (item) => <div className="flex justify-end gap-1"><button type="button" onClick={() => { setEditing(item); setModalOpen(true); }} className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white" aria-label={`Edit ${item.name}`}><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => archive(item)} className="rounded-lg p-2 text-neutral-500 hover:bg-red-500/10 hover:text-red-300" aria-label={`Archive ${item.name}`}><Archive className="h-4 w-4" /></button></div> },
  ];

  return <div className="mx-auto max-w-[1680px]">
    <PageHeader title="Stock Items" description="Create and maintain inventory items. Quantity changes are recorded separately as stock movements." actions={<><Link href="/inventory/stock-in"><Button variant="secondary"><ArrowDownToLine className="h-4 w-4" />Stock in</Button></Link><Link href="/inventory/stock-out"><Button variant="secondary"><ArrowUpFromLine className="h-4 w-4" />Stock out</Button></Link><Button onClick={openCreate}><Plus className="h-4 w-4" />Add item</Button></>} />
    <section className={cardClass}>
      <div className="grid gap-3 border-b border-white/10 p-4 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.4fr)_1fr_1fr_0.8fr_0.9fr]">
        <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-neutral-600" /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by item, SKU, brand or location…" /></label>
        <DarkSelect className={inputClass} value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="">All categories</option>{metadata.categories.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</DarkSelect>
        <DarkSelect className={inputClass} value={supplier} onChange={(event) => { setSupplier(event.target.value); setPage(1); }}><option value="">All suppliers</option>{metadata.suppliers.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</DarkSelect>
        <DarkSelect className={inputClass} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Active items</option>{inventoryHealthOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="inactive">Inactive</option></DarkSelect>
        <div className="flex gap-2"><DarkSelect className={inputClass} value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="updatedAt">Recently updated</option><option value="name">Name</option><option value="currentStock">Stock</option><option value="unitCost">Unit cost</option></DarkSelect><button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-neutral-500 hover:text-white" onClick={() => setSortOrder((value) => value === "asc" ? "desc" : "asc")} aria-label="Toggle sort direction"><SlidersHorizontal className="h-4 w-4" /></button></div>
      </div>
      {loading ? <LoadingState /> : <DataTable columns={columns} rows={data?.data} empty={<EmptyState title="No stock items found" description="Add an item or change the current filters." action={<Button onClick={openCreate}><Plus className="h-4 w-4" />Add first item</Button>} />} />}
      <Pagination pagination={data?.pagination} onPageChange={setPage} />
    </section>
    <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditing(null); }} title={editing ? `Edit ${editing.name}` : "Add stock item"} description="Stable SKUs and timestamps keep every record ready for future integrations." maxWidth="max-w-3xl"><StockItemForm item={editing} categories={metadata.categories} suppliers={metadata.suppliers} onSubmit={submit} submitting={submitting} /></Modal>
  </div>;
}
