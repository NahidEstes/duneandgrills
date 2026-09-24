"use client";

import { LoaderCircle, RotateCcw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fetchRestaurantSettings, updateRestaurantSettings } from "../../../api/api.js";
import { RESTAURANT_SETTINGS_UPDATED_EVENT } from "../../../utils/notificationSettings.js";
import BusinessHoursSettings from "./BusinessHoursSettings.jsx";
import { NotificationSettings, OrdersDeliverySettings, PosShiftSettings, PreparationSettings } from "./OrderNotificationSettings.jsx";
import { LocationSettings, ReceiptSettings } from "./ReceiptLocationSettings.jsx";

const editable = (settings) => ({
  timezone: settings.timezone,
  openingHours: settings.openingHours,
  orders: settings.orders,
  notifications: settings.notifications,
  preparation: settings.preparation,
  posShifts: settings.posShifts,
  receipt: settings.receipt,
  location: settings.location,
});

const snapshot = (value) => JSON.stringify(value);

export default function RestaurantSettingsPage({ onDirtyChange }) {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await fetchRestaurantSettings();
      const next = editable(settings);
      setSaved(next);
      setForm(next);
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to load restaurant settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const dirty = useMemo(() => Boolean(form && saved && snapshot(form) !== snapshot(saved)), [form, saved]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    const warn = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async (event) => {
    event.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const updated = await updateRestaurantSettings(form);
      const next = editable(updated);
      setSaved(next);
      setForm(next);
      window.dispatchEvent(new CustomEvent(RESTAURANT_SETTINGS_UPDATED_EVENT, { detail: updated }));
      toast.success("Restaurant settings saved.");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to save restaurant settings.");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (dirty && !window.confirm("Discard all unsaved settings changes?")) return;
    setForm(saved);
  };

  if (loading && !form) return <div className="grid min-h-72 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.025] text-sm text-neutral-500"><span className="flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin text-dune-amber" />Loading restaurant settings…</span></div>;
  if (!form) return <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-6 text-sm text-red-200">Restaurant settings could not be loaded. <button type="button" onClick={load} className="ml-2 font-semibold text-dune-amber">Retry</button></div>;

  return <form onSubmit={save} className="space-y-4">
    <div className="sticky top-3 z-20 flex flex-col gap-3 rounded-2xl border border-white/[0.09] bg-[#0b0f11]/95 p-4 shadow-xl backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
      <div><p className={`text-sm font-semibold ${dirty ? "text-dune-amber" : "text-emerald-400"}`}>{dirty ? "Unsaved changes" : "All changes saved"}</p><p className="mt-0.5 text-xs text-neutral-600">Operational timezone: Asia/Riyadh</p></div>
      <div className="flex gap-2"><button type="button" onClick={reset} disabled={!dirty || saving} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-semibold text-neutral-300 disabled:opacity-40"><RotateCcw className="h-4 w-4" />Reset</button><button type="submit" disabled={!dirty || saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-dune-amber px-5 text-xs font-bold text-black disabled:opacity-40">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? "Saving…" : "Save Settings"}</button></div>
    </div>
    <BusinessHoursSettings value={form.openingHours} onChange={(openingHours) => setForm({ ...form, openingHours })} />
    <div className="grid items-start gap-4 xl:grid-cols-2"><OrdersDeliverySettings value={form.orders} onChange={(orders) => setForm({ ...form, orders })} /><div className="space-y-4"><NotificationSettings value={form.notifications} onChange={(notifications) => setForm({ ...form, notifications })} /><PreparationSettings value={form.preparation} onChange={(preparation) => setForm({ ...form, preparation })} /></div></div>
    <PosShiftSettings value={form.posShifts} onChange={(posShifts) => setForm({ ...form, posShifts })} />
    <div className="grid items-start gap-4 xl:grid-cols-2"><ReceiptSettings value={form.receipt} onChange={(receipt) => setForm({ ...form, receipt })} /><LocationSettings value={form.location} onChange={(location) => setForm({ ...form, location })} /></div>
  </form>;
}
