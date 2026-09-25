"use client";

import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import { useEffect, useState } from "react";
import { Check, Clock3, Eye, PackageCheck, Pencil, Plus, Send, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { createPurchaseOrder, fetchInventoryItems, fetchPurchaseOrders, fetchSuppliers, receivePurchaseOrder, updatePurchaseOrder, updatePurchaseOrderStatus } from "@/src/api/inventoryApi.js";
import { useAuth } from "@/src/context/AuthContext.jsx";
import PurchaseOrderForm from "./PurchaseOrderForm.jsx";
import PurchaseReceiptForm from "./PurchaseReceiptForm.jsx";
import { Badge, Button, DataTable, EmptyState, Field, LoadingState, Modal, Money, PageHeader, Pagination, cardClass, inputClass, textareaClass } from "./InventoryUI.jsx";
import { apiErrorMessage, formatDate, humanize } from "./inventoryUtils.js";
import useInventoryResource from "./useInventoryResource.js";

const statuses = ["draft", "submitted", "approved", "rejected", "ordered", "partially_received", "received", "closed_short", "cancelled"];
const tones = { draft: "info", submitted: "warning", approved: "success", rejected: "danger", ordered: "warning", partially_received: "violet", received: "success", closed_short: "neutral", cancelled: "danger" };
const transitionLabel = { submitted: "Submit for approval", approved: "Approve", rejected: "Reject", draft: "Return to draft", ordered: "Mark ordered", closed_short: "Close short", cancelled: "Cancel" };

export default function PurchaseOrdersPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const [metadata, setMetadata] = useState({ suppliers: [], items: [] });
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState(null);
  const [receiptOrder, setReceiptOrder] = useState(null); const [detail, setDetail] = useState(null);
  const [transition, setTransition] = useState(null); const [reason, setReason] = useState(""); const [submitting, setSubmitting] = useState(false);
  useEffect(() => { Promise.all([fetchSuppliers(), fetchInventoryItems({ limit: 100, sortBy: "name", sortOrder: "asc" })]).then(([suppliers, items]) => setMetadata({ suppliers, items: items.data })).catch(() => toast.error("Unable to load purchase-order options.")); }, []);
  useEffect(() => { if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("action") === "add") setFormOpen(true); }, []);
  const { data, loading, reload } = useInventoryResource(() => fetchPurchaseOrders({ page, limit: 20, status: status || undefined }), [page, status]);
  const save = async (payload) => { setSubmitting(true); try { if (editing) await updatePurchaseOrder(editing._id, payload); else await createPurchaseOrder(payload); toast.success(editing ? "Purchase order updated." : "Purchase order created as draft."); setFormOpen(false); setEditing(null); reload({ silent: true }); } catch (error) { toast.error(apiErrorMessage(error, "Unable to save purchase order.")); } finally { setSubmitting(false); } };
  const runTransition = async () => { const requiresReason = ["rejected", "cancelled", "closed_short"].includes(transition.target); if (requiresReason && !reason.trim()) return toast.error("A reason is required."); setSubmitting(true); try { await updatePurchaseOrderStatus(transition.order._id, transition.target, { reason, idempotencyKey: crypto.randomUUID(), emergencyOverride: transition.target === "approved" && user?.role === "admin" && Boolean(reason.trim()) }); toast.success(`${transition.order.orderNumber}: ${humanize(transition.target)}.`); setTransition(null); setReason(""); reload({ silent: true }); } catch (error) { toast.error(apiErrorMessage(error, "Unable to update purchase order.")); } finally { setSubmitting(false); } };
  const receive = async (payload) => { setSubmitting(true); try { await receivePurchaseOrder(receiptOrder._id, payload); toast.success("Purchase receipt completed and stock updated."); setReceiptOrder(null); reload({ silent: true }); } catch (error) { toast.error(apiErrorMessage(error, "Unable to receive purchase order.")); } finally { setSubmitting(false); } };
  const actionCell = (row) => <div className="flex justify-end gap-1">
    {["draft", "rejected", "submitted", "approved"].includes(row.status) && <button type="button" onClick={() => { setEditing(row); setFormOpen(true); }} className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white" aria-label="Edit"><Pencil className="h-4 w-4" /></button>}
    {row.status === "draft" && <button type="button" onClick={() => setTransition({ order: row, target: "submitted" })} className="rounded-lg p-2 text-amber-400 hover:bg-amber-500/10" aria-label="Submit"><Send className="h-4 w-4" /></button>}
    {row.status === "submitted" && ["admin", "manager"].includes(user?.role) && <><button type="button" onClick={() => setTransition({ order: row, target: "approved" })} className="rounded-lg p-2 text-emerald-400 hover:bg-emerald-500/10" aria-label="Approve"><Check className="h-4 w-4" /></button><button type="button" onClick={() => setTransition({ order: row, target: "rejected" })} className="rounded-lg p-2 text-red-400 hover:bg-red-500/10" aria-label="Reject"><XCircle className="h-4 w-4" /></button></>}
    {row.status === "approved" && <button type="button" onClick={() => setTransition({ order: row, target: "ordered" })} className="rounded-lg p-2 text-dune-amber hover:bg-amber-500/10" aria-label="Mark ordered"><ShieldCheck className="h-4 w-4" /></button>}
    {["ordered", "partially_received"].includes(row.status) && <button type="button" onClick={() => setReceiptOrder(row)} className="rounded-lg p-2 text-emerald-400 hover:bg-emerald-500/10" aria-label="Receive"><PackageCheck className="h-4 w-4" /></button>}
    {["ordered", "partially_received"].includes(row.status) && <button type="button" onClick={() => setTransition({ order: row, target: "closed_short" })} className="rounded-lg p-2 text-red-400 hover:bg-red-500/10" aria-label="Close remaining quantity"><XCircle className="h-4 w-4" /></button>}
    <button type="button" onClick={() => setDetail(row)} className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white" aria-label="View timeline"><Eye className="h-4 w-4" /></button>
  </div>;
  const columns = [
    { key: "number", label: "PO / revision", render: (row) => <div><span className="font-semibold text-white">{row.orderNumber}</span><p className="text-[0.65rem] text-neutral-600">Revision {row.revision || 1}</p></div> },
    { key: "supplier", label: "Supplier", render: (row) => row.supplier?.name || "—" }, { key: "items", label: "Items", render: (row) => row.items.length },
    { key: "progress", label: "Received", render: (row) => <span className="text-xs">{row.items.reduce((sum, line) => sum + Number(line.receivedQuantity || 0), 0)} / {row.items.reduce((sum, line) => sum + Number(line.quantity || 0), 0)}</span> },
    { key: "total", label: "Total", render: (row) => <Money value={row.total} /> }, { key: "expected", label: "Expected", render: (row) => formatDate(row.expectedAt) },
    { key: "status", label: "Status", render: (row) => <Badge tone={tones[row.status]}>{humanize(row.status)}</Badge> }, { key: "actions", label: "", render: actionCell },
  ];
  return <div className="mx-auto max-w-[1600px]"><PageHeader title="Purchase Orders" description="Draft, approve, order and receive supplier purchases with revision-safe workflow." actions={<Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" />Create draft PO</Button>} /><section className={cardClass}><div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-body text-base font-semibold text-white">Purchase lifecycle</h2><p className="text-xs text-neutral-600">Approval is required before ordering</p></div><DarkSelect className={`${inputClass} sm:w-56`} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</DarkSelect></div>{loading ? <LoadingState /> : <DataTable columns={columns} rows={data?.data} empty={<EmptyState title="No purchase orders yet" />} />}<Pagination pagination={data?.pagination} onPageChange={setPage} /></section>
    <Modal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} title={editing ? `Edit ${editing.orderNumber}` : "Create purchase order"} description="Every new PO begins as a draft. Material edits invalidate approval." maxWidth="max-w-5xl"><PurchaseOrderForm order={editing} suppliers={metadata.suppliers} items={metadata.items} onSubmit={save} submitting={submitting} /></Modal>
    <Modal open={Boolean(receiptOrder)} onClose={() => setReceiptOrder(null)} title={receiptOrder ? `Receive ${receiptOrder.orderNumber}` : "Receive purchase order"} maxWidth="max-w-3xl">{receiptOrder && <PurchaseReceiptForm order={receiptOrder} onSubmit={receive} submitting={submitting} />}</Modal>
    <Modal open={Boolean(transition)} onClose={() => setTransition(null)} title={transition ? transitionLabel[transition.target] : "Update status"}><div className="space-y-4"><p className="text-sm text-neutral-400">{transition?.order.orderNumber} will move to <strong className="text-dune-amber">{humanize(transition?.target)}</strong>.</p><Field label={["rejected", "cancelled", "closed_short"].includes(transition?.target) ? "Reason (required)" : "Approval / transition note"}><textarea className={textareaClass} value={reason} onChange={(event) => setReason(event.target.value)} /></Field><Button onClick={runTransition} disabled={submitting}>{submitting ? "Saving…" : transitionLabel[transition?.target]}</Button></div></Modal>
    <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.orderNumber || "Purchase order timeline"} maxWidth="max-w-3xl"><div className="space-y-3">{detail?.revisionHistory?.map((event, index) => <div key={`${event.at}-${index}`} className="flex gap-3 rounded-xl border border-white/10 bg-black/20 p-3"><Clock3 className="mt-0.5 h-4 w-4 text-dune-amber" /><div><p className="text-sm font-medium text-white">{humanize(event.action)}</p><p className="text-xs text-neutral-500">Revision {event.revision} · {formatDate(event.at, true)}</p>{event.reason && <p className="mt-1 text-xs text-neutral-400">{event.reason}</p>}</div></div>)}</div></Modal>
  </div>;
}
