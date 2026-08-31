"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, LoaderCircle, Play, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cancelInventoryCount, completeInventoryCount, createInventoryCount, fetchInventoryCategories, fetchInventoryCounts } from "@/src/api/inventoryApi.js";
import { Badge, Button, DataTable, EmptyState, Field, LoadingState, Modal, PageHeader, cardClass, inputClass, textareaClass } from "./InventoryUI.jsx";
import { apiErrorMessage, formatDate, formatQuantity, humanize } from "./inventoryUtils.js";
import useInventoryResource from "./useInventoryResource.js";

const tones = { draft: "info", in_progress: "warning", completed: "success", cancelled: "danger" };

function CountSheet({ count, onComplete, submitting }) {
  const [lines, setLines] = useState(() => Object.fromEntries(count.items.map((line) => [line._id, { countedQuantity: line.expectedQuantity, notes: "" }])));
  const set = (id, field, value) => setLines((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  return <form onSubmit={(event) => { event.preventDefault(); onComplete(count._id, count.items.map((line) => ({ lineId: line._id, countedQuantity: Number(lines[line._id].countedQuantity), notes: lines[line._id].notes }))); }} className="space-y-4"><div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-100/70">Enter the physically counted quantity for every line. Differences create audited inventory-count adjustment transactions.</div><div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">{count.items.map((line) => { const counted = Number(lines[line._id].countedQuantity); const variance = counted - line.expectedQuantity; return <div key={line._id} className="grid items-end gap-3 rounded-xl border border-white/10 bg-black/20 p-3 sm:grid-cols-[1fr_0.7fr_0.7fr_0.8fr]"><div><p className="text-sm font-medium text-white">{line.itemName}</p><p className="text-[0.65rem] text-neutral-600">{line.sku}</p></div><div><p className="text-[0.68rem] text-neutral-600">Expected</p><p className="mt-2 text-sm text-neutral-300">{formatQuantity(line.expectedQuantity)}</p></div><Field label="Counted"><input required min="0" step="any" type="number" className={inputClass} value={lines[line._id].countedQuantity} onChange={(event) => set(line._id, "countedQuantity", event.target.value)} /></Field><div><p className="text-[0.68rem] text-neutral-600">Variance</p><p className={`mt-2 text-sm font-semibold ${variance === 0 ? "text-neutral-400" : variance > 0 ? "text-emerald-400" : "text-red-400"}`}>{variance > 0 ? "+" : ""}{Number.isFinite(variance) ? variance : 0}</p></div></div>; })}</div><div className="flex justify-end"><Button type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}Complete count &amp; adjust stock</Button></div></form>;
}

export default function InventoryCountPage() {
  const { data = [], loading, reload } = useInventoryResource(fetchInventoryCounts, []);
  const [categories, setCategories] = useState([]); const [createOpen, setCreateOpen] = useState(false);
  const [activeCount, setActiveCount] = useState(null); const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ category: "", notes: "" });
  useEffect(() => { fetchInventoryCategories().then(setCategories).catch(() => undefined); if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("action") === "add") setCreateOpen(true); }, []);
  const create = async (event) => { event.preventDefault(); setSubmitting(true); try { const row = await createInventoryCount({ category: form.category || undefined, notes: form.notes }); toast.success(`${row.countNumber} started.`); setCreateOpen(false); setForm({ category: "", notes: "" }); setActiveCount(row); reload({ silent: true }); } catch (error) { toast.error(apiErrorMessage(error, "Unable to start inventory count.")); } finally { setSubmitting(false); } };
  const complete = async (id, items) => { setSubmitting(true); try { await completeInventoryCount(id, items); toast.success("Inventory count completed and variances recorded."); setActiveCount(null); reload({ silent: true }); } catch (error) { toast.error(apiErrorMessage(error, "Unable to complete inventory count.")); } finally { setSubmitting(false); } };
  const cancel = async (row) => { if (!window.confirm(`Cancel ${row.countNumber}?`)) return; try { await cancelInventoryCount(row._id); toast.success("Inventory count cancelled."); reload({ silent: true }); } catch (error) { toast.error(apiErrorMessage(error)); } };
  const columns = [
    { key: "number", label: "Count number", render: (row) => <span className="font-semibold text-white">{row.countNumber}</span> },
    { key: "status", label: "Status", render: (row) => <Badge tone={tones[row.status]}>{humanize(row.status)}</Badge> },
    { key: "items", label: "Items", render: (row) => row.items.length },
    { key: "created", label: "Created", render: (row) => formatDate(row.createdAt, true) },
    { key: "createdBy", label: "Created by", render: (row) => row.createdBy?.name || "—" },
    { key: "completed", label: "Completed", render: (row) => formatDate(row.completedAt, true) },
    { key: "actions", label: "", render: (row) => row.status === "in_progress" ? <div className="flex justify-end gap-1"><button type="button" onClick={() => setActiveCount(row)} className="rounded-lg p-2 text-neutral-500 hover:bg-emerald-500/10 hover:text-emerald-300" aria-label="Continue count"><Play className="h-4 w-4" /></button><button type="button" onClick={() => cancel(row)} className="rounded-lg p-2 text-neutral-500 hover:bg-red-500/10 hover:text-red-300" aria-label="Cancel count"><XCircle className="h-4 w-4" /></button></div> : null },
  ];
  return <div className="mx-auto max-w-[1500px]"><PageHeader title="Inventory Count" description="Run physical stock counts and convert every variance into an auditable adjustment." actions={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />Start inventory count</Button>} /><section className={cardClass}>{loading ? <LoadingState /> : <DataTable columns={columns} rows={data} empty={<EmptyState title="No inventory counts yet" description="Start a full or category-based count." />} />}</section><Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Start inventory count"><form onSubmit={create} className="space-y-4"><Field label="Scope"><select className={inputClass} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="">All active inventory items</option>{categories.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</select></Field><Field label="Count notes"><textarea className={textareaClass} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field><div className="flex justify-end"><Button type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Start count</Button></div></form></Modal><Modal open={Boolean(activeCount)} onClose={() => setActiveCount(null)} title={activeCount ? `Count sheet · ${activeCount.countNumber}` : "Count sheet"} maxWidth="max-w-5xl">{activeCount && <CountSheet count={activeCount} onComplete={complete} submitting={submitting} />}</Modal></div>;
}
