"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { Button, Field, inputClass, textareaClass } from "./InventoryUI.jsx";

const blank = { code: "", name: "", contactName: "", email: "", phone: "", address: "", taxNumber: "", paymentTerms: "", notes: "", isActive: true };

export default function SupplierForm({ supplier, onSubmit, submitting }) {
  const [form, setForm] = useState(blank);
  useEffect(() => { setForm(supplier ? { ...blank, ...supplier } : blank); }, [supplier]);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(form); }} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Supplier code"><input required className={inputClass} value={form.code} onChange={(event) => set("code", event.target.value.toUpperCase())} placeholder="SUP-001" /></Field><Field label="Supplier name"><input required className={inputClass} value={form.name} onChange={(event) => set("name", event.target.value)} /></Field><Field label="Contact name"><input className={inputClass} value={form.contactName} onChange={(event) => set("contactName", event.target.value)} /></Field><Field label="Phone"><input className={inputClass} value={form.phone} onChange={(event) => set("phone", event.target.value)} /></Field><Field label="Email"><input type="email" className={inputClass} value={form.email} onChange={(event) => set("email", event.target.value)} /></Field><Field label="Tax number"><input className={inputClass} value={form.taxNumber} onChange={(event) => set("taxNumber", event.target.value)} /></Field><Field label="Payment terms"><input className={inputClass} value={form.paymentTerms} onChange={(event) => set("paymentTerms", event.target.value)} placeholder="Net 30" /></Field><Field label="Address"><input className={inputClass} value={form.address} onChange={(event) => set("address", event.target.value)} /></Field></div><Field label="Notes"><textarea className={textareaClass} value={form.notes} onChange={(event) => set("notes", event.target.value)} /></Field><label className="flex items-center gap-3 text-xs text-neutral-300"><input type="checkbox" checked={form.isActive} onChange={(event) => set("isActive", event.target.checked)} className="h-4 w-4 accent-amber-500" /> Active supplier</label><div className="flex justify-end"><Button type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{supplier ? "Save changes" : "Create supplier"}</Button></div></form>;
}
