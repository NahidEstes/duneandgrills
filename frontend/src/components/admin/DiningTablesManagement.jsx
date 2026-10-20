"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDiningTables, fetchTableQr, saveDiningTable } from "@/src/api/api.js";
import { printDiningTableQr } from "@/src/utils/adminExports.js";
import { StaffDialog, inputClass, panelClass } from "./staff/staffUi.jsx";

const button = "min-h-11 rounded-xl border border-dune-amber/30 px-4 text-sm font-semibold text-dune-amber disabled:opacity-50";
const empty = { code: "", name: "", isActive: true };
export default function DiningTablesManagement() {
  const [tables, setTables] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [editing, setEditing] = useState(null), [form, setForm] = useState(empty), [saving, setSaving] = useState(false), [qr, setQr] = useState(null), [qrLoading, setQrLoading] = useState("");
  const [formError, setFormError] = useState("");
  const lock = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setTables(await fetchDiningTables()); } catch (error) { setError(error.response?.data?.message || "Unable to load tables. Please retry."); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const edit = table => { setQr(null); setEditing(table || { create: true }); setForm(table ? { code: table.code, name: table.name, isActive: table.isActive } : empty); setFormError(""); };
  const save = async event => {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setSaving(true); setFormError("");
    try { await saveDiningTable(editing._id, form); setEditing(null); await load(); }
    catch (error) { setFormError(error.response?.data?.message || "Unable to save table. Your changes have been kept."); }
    finally { lock.current = false; setSaving(false); }
  };
  const showQr = async table => {
    if (qrLoading) return;
    setQrLoading(table._id); setError("");
    try {
      const value = await fetchTableQr(table._id);
      const url = new URL(value.path, window.location.origin).href;
      const QRCode = (await import("qrcode")).default;
      const image = await QRCode.toDataURL(url, { width: 420, margin: 4, errorCorrectionLevel: "M" });
      setQr({ ...value, url, image });
    } catch (error) { setError(error.response?.data?.message || "Unable to generate this QR code."); }
    finally { setQrLoading(""); }
  };
  return <div className="space-y-4"><div className="flex flex-wrap gap-3"><button type="button" className={button} onClick={() => edit(null)}>Add table</button><button type="button" className={button} onClick={load}>Refresh tables</button></div>
    {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}{loading ? <p role="status" className="text-neutral-400">Loading tables…</p> : !error && <>{!tables.length && <p className={`${panelClass} p-8 text-center text-neutral-400`}>No tables yet. Add a table to generate its QR code.</p>}<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{tables.map(table => <article key={table._id} className={`${panelClass} space-y-3 p-4`}><h2 className="font-semibold text-white">Table {table.code} · {table.name}</h2><p className={`text-xs ${table.isActive ? "text-emerald-300" : "text-neutral-500"}`}>{table.isActive ? "Active" : "Inactive"}</p><div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => edit(table)} aria-label={`Edit table ${table.code}`}>Edit</button><button type="button" className={button} disabled={!!qrLoading} onClick={() => showQr(table)} aria-label={`QR code for table ${table.code}`}>{qrLoading === table._id ? "Generating…" : "View QR"}</button></div></article>)}</div></>}
    <StaffDialog open={!!editing} onClose={() => { if (!saving) setEditing(null); }} title={editing?.create ? "Add dining table" : "Edit dining table"} maxWidth="max-w-lg"><form onSubmit={save}><fieldset disabled={saving} className="space-y-4"><label className="block text-sm text-neutral-300">Table code<input required pattern="[A-Za-z0-9-]+" maxLength={20} className={`${inputClass} mt-2 uppercase`} value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} placeholder="T-01" /></label><label className="block text-sm text-neutral-300">Table name<input required maxLength={80} className={`${inputClass} mt-2`} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Window table" /></label><label className="flex min-h-11 items-center gap-3 text-sm text-neutral-300"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} className="accent-amber-500" />Active for QR ordering</label><p className="text-xs text-neutral-500">Deactivating a table blocks new QR orders. Existing orders keep their original table details.</p>{formError && <p role="alert" className="text-sm text-amber-300">{formError}</p>}<button className={button} disabled={saving}>{saving ? "Saving…" : "Save table"}</button></fieldset></form></StaffDialog>
    <StaffDialog open={!!qr} onClose={() => setQr(null)} title={qr ? `QR code · Table ${qr.code}` : "Table QR code"} maxWidth="max-w-lg">{qr && <div className="space-y-4 text-center">{/* QR generation stays local; no external QR service receives table links. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr.image} alt={`Ordering QR code for table ${qr.code}`} width={300} height={300} className="mx-auto max-w-full rounded-xl" />
      {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}<p className="text-sm text-neutral-300">{qr.name} · {qr.isActive ? "Scan to view the menu and order at this table." : "Inactive: this QR code cannot place new table orders."}</p><a href={qr.url} target="_blank" rel="noopener noreferrer" className="block break-all text-xs text-dune-amber underline">Open table menu</a><div className="flex flex-wrap justify-center gap-3"><a href={qr.image} download={`table-${qr.code}-qr.png`} className={`${button} inline-flex items-center`}>Download QR</a><button type="button" className={button} onClick={() => { if (!printDiningTableQr(qr)) setError("Allow pop-ups to print the table QR code."); }}>Print QR</button></div></div>}</StaffDialog>
  </div>;
}
