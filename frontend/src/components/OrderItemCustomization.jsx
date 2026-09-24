const SPICE_LABELS = {
  "no-spice": "No Spice",
  mild: "Mild",
  medium: "Medium",
  hot: "Hot",
};

export const getOrderItemCustomizationParts = (item = {}) => {
  const parts = [];
  if (Array.isArray(item.selectedAddOns) && item.selectedAddOns.length) {
    parts.push(`Add-ons: ${item.selectedAddOns.map((addOn) => addOn.name ? `${addOn.name}${(addOn.quantity || 1) > 1 ? ` ×${addOn.quantity}` : ""}` : "").filter(Boolean).join(", ")}`);
  }
  if (item.spiceLevel) parts.push(`Spice: ${SPICE_LABELS[item.spiceLevel] || item.spiceLevel}`);
  if (item.itemNote) parts.push(`Note: ${item.itemNote}`);
  return parts;
};

export default function OrderItemCustomization({ item, className = "" }) {
  const parts = getOrderItemCustomizationParts(item);
  if (!parts.length) return null;

  return (
    <div className={`mt-1 space-y-0.5 text-[11px] leading-4 text-neutral-500 ${className}`}>
      {parts.map((part) => <p key={part}>{part}</p>)}
    </div>
  );
}
