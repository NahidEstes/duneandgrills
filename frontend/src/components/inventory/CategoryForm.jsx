"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { Button, Field, inputClass, textareaClass } from "./InventoryUI.jsx";

const EMPTY_CATEGORY = { name: "", skuPrefix: "", description: "", color: "#f59e0b", isActive: true };

export default function CategoryForm({ category, onSubmit, submitting }) {
  const [form, setForm] = useState(EMPTY_CATEGORY);
  useEffect(() => { setForm(category ? { name: category.name, skuPrefix: category.skuPrefix || "", description: category.description || "", color: category.color || "#f59e0b", isActive: category.isActive !== false } : EMPTY_CATEGORY); }, [category]);
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(form); }} className="space-y-4"><Field label="Category name"><input required className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label="Stable SKU prefix" hint={category ? "Prefix is locked after creation; renaming the category will not affect SKUs." : "2–12 uppercase letters/numbers. Leave blank to derive a sensible stable prefix."}><input readOnly={Boolean(category)} pattern="[A-Z0-9]{2,12}" className={`${inputClass} ${category ? "cursor-not-allowed text-neutral-500" : ""}`} value={form.skuPrefix} onChange={(event) => setForm({ ...form, skuPrefix: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) })} placeholder="e.g. MEAT" /></Field><Field label="Description"><textarea className={textareaClass} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Display color"><input type="color" className={`${inputClass} cursor-pointer p-1.5`} value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></Field><label className="mt-6 flex items-center gap-3 text-xs text-neutral-300"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="h-4 w-4 accent-amber-500" /> Active category</label></div><div className="flex justify-end"><Button type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{category ? "Save changes" : "Create category"}</Button></div></form>;
}
