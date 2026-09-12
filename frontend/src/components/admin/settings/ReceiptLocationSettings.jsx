"use client";

import { MapPin, ReceiptText } from "lucide-react";
import { Field, SettingsCard, settingsInputClass } from "./settingsUi.jsx";

export function ReceiptSettings({ value, onChange }) {
  const update = (field, nextValue) => onChange({ ...value, [field]: nextValue });
  return <SettingsCard icon={ReceiptText} title="Receipt" description="Presentation details used by POS receipts and printable order invoices.">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Restaurant display name"><input required maxLength="120" value={value.displayName} onChange={(event) => update("displayName", event.target.value)} className={`${settingsInputClass} mt-2`} /></Field>
      <Field label="Receipt header"><input maxLength="160" value={value.header} onChange={(event) => update("header", event.target.value)} className={`${settingsInputClass} mt-2`} /></Field>
      <Field label="Website URL"><input type="url" maxLength="500" value={value.websiteUrl} onChange={(event) => update("websiteUrl", event.target.value)} className={`${settingsInputClass} mt-2`} /></Field>
      <Field label="Logo URL (optional)"><input type="url" maxLength="1000" value={value.logoUrl} onChange={(event) => update("logoUrl", event.target.value)} className={`${settingsInputClass} mt-2`} /></Field>
      <Field label="Receipt footer / thank-you message"><textarea rows="3" maxLength="500" value={value.footer} onChange={(event) => update("footer", event.target.value)} className={`${settingsInputClass} mt-2 h-auto resize-y py-3 sm:col-span-2`} /></Field>
    </div>
    <p className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 p-3 text-xs leading-5 text-neutral-500">Receipt address, phone and email use the shared Location &amp; Contact values below, preventing duplicated contact information.</p>
  </SettingsCard>;
}

export function LocationSettings({ value, onChange }) {
  const update = (field, nextValue) => onChange({ ...value, [field]: nextValue });
  return <SettingsCard icon={MapPin} title="Location & Contact" description="Public restaurant details used by Visit Us and printable receipts.">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Restaurant address"><input maxLength="300" value={value.address} onChange={(event) => update("address", event.target.value)} className={`${settingsInputClass} mt-2`} /></Field>
      <Field label="City"><input maxLength="100" value={value.city} onChange={(event) => update("city", event.target.value)} className={`${settingsInputClass} mt-2`} /></Field>
      <Field label="Country"><input maxLength="100" value={value.country} onChange={(event) => update("country", event.target.value)} className={`${settingsInputClass} mt-2`} /></Field>
      <Field label="Contact phone"><input type="tel" maxLength="40" value={value.phone} onChange={(event) => update("phone", event.target.value)} className={`${settingsInputClass} mt-2`} /></Field>
      <Field label="WhatsApp number"><input type="tel" maxLength="40" value={value.whatsapp} onChange={(event) => update("whatsapp", event.target.value)} className={`${settingsInputClass} mt-2`} /></Field>
      <Field label="Contact email"><input type="email" maxLength="200" value={value.email} onChange={(event) => update("email", event.target.value)} className={`${settingsInputClass} mt-2`} /></Field>
      <Field label="Google Maps / directions URL"><input type="url" maxLength="1000" value={value.directionsUrl} onChange={(event) => update("directionsUrl", event.target.value)} className={`${settingsInputClass} mt-2 sm:col-span-2`} /></Field>
    </div>
  </SettingsCard>;
}
