"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/src/context/AuthContext.jsx";
import { previewProduction, confirmProduction, findProductionRequest } from "@/src/api/inventoryApi.js";
import { submitPersisted, pendingSubmission, submissionStorageKey } from "@/src/utils/persistedSubmission.js";
import { usePageFormChanges } from "../ui/useDialogChanges.js";
import DeliveryDialog from "../admin/delivery/DeliveryDialog.jsx";
import DarkSelect from "../ui/DarkSelect.jsx";
import DarkDatePicker from "../ui/DarkDatePicker.jsx";
import { preparationQuantityLabel as formatQuantity, preparationUnits } from "@/src/utils/preparationUnits.js";
import { Badge, Button, Field, PageHeader, cardClass, inputClass, textareaClass } from "./InventoryUI.jsx";
import { apiErrorMessage, formatSar } from "./inventoryUtils.js";

const riyadhInput = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 16);
export default function ProductionForm({ recipes, items, blocked, onCancel, onSaved }) {
  const { user } = useAuth(), root = useRef(null), lock = useRef(false), requestKey = useRef(null);
  const [draft, setDraft] = useState({ recipe: "", multiplier: "1", actualQuantity: "", outputUnit: "", ingredients: [], preparedAt: riyadhInput(), expiryDate: "", notes: "" });
  const [plan, setPlan] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [open, setOpen] = useState(false), [pending, setPending] = useState(null), [online, setOnline] = useState(true);
  const [storageReady, setStorageReady] = useState(false);
  const storageKey = submissionStorageKey("production", user?._id || user?.id);
  const guard = usePageFormChanges({ open: true, rootRef: root, onClose: onCancel, resetKey: storageKey });
  useEffect(() => {
    setStorageReady(false);
    try {
      const old = pendingSubmission(sessionStorage, storageKey);
      requestKey.current = old?.idempotencyKey || sessionStorage.getItem(storageKey + ":key") || crypto.randomUUID();
      sessionStorage.setItem(storageKey + ":key", requestKey.current); setPending(old); setStorageReady(true);
    } catch (failure) { setError(failure.message); }
    const update = () => setOnline(navigator.onLine); update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, [storageKey]);
  const recipe = recipes.find(row => row._id === draft.recipe), itemFor = id => items.find(item => item._id === id);
  const finished = itemFor(recipe?.finishedItem);
  const edit = values => { setDraft(current => ({ ...current, ...values })); setPlan(null); setError(""); };
  const recipeValues = (selected, multiplier) => selected ? { recipe: selected._id, expectedVersion: selected.version, multiplier, outputUnit: selected.outputUnit, actualQuantity: String(Number(selected.outputQuantity) * Number(multiplier || 1)), ingredients: selected.ingredients.map(line => ({ inventoryItem: String(line.inventoryItem), quantity: String(Number(line.enteredQuantity) * Number(multiplier || 1)), unit: line.enteredUnit })) } : { recipe: "", ingredients: [], multiplier, actualQuantity: "", outputUnit: "" };
  const payload = () => ({ ...draft, preparedAt: new Date(draft.preparedAt + ":00+03:00").toISOString(), expiryDate: draft.expiryDate ? draft.expiryDate + "T12:00:00+03:00" : null });
  const review = async event => {
    event.preventDefault(); if (lock.current || blocked || !online || pending || !storageReady) return;
    lock.current = true; setBusy(true); setError("");
    try { const next = await previewProduction(payload()); setPlan(next); if (next.canConfirm) setOpen(true); else setError("Insufficient usable stock. Review the ingredient availability below."); }
    catch (failure) { setError(apiErrorMessage(failure)); }
    finally { lock.current = false; setBusy(false); }
  };
  const success = record => { sessionStorage.removeItem(storageKey + ":key"); sessionStorage.removeItem(storageKey); onSaved(record._id); };
  const submit = async () => {
    if (lock.current || !online || blocked || !storageReady || (!pending && !plan?.canConfirm) || !requestKey.current) return;
    lock.current = true; setBusy(true); setError("");
    try { success(await submitPersisted({ storage: sessionStorage, key: storageKey, payload: { ...payload(), previewFingerprint: plan?.fingerprint }, createKey: () => requestKey.current, send: confirmProduction })); }
    catch (failure) { setError(apiErrorMessage(failure)); try { setPending(pendingSubmission(sessionStorage, storageKey)); } catch { setStorageReady(false); } }
    finally { lock.current = false; setBusy(false); }
  };
  const recover = async () => {
    if (lock.current) return; lock.current = true; setBusy(true);
    try { const saved = await findProductionRequest(requestKey.current); if (saved) success(saved); else setError("No saved result found yet. Retry the exact confirmation or review again using the retained request key. A new duplicate request will not be created."); }
    catch (failure) { setError(apiErrorMessage(failure)); } finally { lock.current = false; setBusy(false); }
  };
  return <div ref={root} {...guard.capture}>
    <PageHeader descriptionClassName="!text-neutral-400" title="Record Production" description="Record ingredients used and finished stock produced. Dates and times use Asia/Riyadh."/>
    {!storageReady && <p role="alert" className="mb-4 text-sm text-amber-200">Safe request storage is unavailable. Enable session storage and reopen this form before confirming production.</p>}
    {!recipes.some(row => row.isActive) && <p className="mb-4 text-sm text-neutral-300">No active preparation recipes. <Link className="text-dune-amber underline" href="/inventory/preparation-recipes">Manage preparation recipes</Link> before recording production.</p>}
    {!online && <p role="alert" className="mb-4 text-amber-200">Offline. Production cannot be previewed or confirmed.</p>}
    {pending && <aside className={`${cardClass} mb-5 space-y-3 p-4`}><h2 className="font-body font-semibold text-amber-200">Confirmation outcome needs checking</h2><p className="text-sm text-neutral-300">Your exact confirmation and request key were retained. Do not record this batch again with a new key.</p><div className="flex flex-wrap gap-2"><Button disabled={busy || !online} onClick={recover}>Check saved result</Button><Button variant="secondary" disabled={busy || !online} onClick={() => setOpen(true)}>Retry exact confirmation</Button><Button variant="secondary" disabled={busy} onClick={() => { sessionStorage.removeItem(storageKey); setPending(null); setPlan(null); setOpen(false); setError("Review again with the same retained request key. If a prior request succeeded, check its saved result."); }}>Review again with same key</Button></div></aside>}
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-500/5 p-4 text-sm text-red-200">{error}</p>}
    <form onSubmit={review} aria-busy={busy} className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(290px,1fr)]">
      <div className={`${cardClass} min-w-0 space-y-5 p-4 sm:p-6`}><fieldset disabled={busy || blocked || Boolean(pending)} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Preparation recipe"><DarkSelect aria-label="Preparation recipe" required className={inputClass} value={draft.recipe} onChange={event => edit(recipeValues(recipes.find(row => row._id === event.target.value), draft.multiplier))}><option value="">Select preparation</option>{recipes.filter(row => row.isActive).map(row => <option key={row._id} value={row._id}>{row.name} · v{row.version}</option>)}</DarkSelect></Field><Field label="Batch multiplier" hint="Changing this resets actual quantities to the recipe's expected values."><input required type="number" step="any" min="0.000001" inputMode="decimal" className={inputClass} value={draft.multiplier} onChange={event => edit(recipeValues(recipe, event.target.value))}/></Field></div>
        <p className="text-sm text-neutral-300">Expected yield: {recipe ? `${formatQuantity(recipe.outputQuantity * Number(draft.multiplier || 0))} ${recipe.outputUnit}` : "Select a recipe"}</p>
        <section className="space-y-3"><h2 className="font-body text-lg font-semibold text-white">Ingredients used</h2>{draft.ingredients.map((line, index) => <div key={line.inventoryItem} className="grid grid-cols-[minmax(0,1fr)_90px] gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-[minmax(0,1fr)_120px_80px]"><div className="col-span-2 sm:col-span-1"><p className="text-sm font-medium text-white">{itemFor(line.inventoryItem)?.name || "Unavailable ingredient"}</p><p className="mt-1 text-xs text-neutral-400">Expected: {formatQuantity((recipe?.ingredients[index]?.quantity || 0) * Number(draft.multiplier || 0))} {itemFor(line.inventoryItem)?.unit}</p></div><Field label={`Actual quantity ${index + 1}`}><input required type="number" min="0.000001" step="any" inputMode="decimal" className={inputClass} value={line.quantity} onChange={event => edit({ ingredients: draft.ingredients.map((row, offset) => offset === index ? { ...row, quantity: event.target.value } : row) })}/></Field><Field label={`Unit ${index + 1}`}><DarkSelect aria-label={`Unit ${index + 1}`} className={inputClass} value={line.unit} onChange={event => edit({ ingredients: draft.ingredients.map((row, offset) => offset === index ? { ...row, unit: event.target.value } : row) })}>{itemFor(line.inventoryItem) && preparationUnits(itemFor(line.inventoryItem)).map(unit => <option key={unit}>{unit}</option>)}</DarkSelect></Field></div>)}</section>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Actual usable finished quantity"><input required type="number" min="0.000001" step="any" inputMode="decimal" className={inputClass} value={draft.actualQuantity} onChange={event => edit({ actualQuantity: event.target.value })}/></Field><Field label="Output unit"><DarkSelect aria-label="Output unit" required className={inputClass} value={draft.outputUnit} onChange={event => edit({ outputUnit: event.target.value })}><option value="">Select unit</option>{finished && preparationUnits(finished).map(unit => <option key={unit}>{unit}</option>)}</DarkSelect></Field><Field label="Prepared on (Asia/Riyadh)"><input required type="datetime-local" className={inputClass} value={draft.preparedAt} onChange={event => edit({ preparedAt: event.target.value })}/></Field><Field label={finished?.tracksExpiry ? "Use by (required)" : "Use by (not expiry-tracked)"}><DarkDatePicker disabled={!finished?.tracksExpiry} aria-label="Use by" value={draft.expiryDate} onChange={event => edit({ expiryDate: event.target.value })}/></Field></div>
        <Field label="Notes (optional)"><textarea aria-label="Notes (optional)" maxLength={2000} className={textareaClass} value={draft.notes} onChange={event => edit({ notes: event.target.value })}/></Field>
      </fieldset><div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" disabled={busy} onClick={guard.requestClose}>Cancel</Button><Button type="submit" disabled={busy || blocked || !online || !storageReady || Boolean(pending)}>{busy ? "Checking…" : "Review & confirm production"}</Button></div></div>
      <aside className={`${cardClass} min-w-0 space-y-4 p-4 sm:p-6`}><h2 className="font-body text-xl font-semibold text-white">Stock Change Preview</h2>{!plan ? <p className="text-sm leading-6 text-neutral-400">Enter actual quantities and review stock changes. Preview and drafts do not change stock. Availability and costs are checked by the server.</p> : <><h3 className="font-body text-sm font-semibold">Raw ingredients</h3>{plan.ingredients.map(line => <div key={line.inventoryItem} className="space-y-1 border-b border-white/10 pb-3 text-sm"><div className="flex justify-between gap-2"><span>{line.name}</span><span className="whitespace-nowrap text-dune-amber">−{formatQuantity(line.quantity)} {line.unit}</span></div><Badge tone={line.sufficient ? "success" : "danger"}>{line.sufficient ? "Stock available" : "Insufficient usable stock"}</Badge><p className="text-xs text-neutral-400">Usable: {formatQuantity(line.available)} {line.unit}</p></div>)}<div className="flex justify-between gap-2 font-semibold text-emerald-300"><span>{plan.finishedName}</span><span>+{formatQuantity(plan.actualQuantity)} {plan.unit}</span></div><p className="text-sm text-amber-200">Yield difference: {formatQuantity(plan.yieldDifference)} {plan.unit} vs expected. No additional stock deduction.</p><p className="text-sm text-neutral-300">Transferred cost: {formatSar(plan.totalCost)}<br/>Finished unit cost: SAR {plan.unitCost} / {plan.unit}</p>{plan.totalCost === 0 && <p className="text-xs text-amber-200">Recorded ingredient costs are zero. Review source costs before interpreting profit.</p>}</>}<p className="border-t border-white/10 pt-4 text-xs leading-6 text-neutral-400">Ingredients are deducted once, only after confirmation succeeds. This creates no purchase, expense or payment.</p></aside>
    </form>
    <DeliveryDialog open={open} onClose={() => setOpen(false)} title="Confirm production" centered busy={busy}>
      <p className="text-sm text-neutral-200">{pending ? "Retry the exact retained production confirmation? Its original recipe, quantities and request key will be used." : `Produce ${formatQuantity(plan?.actualQuantity)} ${plan?.unit || ""} of ${plan?.finishedName || ""}?`}</p><p className="text-sm text-neutral-400">Actual ingredients will be deducted and the finished batch added atomically. Confirm only after preparing the usable finished stock.</p>
      {error && <p role="alert" className="text-sm text-red-200">{error}</p>}<Button className="w-full min-h-12" disabled={busy || !online || blocked || !storageReady} onClick={submit}>{busy ? "Confirming…" : "Confirm production"}</Button><Button className="w-full" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Go back</Button>
    </DeliveryDialog>
  </div>;
}
