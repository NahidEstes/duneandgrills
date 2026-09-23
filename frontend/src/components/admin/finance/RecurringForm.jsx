"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import DarkDatePicker from "@/src/components/ui/DarkDatePicker.jsx";
import { Button, Field, inputClass, textareaClass } from "@/src/components/inventory/InventoryUI.jsx";
import { dateValue, todayValue } from "./financeUtils.js";

const empty = { title: "", description: "", category: "", defaultAmount: "", vatAmount: 0, frequency: "monthly", startDate: todayValue(), endDate: "", nextDueDate: todayValue(), vendor: "", referencePrefix: "", branch: "", notes: "", receiptUrl: "", isActive: true };

export default function RecurringForm({ row, categories, onSubmit, submitting }) {
  const [form, setForm] = useState(empty);
  useEffect(() => setForm(row ? { ...empty, ...row, category: row.category?._id || row.category, startDate: dateValue(row.startDate), endDate: dateValue(row.endDate), nextDueDate: dateValue(row.nextDueDate) } : empty), [row]);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  return <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); onSubmit({ ...form, defaultAmount: Number(form.defaultAmount), vatAmount: Number(form.vatAmount), endDate: form.endDate || null }); }}><div className="grid gap-4 sm:grid-cols-2">
    <Field label="Template title" className="sm:col-span-2"><input required className={inputClass} value={form.title} onChange={(event) => set("title", event.target.value)} /></Field>
    <Field label="Description" className="sm:col-span-2"><textarea className={textareaClass} value={form.description} onChange={(event) => set("description", event.target.value)} /></Field>
    <Field label="Category"><DarkSelect required className={inputClass} value={form.category} onChange={(event) => set("category", event.target.value)}><option value="">Choose category</option>{categories.filter((item) => item.isActive || item._id === form.category).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</DarkSelect></Field>
    <Field label="Frequency"><DarkSelect className={inputClass} value={form.frequency} onChange={(event) => set("frequency", event.target.value)}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></DarkSelect></Field>
    <Field label="Default amount (SAR)"><input required min="0.01" step="0.01" type="number" className={inputClass} value={form.defaultAmount} onChange={(event) => set("defaultAmount", event.target.value)} /></Field>
    <Field label="VAT / tax (SAR)"><input min="0" step="0.01" type="number" className={inputClass} value={form.vatAmount} onChange={(event) => set("vatAmount", event.target.value)} /></Field>
    <Field label="Start date"><DarkDatePicker required className={inputClass} value={form.startDate} onChange={(event) => set("startDate", event.target.value)} /></Field>
    <Field label="Next due date"><DarkDatePicker required className={inputClass} value={form.nextDueDate} onChange={(event) => set("nextDueDate", event.target.value)} /></Field>
    <Field label="Optional end date"><DarkDatePicker className={inputClass} value={form.endDate} onChange={(event) => set("endDate", event.target.value)} /></Field>
    <Field label="Vendor / payee"><input className={inputClass} value={form.vendor} onChange={(event) => set("vendor", event.target.value)} /></Field>
    <Field label="Reference prefix"><input className={inputClass} value={form.referencePrefix} onChange={(event) => set("referencePrefix", event.target.value)} /></Field>
    <Field label="Branch / location"><input className={inputClass} value={form.branch} onChange={(event) => set("branch", event.target.value)} /></Field>
    <Field label="Notes" className="sm:col-span-2"><textarea className={textareaClass} value={form.notes} onChange={(event) => set("notes", event.target.value)} /></Field>
    <label className="flex items-center gap-3 text-xs text-neutral-300"><input type="checkbox" checked={form.isActive} onChange={(event) => set("isActive", event.target.checked)} className="h-4 w-4 accent-amber-500" /> Active template</label>
  </div><div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs text-amber-200">Generation creates an unpaid bill at most once per due period. It never makes an automatic payment.</div><div className="flex justify-end"><Button type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{row ? "Save template" : "Create template"}</Button></div></form>;
}
