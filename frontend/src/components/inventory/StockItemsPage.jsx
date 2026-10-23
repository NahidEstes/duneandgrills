"use client";
import TableTools, { useTablePreferences } from "../ui/TableTools.jsx";
import ResourceStatus from "../ui/ResourceStatus.jsx";
import RecordId from "@/src/components/ui/RecordId.jsx";

import DarkSelect from "@/src/components/ui/DarkSelect.jsx";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, ArrowDownToLine, ArrowUpFromLine, Plus, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  archiveInventoryItem, createInventoryItem, fetchInventoryCategories, fetchInventoryItem, fetchInventoryItems,
  fetchSuppliers, updateInventoryItem,
} from "@/src/api/inventoryApi.js";
import { Badge, Button, DataTable, EmptyState, LoadingState, Modal, Money, PageHeader, Pagination, cardClass, inputClass } from "./InventoryUI.jsx";
import StockItemForm from "./StockItemForm.jsx";
import StockItemDrawer from "./StockItemDrawer.jsx";
import StockItemActions from "./StockItemActions.jsx";
import { useAuth } from "@/src/context/AuthContext.jsx";
import { INVENTORY_ROLES } from "./inventoryAccess.js";
import { preparationQuantityLabel as quantity } from "@/src/utils/preparationUnits.js";
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

