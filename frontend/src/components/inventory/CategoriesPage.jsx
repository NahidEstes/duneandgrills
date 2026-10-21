"use client";

import { useState } from "react";
import { Archive, Pencil, Plus, Tags } from "lucide-react";
import { toast } from "sonner";
import { archiveInventoryCategory, createInventoryCategory, fetchInventoryCategories, updateInventoryCategory } from "@/src/api/inventoryApi.js";
import CategoryForm from "./CategoryForm.jsx";
import { Button, EmptyState, InventoryLoadError, LoadingState, Modal, Money, PageHeader, cardClass } from "./InventoryUI.jsx";
import { apiErrorMessage } from "./inventoryUtils.js";
import useInventoryResource from "./useInventoryResource.js";

export default function CategoriesPage() {
  const { data: result, loading, error, reload } = useInventoryResource(async () => { const rows = await fetchInventoryCategories(true); if (!Array.isArray(rows)) throw new Error("The category list could not be loaded."); return rows; }, []);
  const data = Array.isArray(result) ? result : [];
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const save = async (payload) => { setSubmitting(true); try { if (editing) await updateInventoryCategory(editing._id, payload); else await createInventoryCategory(payload); toast.success(editing ? "Category updated." : "Category created."); setOpen(false); setEditing(null); reload({ silent: true }).catch(() => undefined); } catch (error) { toast.error(apiErrorMessage(error, "Unable to save category.")); } finally { setSubmitting(false); } };
  const archive = async (row) => { if (!window.confirm(`Archive ${row.name}?`)) return; try { await archiveInventoryCategory(row._id); toast.success("Category archived."); reload({ silent: true }).catch(() => undefined); } catch (error) { toast.error(apiErrorMessage(error)); } };
  return <div className="mx-auto max-w-[1400px]"><PageHeader title="Categories" description="Organize stock items into clean, reusable inventory groups." actions={<Button disabled={loading || Boolean(error) || submitting} onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" />Add category</Button>} /><InventoryLoadError error={error} onRetry={reload} label="categories" retained={result !== null} />{loading ? <div className={cardClass}><LoadingState /></div> : data.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.map((row) => <article key={row._id} className={`${cardClass} p-5`}><div className="flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl" style={{ backgroundColor: `${row.color}20`, color: row.color }}><Tags className="h-5 w-5" /></span><div className="flex gap-1"><button type="button" disabled={submitting || Boolean(error)} onClick={() => { setEditing(row); setOpen(true); }} className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white"><Pencil className="h-4 w-4" /></button><button type="button" disabled={submitting || Boolean(error)} onClick={() => archive(row)} className="rounded-lg p-2 text-neutral-500 hover:bg-red-500/10 hover:text-red-300"><Archive className="h-4 w-4" /></button></div></div><h2 className="mt-4 font-body text-base font-semibold text-white">{row.name}</h2><p className="mt-1 min-h-10 text-xs leading-5 text-neutral-500">{row.description || "No description"}</p><div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-xs"><div><p className="text-neutral-600">Items</p><p className="mt-1 font-semibold text-neutral-300">{row.itemCount}</p></div><div><p className="text-neutral-600">Inventory value</p><p className="mt-1 font-semibold text-neutral-300"><Money value={row.inventoryValue} /></p></div></div></article>)}</div> : !error && <div className={cardClass}><EmptyState title="No categories yet" action={<Button onClick={() => setOpen(true)}>Create category</Button>} /></div>}<Modal open={open} onClose={() => { if (!submitting) { setOpen(false); setEditing(null); } }} title={editing ? `Edit ${editing.name}` : "Add category"}><CategoryForm category={editing} onSubmit={save} submitting={submitting} /></Modal></div>;
}
