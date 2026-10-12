import { addLine, lineFor, money } from './cart';
import type { CartLine, Product } from './types';
export type RepeatedLine = { _id: string; productType: string; name?: string; price: number; quantity: number; selectedAddOns: { _id: string; quantity: number }[]; spiceLevel: string; note?: string };
export function repeatPlan(rows: RepeatedLine[], products: Product[], cart: CartLine[], replace: boolean, serverWarnings: string[] = []) {
  let lines = replace ? [] : [...cart]; let added = 0; const warnings = [...serverWarnings];
  for (const row of rows) {
    const product = products.find(p => p._id === row._id && p.productType === row.productType);
    try {
      if (!product) throw new Error(`${row.name || 'An item'} is no longer available.`);
      // Historical item/customer notes are deliberately not carried over.
      const fresh = lineFor(product, { selectedAddOns: (row.selectedAddOns || []).map(a => ({ id: a._id, quantity: a.quantity })), spiceLevel: row.spiceLevel || '', note: '' }, row.quantity);
      const next = addLine(lines, fresh);
      if (fresh.unitPrice !== row.price) warnings.push(`${product.name}: current price ${money(fresh.unitPrice)}. Review before ordering.`);
      lines = next; added += row.quantity;
    } catch (error) { warnings.push(`${product?.name || row.name || 'Item'}: ${error instanceof Error ? error.message : 'Options changed; choose this item again from the menu.'}`); }
  }
  return { lines: added ? lines : cart, added, warnings };
}
