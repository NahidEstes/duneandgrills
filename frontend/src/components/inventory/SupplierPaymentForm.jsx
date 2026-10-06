"use client";

import { useRef, useState } from "react";
import DarkSelect from "@/src/components/ui/DarkSelect.jsx";
import DarkDatePicker from "@/src/components/ui/DarkDatePicker.jsx";
import { pendingSubmission, submissionStorageKey, submitPersisted } from "@/src/utils/persistedSubmission.js";
import { createSupplierPayment } from "@/src/api/inventoryApi.js";
import { dateValue } from "@/src/components/admin/finance/financeUtils.js";
import { apiErrorMessage, humanize } from "./inventoryUtils.js";
import { Button, Field, inputClass, textareaClass } from "./InventoryUI.jsx";

export default function SupplierPaymentForm({ invoice, actorId, onComplete }) {
  const key = submissionStorageKey("supplier-payment", actorId, invoice._id);
  const [payment, setPayment] = useState({ amount: invoice.outstandingAmount, method: "bank_transfer", transactionReference: "", paymentDate: dateValue(new Date()), note: "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const busyRef = useRef(false);
  const [pending, setPending] = useState(() => { try { return pendingSubmission(localStorage, key); } catch { return null; } });
  const submit = async event => {
    event.preventDefault(); if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      await submitPersisted({ storage: localStorage, key, payload: { ...payment, amount: Number(payment.amount) }, send: payload => createSupplierPayment(invoice._id, payload) });
      setPending(null); await onComplete();
    } catch (failure) { setError(apiErrorMessage(failure, "Payment outcome is unknown. Retry the saved submission.")); }
    finally { try { setPending(pendingSubmission(localStorage, key)); } catch { /* keep the visible error */ } busyRef.current = false; setBusy(false); }
  };
  const shown = pending || payment;
  const change = (field, value) => setPayment(current => ({ ...current, [field]: value }));
  return <form onSubmit={submit} className="space-y-4">
    {pending && <p role="status" className="text-sm text-amber-300">An earlier payment needs confirmation. Retry its exact saved details; do not record another payment.</p>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <fieldset disabled={busy || Boolean(pending)} className="space-y-4">
      <Field label="Amount (SAR)"><input required min="0.01" max={invoice.outstandingAmount} step="0.01" type="number" className={inputClass} value={shown.amount} onChange={e => change("amount", e.target.value)} /></Field>
      <Field label="Method"><DarkSelect className={inputClass} value={shown.method} onChange={e => change("method", e.target.value)}>{["bank_transfer", "cash", "card", "cheque", "other"].map(value => <option key={value} value={value}>{humanize(value)}</option>)}</DarkSelect></Field>
      <Field label="Payment date"><DarkDatePicker className={inputClass} value={shown.paymentDate} onChange={e => change("paymentDate", e.target.value)} /></Field>
      <Field label="Transaction reference"><input className={inputClass} value={shown.transactionReference} onChange={e => change("transactionReference", e.target.value)} /></Field>
      <Field label="Note"><textarea className={textareaClass} value={shown.note} onChange={e => change("note", e.target.value)} /></Field>
    </fieldset>
    <Button type="submit" disabled={busy}>{pending ? "Retry saved payment" : "Record payment"}</Button>
  </form>;
}
