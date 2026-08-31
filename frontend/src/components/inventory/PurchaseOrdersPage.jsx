"use client";

import { useEffect, useState } from "react";
import { PackageCheck, Pencil, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { createPurchaseOrder, fetchInventoryItems, fetchPurchaseOrders, fetchSuppliers, receivePurchaseOrder, updatePurchaseOrder, updatePurchaseOrderStatus } from "@/src/api/inventoryApi.js";
import PurchaseOrderForm from "./PurchaseOrderForm.jsx";
import PurchaseReceiptForm from "./PurchaseReceiptForm.jsx";
import { Badge, Button, DataTable, EmptyState, LoadingState, Modal, Money, PageHeader, Pagination, cardClass, inputClass } from "./InventoryUI.jsx";
import { apiErrorMessage, formatDate, humanize } from "./inventoryUtils.js";
import useInventoryResource from "./useInventoryResource.js";

const tones = { draft: "info", ordered: "warning", partially_received: "violet", received: "success", cancelled: "danger" };

export default function PurchaseOrdersPage() {
  const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const [metadata, setMetadata] = useState({ suppliers: [], items: [] });
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState(null);
  const [receiptOrder, setReceiptOrder] = useState(null); const [submitting, setSubmitting] = useState(false);
  useEffect(() => { Promise.all([fetchSuppliers(), fetchInventoryItems({ limit: 100, sortBy: "name", sortOrder: "asc" })]).then(([suppliers, items]) => setMetadata({ suppliers, items: items.data })).catch(() => toast.error("Unable to load purchase-order options.")); }, []);
  useEffect(() => { if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("action") === "add") setFormOpen(true); }, []);
  const { data, loading, reload } = useInventoryResource(() => fetchPurchaseOrders({ page, limit: 20, status: status || undefined }), [page, status]);
  const save = async (payload) => { setSubmitting(true); try { if (editing) await updatePurchaseOrder(editing._id, payload); else await createPurchaseOrder(payload); toast.success(editing ? "Purchase order updated." : "Purchase order created."); setFormOpen(false); setEditing(null); reload({ silent: true }); } catch (error) { toast.error(apiErrorMessage(error, "Unable to save purchase order.")); } finally { setSubmitting(false); } };
  const markOrdered = async (order) => { try { await updatePurchaseOrderStatus(order._id, "ordered"); toast.success(`${order.orderNumber} marked as ordered.`); reload({ silent: true }); } catch (error) { toast.error(apiErrorMessage(error)); } };
  const receive = async (payload) => { setSubmitting(true); try { await receivePurchaseOrder(receiptOrder._id, payload); toast.success("Purchase receipt completed and stock updated."); setReceiptOrder(null); reload({ silent: true }); } catch (error) { toast.error(apiErrorMessage(error, "Unable to receive purchase order.")); } finally { setSubmitting(false); } };
  const columns = [
    { key: "number", label: "PO number", render: (row) => <span className="font-semibold text-white">{row.orderNumber}</span> },
    { key: "supplier", label: "Supplier", render: (row) => row.supplier?.name || "—" },
    { key: "items", label: "Items", render: (row) => row.items.length },
    { key: "total", label: "Total", render: (row) => <Money value={row.total} /> },
    { key: "expected", label: "Expected", render: (row) => formatDate(row.expectedAt) },
    { key: "status", label: "Status", render: (row) => <Badge tone={tones[row.status]}>{humanize(row.status)}</Badge> },
    { key: "created", label: "Created", render: (row) => formatDate(row.createdAt, true) },
    { key: "actions", label: "", render: (row) => <div className="flex justify-end gap-1">{["draft", "ordered"].includes(row.status) && <button type="button" onClick={() => { setEditing(row); setFormOpen(true); }} className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white" aria-label="Edit"><Pencil className="h-4 w-4" /></button>}{row.status === "draft" && <button type="button" onClick={() => markOrdered(row)} className="rounded-lg p-2 text-neutral-500 hover:bg-amber-500/10 hover:text-amber-300" aria-label="Mark ordered"><Send className="h-4 w-4" /></button>}{["ordered", "partially_received"].includes(row.status) && <button type="button" onClick={() => setReceiptOrder(row)} className="rounded-lg p-2 text-neutral-500 hover:bg-emerald-500/10 hover:text-emerald-300" aria-label="Receive"><PackageCheck className="h-4 w-4" /></button>}</div> },
  ];
  return <div className="mx-auto max-w-[1600px]"><PageHeader title="Purchase Orders" description="Create, order and receive supplier purchases in SAR with automatic stock updates." actions={<Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" />Create purchase order</Button>} /><section className={cardClass}><div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-body text-base font-semibold text-white">Purchase history</h2><p className="text-xs text-neutral-600">Draft through received</p></div><select className={`${inputClass} sm:w-56`} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{Object.keys(tones).map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></div>{loading ? <LoadingState /> : <DataTable columns={columns} rows={data?.data} empty={<EmptyState title="No purchase orders yet" description="Create a purchase order to begin supplier purchasing." />} />}<Pagination pagination={data?.pagination} onPageChange={setPage} /></section><Modal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} title={editing ? `Edit ${editing.orderNumber}` : "Create purchase order"} description="All values use SAR. Receiving is recorded separately." maxWidth="max-w-5xl"><PurchaseOrderForm order={editing} suppliers={metadata.suppliers} items={metadata.items} onSubmit={save} submitting={submitting} /></Modal><Modal open={Boolean(receiptOrder)} onClose={() => setReceiptOrder(null)} title={receiptOrder ? `Receive ${receiptOrder.orderNumber}` : "Receive purchase order"} maxWidth="max-w-3xl">{receiptOrder && <PurchaseReceiptForm order={receiptOrder} onSubmit={receive} submitting={submitting} />}</Modal></div>;
}
