"use client";
import { withLocale } from "../i18n/LocaleProvider.jsx";
import { t, catalogText } from "../i18n/core.js";

const SPICE_LABELS = {
  "no-spice": "No Spice",
  mild: "Mild",
  medium: "Medium",
  hot: "Hot"
};

export const getOrderItemCustomizationParts = (item = {}) => {
  const parts = [];
  if (Array.isArray(item.selectedAddOns) && item.selectedAddOns.length) {
    parts.push(t("Add-ons: {0}", [item.selectedAddOns.map((addOn) => addOn.name ? `${catalogText(addOn)}${(addOn.quantity || 1) > 1 ? ` ×${addOn.quantity}` : ""}` : "").filter(Boolean).join(", ")]));
  }
  if (item.spiceLevel) parts.push(t("Spice: {0}", [t(SPICE_LABELS[item.spiceLevel] || item.spiceLevel)]));
  if (item.itemNote) parts.push(t("Note: {0}", [item.itemNote]));
  return parts;
};

function OrderItemCustomization({ item, className = "" }) {
  const parts = getOrderItemCustomizationParts(item);
  if (!parts.length) return null;

  return (
    <div className={`mt-1 space-y-0.5 text-[11px] leading-4 text-neutral-500 ${className}`}>
      {parts.map((part) => <p key={part}>{t(part)}</p>)}
    </div>);

}

export default withLocale(OrderItemCustomization);
