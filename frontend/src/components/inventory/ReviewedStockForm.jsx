"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/src/context/AuthContext.jsx";
import { previewStockAction, confirmStockAction, findStockAction, fetchSuppliers } from "@/src/api/inventoryApi.js";
import { pendingSubmission, submissionStorageKey, submitPersisted } from "@/src/utils/persistedSubmission.js";
import { usePageFormChanges } from "../ui/useDialogChanges.js";
import DeliveryDialog from "../admin/delivery/DeliveryDialog.jsx";
import DarkSelect from "../ui/DarkSelect.jsx";
import DarkDatePicker from "../ui/DarkDatePicker.jsx";
import InventoryItemPicker from "./InventoryItemPicker.jsx";
import { Button, Field, inputClass, textareaClass } from "./InventoryUI.jsx";
import { apiErrorMessage, humanize } from "./inventoryUtils.js";
import { preparationQuantityLabel as q } from "@/src/utils/preparationUnits.js";

const blank = { item: "", quantity: "", reason: "", reasonCode: "SPOILED", notes: "", supplier: "", unitCost: "", lotNumber: "", receivedAt: "", expiryDate: "", occurredAt: "", allowNegativeStock: false };
export default function ReviewedStockForm({ kind = "movement", initialType = "STOCK_IN", initialItem = "", onSaved }) {
  const { user } = useAuth(), root = useRef(null), lock = useRef(false), requestKey = useRef(null);
  const [form, setForm] = useState({ ...blank, item: initialItem }), [movementType, setMovementType] = useState(initialType), [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [plan, setPlan] = useState(null), [open, setOpen] = useState(false), [result, setResult] = useState(null), [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(null), [storageReady, setStorageReady] = useState(false), [online, setOnline] = useState(true), [suppliers, setSuppliers] = useState([]), [supplierError, setSupplierError] = useState("");
  const key = submissionStorageKey("inventory-action", user?._id || user?.id);
  const canApprove = ["admin", "manager"].includes(user?.role), inbound = movementType === "STOCK_IN", adjustment = movementType === "ADJUSTMENT";
  const guard = usePageFormChanges({ open: true, rootRef: root, resetKey: `${key}:${revision}` });
  const loadSuppliers = () => fetchSuppliers().then(rows => { setSuppliers(rows); setSupplierError(""); }).catch(failure => setSupplierError(apiErrorMessage(failure)));
  useEffect(() => { if (inbound) loadSuppliers(); }, [inbound]);
  useEffect(() => {
    setStorageReady(false);
    try {
      const old = pendingSubmission(sessionStorage, key);
      requestKey.current = old?.idempotencyKey || sessionStorage.getItem(key + ":key") || crypto.randomUUID();
      sessionStorage.setItem(key + ":key", requestKey.current); setPending(old); setStorageReady(true);
    } catch (failure) { setError(failure.message); }
    const update = () => setOnline(navigator.onLine); update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, [key]);
  const edit = values => { setForm(current => ({ ...current, ...values })); setPlan(null); setError(""); };
  const payload = () => ({ ...form, kind, movementType, quantity: Number(form.quantity), unitCost: inbound && form.unitCost !== "" ? Number(form.unitCost) : null,
    expiryDate: inbound && form.expiryDate ? `${form.expiryDate}T12:00:00+03:00` : null,
    receivedAt: inbound && form.receivedAt ? new Date(form.receivedAt + ":00+03:00").toISOString() : null,
    occurredAt: kind === "waste" && form.occurredAt ? new Date(form.occurredAt + ":00+03:00").toISOString() : null,
  });
  const review = async event => {
    event.preventDefault(); if (lock.current || pending || !storageReady || !online || !selected?.isActive || selected._id !== form.item) return;
    lock.current = true; setBusy(true); setError("");
    try { setPlan(await previewStockAction(payload())); setOpen(true); } catch (failure) { setError(apiErrorMessage(failure)); }
    finally { lock.current = false; setBusy(false); }
  };
  const success = record => {
    setResult(record); setPending(null); setOpen(false); setPlan(null); setForm({ ...blank }); setSelected(null); setRevision(value => value + 1);
    try { sessionStorage.removeItem(key); const nextKey = crypto.randomUUID(); sessionStorage.setItem(key + ":key", nextKey); requestKey.current = nextKey; }
    catch { setStorageReady(false); setError("Stock was confirmed successfully. Request storage is now unavailable; reopen the form before recording another movement."); }
    Promise.resolve().then(() => onSaved?.(record)).catch(() => setError("Stock was recorded successfully. Refresh the list to load its latest state."));
  };
  const confirm = async () => {
    if (lock.current || !online || !storageReady || (!pending && !plan)) return;
    lock.current = true; setBusy(true); setError("");
    try { success(await submitPersisted({ storage: sessionStorage, key, payload: { ...payload(), previewFingerprint: plan?.fingerprint }, createKey: () => requestKey.current, send: confirmStockAction })); }
    catch (failure) { setError(apiErrorMessage(failure)); try { setPending(pendingSubmission(sessionStorage, key)); } catch { setStorageReady(false); } }
    finally { lock.current = false; setBusy(false); }
  };
  const recover = async () => {
    if (lock.current) return; lock.current = true; setBusy(true);
    try { const saved = await findStockAction(requestKey.current); if (saved) success(saved); else setError("No saved result was found yet. Retry the exact request or review again with the retained key."); }
    catch (failure) { setError(apiErrorMessage(failure)); } finally { lock.current = false; setBusy(false); }
  };
  const types = kind === "waste" ? ["WASTE", "DAMAGED"] : initialType === "STOCK_IN" ? ["STOCK_IN", ...(canApprove ? ["ADJUSTMENT"] : [])] : ["STOCK_OUT", "WASTE", "DAMAGED", ...(canApprove ? ["ADJUSTMENT"] : [])];
  return <div ref={root} {...guard.capture} className="min-w-0 space-y-4">
    {result && <p role="status" className="rounded-xl border border-emerald-400/25 p-3 text-sm text-emerald-200">Recorded {result.transactionNumber || result.reference}: {q(result.stockBefore, result.sourceDetails?.baseUnit || result.item?.unit)} → {q(result.stockAfter, result.sourceDetails?.baseUnit || result.item?.unit)}. This is the confirmed physical balance.</p>}
    {!online && <p role="alert" className="text-sm text-amber-200">Offline. No stock action will be submitted.</p>}
    {!storageReady && <p role="alert" className="text-sm text-amber-200">Safe request storage is unavailable. Reopen this form with session storage enabled before recording stock.</p>}
    {error && <p role="alert" className="break-words text-sm text-red-200">{error}</p>}
    {pending && <section className="space-y-3 rounded-xl border border-amber-400/30 p-4"><h3 className="font-semibold text-amber-200">Stock confirmation needs checking</h3><p className="text-sm text-neutral-300">Your exact {humanize(pending.movementType)} request is retained. Check its result before recording this movement again.</p><div className="flex flex-wrap gap-2"><Button disabled={busy || !online} onClick={recover}>Check saved stock result</Button><Button variant="secondary" disabled={busy || !online} onClick={() => setOpen(true)}>Retry exact stock confirmation</Button><Button variant="secondary" disabled={busy} onClick={() => { sessionStorage.removeItem(key); setPending(null); setPlan(null); setOpen(false); setError("Review again with the same retained request key. A late prior success will be recovered or reported as a conflict."); }}>Review again with same key</Button></div></section>}
    <form onSubmit={review} aria-label="Stock action form" aria-busy={busy} className="space-y-4">
      <fieldset disabled={busy || Boolean(pending)} className="min-w-0 space-y-4">
        <Field label="Stock action"><DarkSelect aria-label="Stock action" className={inputClass} value={movementType} onChange={event => { setMovementType(event.target.value); setPlan(null); setError(""); }}>{types.map(type => <option key={type} value={type}>{humanize(type)}</option>)}</DarkSelect></Field>
        {inbound && <p className="rounded-xl border border-blue-400/25 p-3 text-sm text-blue-100">Receive deliveries outside a purchase order here. For an existing purchase order, <Link className="underline" href="/inventory/purchase-orders">use its Receive action</Link> to keep receipt and invoice quantities linked.</p>}
        <InventoryItemPicker value={form.item} onChange={(id, item) => { edit({ item: id, supplier: item.supplier?._id || item.supplier || "", expiryDate: "" }); }} onResolved={setSelected} disabled={busy || Boolean(pending)}/>
        {selected && <p className="rounded-xl border border-white/10 p-3 text-sm text-neutral-200">Physical stock: {q(selected.currentStock, selected.unit)} · Usable: {q(selected.saleableStock, selected.unit)}{inbound && <span className="mt-1 block">1 {selected.purchaseUnit || selected.unit} = {q(selected.purchaseConversionFactor || 1, selected.unit)}</span>}</p>}
        <Field label={adjustment ? "New exact physical balance" : inbound ? `Receive quantity (${selected?.purchaseUnit || selected?.unit || "purchase unit"})` : `Quantity to deduct (${selected?.unit || "base unit"})`} hint={adjustment ? "Enter the verified final balance, not the difference." : "The server verifies quantities and balances before confirmation."}><input required type="number" inputMode="decimal" min={adjustment ? "0" : "0.000001"} max="1000000000" step="any" className={inputClass} value={form.quantity} onChange={event => edit({ quantity: event.target.value })}/></Field>
        {kind === "waste" ? <Field label="Loss reason"><DarkSelect aria-label="Loss reason" className={inputClass} value={form.reasonCode} onChange={event => edit({ reasonCode: event.target.value })}>{["SPOILED", "EXPIRED", "BROKEN", "DAMAGED_PACKAGE", "SPILLAGE", "OVERCOOKED", "OTHER"].map(reason => <option key={reason} value={reason}>{humanize(reason)}</option>)}</DarkSelect></Field> : <Field label="Reason"><input required maxLength={160} className={inputClass} value={form.reason} onChange={event => edit({ reason: event.target.value })}/></Field>}
        {inbound && selected?.tracksExpiry && <Field label="Expiry date (required)"><DarkDatePicker aria-label="Expiry date" value={form.expiryDate} onChange={event => edit({ expiryDate: event.target.value })}/></Field>}
        {inbound && <Field label={`Cost per ${selected?.purchaseUnit || selected?.unit || "purchase unit"} (SAR, optional)`} hint="Leave blank to retain the existing cost behaviour. Historical lots are never repriced."><input type="number" min="0" step="any" className={inputClass} value={form.unitCost} onChange={event => edit({ unitCost: event.target.value })}/></Field>}
        {canApprove && kind !== "waste" && !inbound && <label className="flex gap-3 rounded-xl border border-red-400/25 p-3 text-sm text-red-200"><input type="checkbox" checked={form.allowNegativeStock} onChange={event => edit({ allowNegativeStock: event.target.checked })}/>Explicitly allow a negative balance for an authorized correction</label>}
        <details className="rounded-xl border border-white/10 p-3"><summary className="min-h-9 cursor-pointer text-sm text-neutral-200">More details (optional)</summary><div className="mt-3 space-y-4">
          {inbound && <><Field label="Supplier"><DarkSelect aria-label="Supplier" className={inputClass} value={form.supplier} onChange={event => edit({ supplier: event.target.value })}><option value="">Item default / no supplier</option>{suppliers.map(supplier => <option key={supplier._id} value={supplier._id}>{supplier.name}</option>)}</DarkSelect></Field>{supplierError && <p role="alert" className="text-sm text-red-200">{supplierError} <button type="button" onClick={loadSuppliers} className="underline">Retry suppliers</button></p>}<Field label="Batch / lot number"><input maxLength={120} className={inputClass} value={form.lotNumber} onChange={event => edit({ lotNumber: event.target.value })}/></Field><Field label="Received date and time (Asia/Riyadh)"><input type="datetime-local" className={inputClass} value={form.receivedAt} onChange={event => edit({ receivedAt: event.target.value })}/></Field></>}
          {kind === "waste" && <Field label="Recorded date and time (Asia/Riyadh)"><input type="datetime-local" className={inputClass} value={form.occurredAt} onChange={event => edit({ occurredAt: event.target.value })}/></Field>}
          <Field label="Notes"><textarea maxLength={500} className={textareaClass} value={form.notes} onChange={event => edit({ notes: event.target.value })}/></Field>
        </div></details>
      </fieldset>
      <Button type="submit" className="w-full" disabled={busy || !online || !storageReady || Boolean(pending) || !selected || selected._id !== form.item}>{busy ? "Checking…" : "Review stock change"}</Button>
    </form>
    <DeliveryDialog open={open} onClose={() => setOpen(false)} title="Confirm stock change" centered busy={busy}>
      {pending ? <p className="text-sm text-neutral-200">Retry the exact saved {humanize(pending.movementType)} request with its original details and key.</p> : plan && <div className="space-y-3 text-sm"><h3 className="break-words font-semibold">{plan.name}</h3><p>{humanize(plan.movementType)}: {q(plan.enteredQuantity, plan.purchaseUnit)}{plan.purchaseUnit !== plan.unit && ` = ${q(plan.baseQuantity, plan.unit)}`}</p><p className="text-lg font-semibold text-dune-amber">Physical: {q(plan.stockBefore, plan.unit)} → {q(plan.stockAfter, plan.unit)}</p><p className="text-neutral-300">Expected balance after this change. The server rechecks stock and batch evidence when you confirm. Usable stock may differ because expiry and quality rules still apply.</p></div>}
      <p className="text-xs text-neutral-400">Review does not change stock. Confirmation uses the existing stock ledger and batch allocation rules.</p>
      {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
      <Button className="w-full" disabled={busy || !online || !storageReady} onClick={confirm}>{busy ? "Confirming…" : "Confirm stock change"}</Button><Button variant="secondary" className="w-full" disabled={busy} onClick={() => setOpen(false)}>Go back</Button>
    </DeliveryDialog>
  </div>;
}
