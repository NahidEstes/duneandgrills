// The existing POS preview calculation, shared by the sale panel and display.
// The backend remains authoritative when completing a sale.
export function calculatePosBill(sale, discount) {
  const items = sale.map((line) => ({
    name: line.name,
    quantity: line.quantity,
    unitPrice: Number(line.price),
    lineTotal: Number(line.price) * line.quantity,
  }));
  const subtotal = items.reduce((sum, line) => sum + line.lineTotal, 0);
  const safeDiscount = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  return { items, subtotal, discount: safeDiscount, total: Math.max(0, subtotal - safeDiscount) };
}
