import type { CartLine, OrderConfig, Product, Selection, Customer } from './types';
export const money = (amount: number) => `SAR ${Number(amount).toFixed(2)}`;
export const emptySelection = (): Selection => ({ selectedAddOns: [], spiceLevel: '', note: '' });
export const availableAddOns = (product: Product) => [...new Map([
  ...(product.addOns || []), ...(product.customization?.groups || []).flatMap(g => g.addOns),
].map(a => [a._id, a])).values()];
export function selectionError(product: Product, selection: Selection): string {
  if (!product.isAvailable) return `${product.name} is unavailable`;
  if (selection.selectedAddOns.length > 20) return 'Choose at most 20 add-ons';
  if (new Set(selection.selectedAddOns.map(a => a.id)).size !== selection.selectedAddOns.length) return 'Duplicate add-ons';
  if (selection.note.length > 240) return 'Item notes must be at most 240 characters';
  const enabled = product.productType === 'menuItem' && product.customization?.enabled;
  if (!enabled && (selection.selectedAddOns.length || selection.spiceLevel || selection.note)) return 'Customization is no longer available';
  const allowed = availableAddOns(product);
  if (selection.selectedAddOns.some(a => !allowed.some(b => b._id === a.id) || !Number.isInteger(a.quantity) || a.quantity < 1 || a.quantity > 99)) return 'An add-on is unavailable or its quantity is invalid';
  if (enabled) for (const group of product.customization?.groups || []) {
    const count = group.addOns.filter(a => selection.selectedAddOns.some(b => b.id === a._id)).length;
    const max = group.selectionType === 'single' ? 1 : group.maxSelections;
    if (count < group.minSelections || count > max) return `${group.name}: choose ${group.minSelections}–${max} options`;
  }
  if (selection.spiceLevel && (!product.customization?.spice?.enabled || !product.customization.spice.options.includes(selection.spiceLevel))) return 'Spice level is no longer available';
  return '';
}
export function lineFor(product: Product, selection: Selection, quantity: number): CartLine {
  const error = selectionError(product, selection);
  if (error) throw new Error(error);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error('Quantity must be 1–99');
  const normalized = { ...selection, note: selection.note.trim(), selectedAddOns: [...selection.selectedAddOns].sort((a, b) => a.id.localeCompare(b.id)) };
  const key = JSON.stringify([product.productType, product._id, normalized]);
  const addons = availableAddOns(product);
  const unitPrice = Number((product.price + normalized.selectedAddOns.reduce((sum, a) => sum + (addons.find(b => b._id === a.id)?.price || 0) * a.quantity, 0)).toFixed(2));
  return { key, product, selection: normalized, quantity, unitPrice };
}
export function addLine(cart: CartLine[], line: CartLine): CartLine[] {
  const existing = cart.find(c => c.key === line.key);
  if (existing && existing.quantity + line.quantity > 99) throw new Error('Maximum quantity for this selection is 99');
  if (!existing && cart.length >= 100) throw new Error('Maximum 100 product selections per order');
  return existing ? cart.map(c => c.key === line.key ? { ...line, quantity: c.quantity + line.quantity } : c) : [...cart, line];
}
export const subtotal = (cart: CartLine[]) => Number(cart.reduce((s, c) => s + c.quantity * c.unitPrice, 0).toFixed(2));
export const orderItems = (cart: CartLine[]) => cart.map(c => ({ productId: c.product._id, productType: c.product.productType, quantity: c.quantity, customization: c.selection }));
export function revalidateCart(cart: CartLine[], products: Product[]) {
  const lines: CartLine[] = []; const errors: string[] = []; const changes: string[] = [];
  for (const line of cart) {
    const current = products.find(p => p._id === line.product._id && p.productType === line.product.productType);
    try {
      if (!current) throw new Error(`${line.product.name} is no longer available`);
      const fresh = lineFor(current, line.selection, line.quantity);
      if (fresh.unitPrice !== line.unitPrice) changes.push(`${current.name}: ${money(line.unitPrice)} → ${money(fresh.unitPrice)}`);
      lines.push(fresh);
    } catch (error) { errors.push(error instanceof Error ? error.message : 'Catalog changed'); }
  }
  return { lines, errors, changes };
}
export function customerError(customer: Customer) {
  if (!customer.name.trim() || customer.name.trim().length > 100) return 'Enter a name of 1–100 characters';
  if (!/^[+\d][\d\s()-]{5,29}$/.test(customer.phone.trim())) return 'Enter a valid phone number';
  if (customer.email.length > 160 || (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))) return 'Enter a valid email address';
  if (customer.address.length > 500) return 'Address must be at most 500 characters';
  return '';
}
export function checkoutError(cart: CartLine[], customer: Customer, type: 'delivery' | 'pickup', config: OrderConfig, notes: string) {
  if (!config.websiteOrderingEnabled) return 'Ordering is currently unavailable';
  if (!config.paymentOptions.some(p => p.code === 'cod' && p.enabled)) return 'Cash checkout is unavailable';
  if (!config.orderTypes.some(t => t.value === type)) return 'This fulfillment option is unavailable';
  if (!cart.length) return 'Your cart is empty';
  if (cart.length > 100) return 'Maximum 100 product selections per order';
  const itemError = cart.map(l => selectionError(l.product, l.selection)).find(Boolean);
  if (itemError) return itemError;
  const error = customerError(customer); if (error) return error;
  if (type === 'delivery' && !customer.address.trim()) return 'Enter a delivery address';
  if (type === 'delivery' && subtotal(cart) < config.minimumDeliveryOrder) return `Minimum delivery order is ${money(config.minimumDeliveryOrder)}`;
  if (notes.length > 500) return 'Kitchen notes must be at most 500 characters';
  return '';
}
export function passwordError(password: string) {
  return password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password)
    ? '' : 'Use at least 10 characters including uppercase, lowercase, a number and a symbol';
}
