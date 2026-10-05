// The existing POS preview calculation, shared by the sale panel and display.
// The backend remains authoritative when completing a sale.
export function calculatePosBill(sale, discount) {
  const items = sale.map((line) => ({
    name: line.name,
    quantity: line.quantity,
    unitPrice: Number(line.price),
    lineTotal: Number(line.price) * line.quantity,
    selectedAddOns: (line.customization?.selectedAddOns || []).map((entry) => ({ name: entry.name, quantity: Number(entry.quantity || 1) })),
    spiceLevel: line.customization?.spiceLevel || "",
    note: line.customization?.note || "",
  }));
  const subtotal = items.reduce((sum, line) => sum + line.lineTotal, 0);
  const type = discount?.type === "percentage" ? "percentage" : "fixed";
  const value = typeof discount === "object" ? Number(discount.value) || 0 : Number(discount) || 0;
  const calculated = type === "percentage" ? subtotal * Math.min(100, Math.max(0, value)) / 100 : value;
  const safeDiscount = Number(Math.min(Math.max(calculated, 0), subtotal).toFixed(2));
  return { items, subtotal, discount: safeDiscount, total: Math.max(0, subtotal - safeDiscount) };
}
