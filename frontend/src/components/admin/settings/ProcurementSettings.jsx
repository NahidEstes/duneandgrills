"use client";

import { Field, SettingsCard, Toggle, settingsInputClass } from "./settingsUi.jsx";
import { Landmark } from "lucide-react";

const fields = [
  ["purchaseApprovalThreshold", "Admin approval threshold (SAR)"],
  ["overReceiveTolerancePercent", "Over-receive tolerance (%)"],
  ["invoiceQuantityTolerancePercent", "Invoice quantity tolerance (%)"],
  ["invoicePriceTolerancePercent", "Invoice price tolerance (%)"],
  ["invoicePriceToleranceAmount", "Invoice price tolerance (SAR)"],
  ["largePaymentThreshold", "Large payment threshold (SAR)"],
  ["priceAlertPercent", "Price alert threshold (%)"],
  ["priceAlertAmount", "Price alert threshold (SAR)"],
];

export default function ProcurementSettings({ value, onChange }) {
  const update = (key, next) => onChange({ ...value, [key]: next });
  return <SettingsCard icon={Landmark} title="Purchasing & Payables" description="Server-enforced approval, receiving, invoice matching and price-alert policy."><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{fields.map(([key, label]) => <Field key={key} label={label}><input type="number" min="0" step="0.01" value={value[key]} onChange={(event) => update(key, event.target.value)} className={`${settingsInputClass} mt-2`} /></Field>)}</div><div className="mt-5"><Toggle checked={Boolean(value.blockPriceIncrease)} onChange={(checked) => update("blockPriceIncrease", checked)} label="Block unusual purchase-price increases" description="When disabled, unusual increases remain informational warnings." /></div></SettingsCard>;
}