export default function StockItemsPage({ initialStatus = "", initialItem = "" }) {
  const { user } = useAuth();
  const canWrite = INVENTORY_ROLES.includes(user?.role);
  const [detailId, setDetailId] = useState(initialItem || null), [detailRevision, setDetailRevision] = useState(0);
  const table = useTablePreferences("inventory-stock-items", 20);
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

  const { data, loading, reload, error, lastSuccessAt, refreshing } = useInventoryResource(
    () => fetchInventoryItems({ page, limit: table.pageSize, search: debouncedSearch || undefined, category: category || undefined, supplier: supplier || undefined, status: status || undefined, sortBy, sortOrder }),
    [page, debouncedSearch, category, supplier, status, sortBy, sortOrder, table.pageSize]
  );

  const openCreate = () => { if (!canWrite) return; setEditing(null); setModalOpen(true); };
  const closeForm = () => { if (!submitting) { setModalOpen(false); setEditing(null); } };
  const submit = async (payload) => {
    setSubmitting(true);
    try {
      if (editing) await updateInventoryItem(editing._id, payload); else await createInventoryItem(payload);
      toast.success(editing ? "Inventory item updated." : "Inventory item created with an audited opening balance.");
      setModalOpen(false); setEditing(null); setDetailRevision(value => value + 1); await reload({ silent: true });
    } catch (error) { toast.error(apiErrorMessage(error, "Unable to save inventory item.")); }
    finally { setSubmitting(false); }
  };
  const archive = async (item) => {
    if (!canWrite) return;
    if (!window.confirm(`Archive ${item.name}? Its transaction history will be preserved.`)) return;
    try { await archiveInventoryItem(item._id); toast.success("Inventory item archived."); reload({ silent: true }); }
    catch (error) { toast.error(apiErrorMessage(error, "Unable to archive item.")); }
  };
  const columns = [
    { key: "name", label: "Item", render: (item) => <div><button type="button" onClick={() => setDetailId(item._id)} className="min-h-11 text-left font-medium text-white underline decoration-white/20 underline-offset-4 hover:text-dune-amber">{item.name}</button><p className="mt-0.5 text-[0.65rem] text-neutral-400"><RecordId value={item.sku} /></p></div> },
    { key: "category", label: "Category", render: (item) => item.category?.name || "—" },
    { key: "brand", label: "Preferred brand", render: (item) => item.preferredBrand || "—" },
    { key: "unit", label: "Usage unit" },
    { key: "purchaseUnit", label: "Purchase conversion", render: (item) => <div><p>{item.purchaseUnit || item.unit}</p><p className="text-[0.65rem] text-neutral-400">1 {item.purchaseUnit || item.unit} = {item.purchaseConversionFactor || 1} {item.unit}</p></div> },
    { key: "stock", label: "Physical / saleable stock", render: (item) => <div className="tabular-nums"><p>Physical: {formatQuantity(item.currentStock, item.unit)}</p><p className="mt-1 text-xs text-dune-amber">Saleable: {formatQuantity(item.saleableStock, item.unit)}</p></div> },
    { key: "reorder", label: "Reorder level", render: (item) => formatQuantity(item.reorderLevel, item.unit) },
    { key: "cost", label: "Unit cost", render: (item) => <Money value={item.unitCost} /> },
    { key: "supplier", label: "Supplier", render: (item) => item.supplier?.name || "—" },
    { key: "updated", label: "Updated", render: (item) => formatDate(item.updatedAt, true) },
    { key: "status", label: "Status", render: (item) => <StockHealthStatus item={item} /> },
    { key: "actions", label: "Actions", render: item => <div className="flex items-center justify-end gap-2"><StockItemActions item={item} disabled={loading || refreshing || Boolean(error)} onView={() => setDetailId(item._id)} onEdit={value => { setEditing(value); setModalOpen(true); }}/>{canWrite && <button type="button" disabled={loading || refreshing || Boolean(error)} onClick={() => archive(item)} title={`Archive ${item.name}`} aria-label={`Archive ${item.name}`} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-neutral-400 hover:bg-red-500/10 hover:text-red-300"><Archive size={16}/></button>}</div> },
  ];

  return <div className="mx-auto max-w-[1680px]">
    <PageHeader title="Stock Items" description="Create and maintain inventory items. Quantity changes are recorded separately as stock movements." actions={<><Link href="/inventory/stock-in"><Button variant="secondary"><ArrowDownToLine className="h-4 w-4" />Stock in</Button></Link><Link href="/inventory/stock-out"><Button variant="secondary"><ArrowUpFromLine className="h-4 w-4" />Stock out</Button></Link><Button disabled={!canWrite || loading || refreshing || Boolean(error)} onClick={openCreate}><Plus className="h-4 w-4" />Add item</Button></>} /><ResourceStatus lastSuccessAt={lastSuccessAt} refreshing={refreshing} loading={loading} error={error} hasData={data !== null} onRetry={() => reload({ silent: true })} showDetails={true} /><div className={cardClass + " mb-4"}><TableTools preferences={table} columns={columns} filters={{ search, category, supplier, status, sortBy, sortOrder }} onApplyFilters={value => { setSearch(value.search); setCategory(value.category); setSupplier(value.supplier); setStatus(value.status); setSortBy(value.sortBy); setSortOrder(value.sortOrder); setPage(1); }} onPageSizeChange={size => { table.update(value => ({ ...value, pageSize: size })); setPage(1); }} /></div>
    {(search || category || supplier || status) && <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 p-3 text-sm"><span className="text-neutral-300">Filters: {search && `Search: ${search} · `}{category && "Category selected · "}{supplier && "Supplier selected · "}{status && (inventoryHealthOptions.find(([value]) => value === status)?.[1] || status)}</span><Button variant="secondary" onClick={() => { setSearch(""); setCategory(""); setSupplier(""); setStatus(""); setPage(1); }}>Clear filters</Button></div>}
    <section className={cardClass}>
      <div className="grid gap-3 border-b border-white/10 p-4 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.4fr)_1fr_1fr_0.8fr_0.9fr]">
        <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-neutral-400" /><input className={`${inputClass} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by item, SKU, brand or location…" /></label>
        <DarkSelect className={inputClass} value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="">All categories</option>{metadata.categories.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</DarkSelect>
        <DarkSelect className={inputClass} value={supplier} onChange={(event) => { setSupplier(event.target.value); setPage(1); }}><option value="">All suppliers</option>{metadata.suppliers.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</DarkSelect>
        <DarkSelect className={inputClass} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Active items</option>{inventoryHealthOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="inactive">Inactive</option></DarkSelect>
        <div className="flex gap-2"><DarkSelect className={inputClass} value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="updatedAt">Recently updated</option><option value="name">Name</option><option value="currentStock">Stock</option><option value="unitCost">Unit cost</option></DarkSelect><button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-neutral-400 hover:text-white" onClick={() => setSortOrder((value) => value === "asc" ? "desc" : "asc")} aria-label="Toggle sort direction"><SlidersHorizontal className="h-4 w-4" /></button></div>
      </div>
      {loading ? <LoadingState /> : error && data == null ? null : <><div className="hidden md:block"><DataTable columns={table.visibleColumns(columns)} rows={data?.data} empty={<EmptyState title="No stock items found" description="Add an item or change the current filters." action={<Button onClick={openCreate}><Plus className="h-4 w-4" />Add first item</Button>} />}/></div><div className="space-y-3 p-3 md:hidden">{data?.data?.length ? data.data.map(item => <article key={item._id} className="min-w-0 space-y-3 rounded-xl border border-white/10 p-4"><button type="button" className="min-h-11 text-left font-semibold text-white underline decoration-white/20 underline-offset-4" onClick={() => setDetailId(item._id)}><span className="block break-words">{item.name}</span><span className="mt-1 block text-xs font-normal text-neutral-400">{item.sku}</span></button><p className="text-xs text-neutral-400">{item.category?.name || "No category"}</p><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-neutral-400">Physical</dt><dd>{quantity(item.currentStock, item.unit)}</dd></div><div><dt className="text-xs text-neutral-400">Usable</dt><dd className="text-dune-amber">{quantity(item.saleableStock, item.unit)}</dd></div></dl><StockHealthStatus item={item}/><StockItemActions item={item} disabled={refreshing || Boolean(error)} onView={() => setDetailId(item._id)} onEdit={value => { setEditing(value); setModalOpen(true); }}/></article>) : <EmptyState title="No stock items found" description="Change the filters or add an item."/>}</div></>}
      <Pagination pagination={data?.pagination} onPageChange={setPage} />
    </section>
    {detailId && <StockItemDrawer key={detailId} id={detailId} revision={detailRevision} onClose={() => setDetailId(null)} onEdit={item => { setDetailId(null); setEditing(item); setModalOpen(true); }}/>}
    <Modal open={modalOpen} onClose={closeForm} title={editing ? `Edit ${editing.name}` : "Add stock item"} description="Create and maintain an inventory item." maxWidth="max-w-3xl"><StockItemForm item={editing} categories={metadata.categories} suppliers={metadata.suppliers} onSubmit={submit} onCancel={closeForm} submitting={submitting} /></Modal>
  </div>;
}
