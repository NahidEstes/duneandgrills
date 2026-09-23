"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import DarkDatePicker from "@/src/components/ui/DarkDatePicker.jsx";
import { Button, Field, inputClass, textareaClass } from "@/src/components/inventory/InventoryUI.jsx";
import { dateValue, todayValue } from "./financeUtils.js";

const empty = { title: "", description: "", category: "", totalAmount: "", vatAmount: 0, expenseDate: todayValue(), dueDate: "", amountPaid: 0, paymentDate: "", paymentMethod: "unrecorded", vendor: "", referenceNumber: "", branch: "", notes: "", receiptUrl: "" };

export default function ExpenseForm({ expense, categories, onSubmit, submitting }) {
  const [form, setForm] = useState(empty);
  useEffect(() => {
    setForm(expense ? { ...empty, ...expense, category: expense.category?._id || expense.category, expenseDate: dateValue(expense.expenseDate), dueDate: dateValue(expense.dueDate), paymentDate: dateValue(expense.paymentDate) } : empty);
  }, [expense]);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const paid = Number(form.amountPaid) > 0;
  const derivedStatus = Number(form.amountPaid) <= 0 ? "Unpaid" : Number(form.amountPaid) >= Number(form.totalAmount) ? "Paid" : "Partially paid";
  return <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); onSubmit({ ...form, totalAmount: Number(form.totalAmount), vatAmount: Number(form.vatAmount), amountPaid: Number(form.amountPaid), dueDate: form.dueDate || null, paymentDate: form.paymentDate || null }); }}>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Title / description" className="sm:col-span-2"><input required maxLength={160} className={inputClass} value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="Restaurant rent" /></Field>
      <Field label="Additional description" className="sm:col-span-2"><textarea className={textareaClass} value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Optional bill details" /></Field>
      <Field label="Category"><DarkSelect required className={inputClass} value={form.category} onChange={(event) => set("category", event.target.value)}><option value="">Choose category</option>{categories.filter((row) => row.isActive || row._id === form.category).map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}</DarkSelect></Field>
      <Field label="Vendor / payee"><input className={inputClass} value={form.vendor} onChange={(event) => set("vendor", event.target.value)} /></Field>
      <Field label="Total amount (SAR)"><input required min="0.01" step="0.01" type="number" className={inputClass} value={form.totalAmount} onChange={(event) => set("totalAmount", event.target.value)} /></Field>
      <Field label="VAT / tax included (SAR)"><input min="0" step="0.01" type="number" className={inputClass} value={form.vatAmount} onChange={(event) => set("vatAmount", event.target.value)} /></Field>
      <Field label="Expense date"><DarkDatePicker required className={inputClass} value={form.expenseDate} onChange={(event) => set("expenseDate", event.target.value)} /></Field>
      <Field label="Due date"><DarkDatePicker className={inputClass} value={form.dueDate} onChange={(event) => set("dueDate", event.target.value)} /></Field>
      <Field label="Amount paid (SAR)" hint={`Status: ${derivedStatus}`}><input min="0" step="0.01" type="number" className={inputClass} value={form.amountPaid} onChange={(event) => set("amountPaid", event.target.value)} /></Field>
      <Field label="Payment method"><DarkSelect disabled={!paid} className={inputClass} value={paid ? form.paymentMethod : "unrecorded"} onChange={(event) => set("paymentMethod", event.target.value)}><option value="unrecorded">Not recorded</option><option value="cash">Cash</option><option value="card">Card</option><option value="bank-transfer">Bank transfer</option><option value="other">Other</option></DarkSelect></Field>
      {paid && <Field label="Payment date"><DarkDatePicker required className={inputClass} value={form.paymentDate} onChange={(event) => set("paymentDate", event.target.value)} /></Field>}
      <Field label="Invoice / reference"><input className={inputClass} value={form.referenceNumber} onChange={(event) => set("referenceNumber", event.target.value)} /></Field>
      <Field label="Branch / location"><input className={inputClass} value={form.branch} onChange={(event) => set("branch", event.target.value)} /></Field>
      <Field label="Receipt / invoice URL" hint="A trusted object-storage URL only; this project does not upload files locally." className="sm:col-span-2"><input type="url" className={inputClass} value={form.receiptUrl} onChange={(event) => set("receiptUrl", event.target.value)} placeholder="https://…" /></Field>
      <Field label="Notes" className="sm:col-span-2"><textarea className={textareaClass} value={form.notes} onChange={(event) => set("notes", event.target.value)} /></Field>
    </div>
    <div className="flex justify-end"><Button type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{expense ? "Save expense" : "Add expense"}</Button></div>
  </form>;
}
