"use client";
import { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { useAuth } from "../../../context/AuthContext.jsx";
import { saveRiderDeliverySetting } from "../../../api/deliveryApi.js";
import { SettingsCard, Toggle } from "./settingsUi.jsx";

export default function RiderDeliverySettings({ value, onSaved }) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(value.enabled), [pending, setPending] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => { setEnabled(value.enabled); }, [value.enabled, value.revision]);
  const save = async () => {
    if (pending || user?.role !== "admin") return;
    setPending(true); setError(""); setMessage("");
    try {
      const updated = await saveRiderDeliverySetting({ enabled, expectedRevision: value.revision });
      onSaved(updated); setMessage(updated.enabled ? "Delivery riders enabled." : "Delivery riders disabled. Existing records are preserved.");
    } catch (error) { setError(error.response?.data?.message || "Delivery setting was not saved. Reload settings before retrying."); }
    finally { setPending(false); }
  };
  return <SettingsCard icon={Truck} title="Delivery Rider" description="Private restaurant-rider workflow. Only an administrator can activate or disable it.">
    <div className="space-y-4">
      <Toggle label="Enable delivery rider" description="Availability, manual assignment, pickup, delivery and cashier cash confirmation." checked={enabled} onChange={next => { setEnabled(next); setMessage(""); }} disabled={pending || user?.role !== "admin"} />
      <p className="text-xs leading-5 text-neutral-400">Saved status: {value.enabled ? "Enabled" : "Disabled"}. Disabled blocks delivery actions; it never deletes deliveries or payments. Website checkout options are unchanged. Availability does not auto-assign orders.</p>
      {user?.role === "admin" && <button type="button" onClick={save} disabled={pending || enabled === value.enabled} className="min-h-11 rounded-xl bg-dune-amber px-4 text-sm font-semibold text-black disabled:opacity-40">{pending ? "Saving…" : "Save Rider Setting"}</button>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}{message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
      <a href="/admin/deliveries" className="block text-sm text-dune-amber underline">Open Delivery Management</a>
    </div>
  </SettingsCard>;
}
