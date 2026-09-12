"use client";

import { BellRing, ChefHat, ShoppingBag } from "lucide-react";
import { Field, SettingsCard, Toggle, settingsInputClass } from "./settingsUi.jsx";

const CHANNELS = [
  ["website", "Website"], ["pos", "POS / Counter"], ["phone", "Phone"],
  ["jahez", "Jahez"], ["hungerstation", "HungerStation"],
];

export function OrdersDeliverySettings({ value, onChange }) {
  const update = (patch) => onChange({ ...value, ...patch });
  return <SettingsCard icon={ShoppingBag} title="Orders & Delivery" description="Server-authoritative delivery pricing, minimum order and sales-channel availability.">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Delivery fee (SAR)"><input type="number" min="0" max="10000" step="0.01" value={value.deliveryFee} onChange={(event) => update({ deliveryFee: event.target.value })} className={`${settingsInputClass} mt-2`} /></Field>
      <Field label="Minimum delivery order (SAR)" hint="Applied to the product subtotal for delivery orders only."><input type="number" min="0" max="100000" step="0.01" value={value.minimumDeliveryOrder} onChange={(event) => update({ minimumDeliveryOrder: event.target.value })} className={`${settingsInputClass} mt-2`} /></Field>
    </div>
    <div className="mt-5"><p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Order channels</p><div className="grid gap-2 sm:grid-cols-2">{CHANNELS.map(([key, label]) => <Toggle key={key} checked={value.channels[key]} onChange={(checked) => update({ channels: { ...value.channels, [key]: checked } })} label={label} description={key === "website" || key === "pos" ? "Enforced by the server for new sales." : "Controls availability for future/manual order entry."} />)}</div></div>
  </SettingsCard>;
}

export function NotificationSettings({ value, onChange }) {
  const update = (patch) => onChange({ ...value, ...patch });
  return <SettingsCard icon={BellRing} title="Notifications" description="Shared polling and alert timing for Admin orders and the Kitchen Display.">
    <div className="grid gap-2 sm:grid-cols-2"><Toggle checked={value.adminSoundEnabled} onChange={(checked) => update({ adminSoundEnabled: checked })} label="Admin order sound" /><Toggle checked={value.kitchenSoundEnabled} onChange={(checked) => update({ kitchenSoundEnabled: checked })} label="Kitchen order sound" /></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-3">
      <Field label="Repeat interval (seconds)"><input type="number" min="2" max="300" value={value.alertRepeatIntervalSeconds} onChange={(event) => update({ alertRepeatIntervalSeconds: event.target.value })} className={`${settingsInputClass} mt-2`} /></Field>
      <Field label="Maximum repeats"><input type="number" min="1" max="500" value={value.maximumAlertRepeats} onChange={(event) => update({ maximumAlertRepeats: event.target.value })} className={`${settingsInputClass} mt-2`} /></Field>
      <Field label="Polling interval (seconds)"><input type="number" min="3" max="60" value={value.pollingIntervalSeconds} onChange={(event) => update({ pollingIntervalSeconds: event.target.value })} className={`${settingsInputClass} mt-2`} /></Field>
    </div>
  </SettingsCard>;
}

export function PreparationSettings({ value, onChange }) {
  return <SettingsCard icon={ChefHat} title="Preparation" description="Default estimate for new orders; individual orders can still override it.">
    <Field label="Default preparation time (minutes)" hint="Existing order-specific estimates are never overwritten."><input type="number" min="1" max="240" value={value.defaultMinutes} onChange={(event) => onChange({ ...value, defaultMinutes: event.target.value })} className={`${settingsInputClass} mt-2 max-w-xs`} /></Field>
  </SettingsCard>;
}
