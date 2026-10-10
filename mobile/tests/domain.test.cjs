const { test } = require('node:test'); const assert = require('node:assert/strict');
const { addLine, lineFor, emptySelection, selectionError, revalidateCart, checkoutError, passwordError, orderItems } = require('../.test-build/domain/cart');
const { terminal, statusLabel } = require('../.test-build/domain/orders');
const addon = { _id: 'a', name: 'Sauce', price: 2 };
const dish = { _id: 'dish', productType: 'menuItem', name: 'Grill', description: '', image: '', category: 'Grills', price: 20, isAvailable: true, addOns: [addon], customization: { enabled: true, spice: { enabled: true, options: ['mild', 'hot'], default: 'mild' }, groups: [{ name: 'Sauce', selectionType: 'multiple', minSelections: 1, maxSelections: 1, addOns: [addon] }] } };
const selected = { selectedAddOns: [{ id: 'a', quantity: 2 }], spiceLevel: 'hot', note: '' };
const config = { websiteOrderingEnabled: true, minimumDeliveryOrder: 30, paymentOptions: [{ code: 'cod', enabled: true }], orderTypes: [{ value: 'delivery', deliveryFee: 10 }, { value: 'pickup', deliveryFee: 0 }] };
const customer = { name: 'Customer', phone: '+966500000000', email: '', address: 'Test street' };
test('customization enforces required groups, min/max, stale options, disabled support and notes', () => {
  assert.match(selectionError(dish, emptySelection()), /choose 1/);
  assert.equal(selectionError(dish, selected), '');
  assert.match(selectionError(dish, { ...selected, selectedAddOns: [{ id: 'gone', quantity: 1 }] }), /unavailable/);
  assert.match(selectionError(dish, { ...selected, spiceLevel: 'fire' }), /Spice/);
  assert.match(selectionError(dish, { ...selected, note: 'n'.repeat(241) }), /240/);
  assert.match(selectionError({ ...dish, productType: 'combo' }, selected), /no longer/);
  const other = { _id: 'b', name: 'Extra', price: 1 };
  const multiple = { ...dish, customization: { enabled: true, groups: [{ ...dish.customization.groups[0], addOns: [addon, other] }] } };
  assert.match(selectionError(multiple, { ...selected, spiceLevel: '', selectedAddOns: [{ id: 'a', quantity: 1 }, { id: 'b', quantity: 1 }] }), /choose 1/);
});
test('cart separates customization, merges deterministically, prices add-on quantity, limits 99', () => {
  const line = lineFor(dish, selected, 1); assert.equal(line.unitPrice, 24);
  let cart = addLine([], line); cart = addLine(cart, line); assert.equal(cart[0].quantity, 2);
  cart = addLine(cart, lineFor(dish, { ...selected, note: 'No onion' }, 1)); assert.equal(cart.length, 2);
  assert.throws(() => addLine([lineFor(dish, selected, 99)], line), /99/);
  assert.throws(() => lineFor(dish, selected, 100), /99/);
  const extras = { ...dish, addOns: [addon, { _id: 'b', name: 'Extra', price: 1 }], customization: { enabled: true } };
  const a = { ...emptySelection(), selectedAddOns: [{ id: 'a', quantity: 1 }, { id: 'b', quantity: 1 }] };
  assert.equal(lineFor(extras, a, 1).key, lineFor(extras, { ...a, selectedAddOns: [...a.selectedAddOns].reverse() }, 1).key);
  assert.deepEqual(JSON.parse(JSON.stringify(cart)), cart);
  assert.equal('price' in orderItems(cart)[0], false);
});
test('catalog revalidation reports price changes and unavailable selections', () => {
  const cart = [lineFor(dish, selected, 2)];
  const result = revalidateCart(cart, [{ ...dish, price: 30 }]); assert.equal(result.lines[0].unitPrice, 34); assert.equal(result.changes.length, 1);
  assert.equal(revalidateCart(cart, []).errors.length, 1);
  assert.equal(revalidateCart(cart, [{ ...dish, isAvailable: false }]).errors.length, 1);
});
test('cart limits product selections to the existing server maximum', () => {
  const cart = Array.from({ length: 100 }, (_, i) => lineFor({ ...dish, _id: `dish-${i}` }, selected, 1));
  assert.throws(() => addLine(cart, lineFor(dish, selected, 1)), /100/);
  assert.equal(addLine(cart, cart[0])[0].quantity, 2);
});
test('checkout validates server ordering, COD, minimum, guest contact, address and note limits', () => {
  const cart = [lineFor(dish, selected, 1)];
  assert.match(checkoutError(cart, customer, 'delivery', config, ''), /Minimum/);
  assert.equal(checkoutError(cart, customer, 'pickup', config, ''), '');
  assert.match(checkoutError(cart, customer, 'pickup', { ...config, websiteOrderingEnabled: false }, ''), /unavailable/);
  assert.match(checkoutError(cart, customer, 'pickup', { ...config, paymentOptions: [] }, ''), /Cash/);
  assert.match(checkoutError(cart, { ...customer, phone: 'x' }, 'pickup', config, ''), /phone/);
  assert.match(checkoutError(cart, { ...customer, email: 'bad' }, 'pickup', config, ''), /email/);
  assert.match(checkoutError([lineFor(dish, selected, 2)], { ...customer, address: '' }, 'delivery', config, ''), /address/);
  assert.match(checkoutError(cart, customer, 'pickup', config, 'n'.repeat(501)), /500/);
});
test('registration follows existing password policy; pickup lifecycle uses Collected', () => {
  assert.equal(passwordError('Password123!'), ''); assert.notEqual(passwordError('password'), '');
  assert.equal(statusLabel({ status: 'delivered', fulfillmentType: 'pickup' }), 'Collected');
  assert.equal(statusLabel({ status: 'delivered', fulfillmentType: 'dine_in' }), 'Completed');
  assert.equal(terminal({ status: 'delivered' }), true); assert.equal(terminal({ status: 'ready' }), false);
});
