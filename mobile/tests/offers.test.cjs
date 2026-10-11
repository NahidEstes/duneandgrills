const { test } = require('node:test'); const assert = require('node:assert/strict');
const offers = require('../.test-build/domain/offers'); const cart = require('../.test-build/domain/cart');
const { apiMessage } = require('../.test-build/services/customer-message');
const now = Date.parse('2026-10-11T12:00:00Z');
const item = { _id: 'item', productType: 'menuItem', name: 'Included item', isAvailable: true, price: 12 };
const combo = { _id: 'combo', productType: 'combo', name: 'Meal', status: 'published', isAvailable: true, comboPrice: 20, price: 20, regularPrice: 24, items: [{ menuItem: item, quantity: 2 }] };
const offer = { _id: 'offer', isActive: true, startDate: '2026-10-10T00:00:00Z', expiresAt: '2026-10-12T00:00:00Z', usageLimit: null, usageCount: 0, promoCode: '', discountValue: 0, discountType: 'fixed', couponScope: 'order', minimumTier: 'Bronze', membersOnly: false, orderProductType: 'combo', orderProduct: { productType: 'combo', product: combo, quantity: 1 }, offerPrice: 1, maximumDiscount: null };
test('Offers respect start/expiry boundaries, inactive status and exhausted usage', () => {
  assert.equal(offers.activeOffer(offer, now), true);
  for (const patch of [{ isActive: false }, { startDate: new Date(now + 1).toISOString() }, { expiresAt: new Date(now).toISOString() }, { usageLimit: 3, usageCount: 3 }, { expiresAt: 'invalid' }]) assert.equal(offers.activeOffer({ ...offer, ...patch }, now), false);
});
test('Filters use actual combo/coupon fields; a dual offer appears in both', () => {
  assert.equal(offers.offerMatches(offer, 'Combo deals'), true); assert.equal(offers.offerMatches(offer, 'Coupons'), false);
  const dual = { ...offer, promoCode: 'DUAL', discountValue: 10, badge: 'Anything' };
  assert.equal(offers.offerMatches(dual, 'Coupons'), true); assert.equal(offers.offerMatches(dual, 'Combo deals'), true);
  assert.equal(offers.offerMatches({ ...offer, orderProduct: null, badge: 'COMBO DEAL' }, 'Combo deals'), false);
  assert.equal(offers.needsMember({ ...dual, minimumTier: 'Gold' }), true);
});
test('Authoritative combo price and intrinsic savings ignore editorial offer pricing', () => {
  assert.deepEqual(offers.comboSavings(combo), { original: 24, saved: 4 });
  assert.equal(offers.comboSavings({ ...combo, regularPrice: 19 }), null);
  assert.match(offers.priceDisclosure(offer, combo), /current catalog price/);
  assert.match(offers.priceDisclosure({ ...offer, promoCode: 'DUAL', discountValue: 5 }, combo), /before coupon/);
  assert.match(offers.offerBadge({ ...offer, promoCode: 'LIMITED', discountValue: 30, maximumDiscount: 5 }), /Up to SAR 5.00/);
});
test('Combo availability requires available populated items and published catalog price', () => {
  assert.equal(offers.comboAvailable(combo), true);
  for (const patch of [{ status: 'draft' }, { isAvailable: false }, { comboPrice: NaN }, { items: [] }, { items: [{ menuItem: null, quantity: 1 }] }, { items: [{ menuItem: { ...item, isAvailable: false }, quantity: 1 }] }]) assert.equal(offers.comboAvailable({ ...combo, ...patch }), false);
});
test('Combo quantity and merge serialize one chargeable line with empty customization', () => {
  const first = cart.lineFor(combo, cart.emptySelection(), 2); const merged = cart.addLine([first], cart.lineFor(combo, cart.emptySelection(), 3));
  assert.equal(cart.subtotal(merged), 100);
  assert.deepEqual(cart.orderItems(merged), [{ productId: 'combo', productType: 'combo', quantity: 5, customization: { selectedAddOns: [], spiceLevel: '', note: '' } }]);
  assert.throws(() => cart.lineFor(combo, cart.emptySelection(), 100), /1–99/);
  assert.throws(() => cart.addLine([cart.lineFor(combo, cart.emptySelection(), 99)], first), /99/);
  assert.equal(cart.revalidateCart(merged, [{ ...combo, price: 22, comboPrice: 22 }]).changes.length, 1);
});
test('CTA targets use eligible category/product and reject arbitrary protocols/credentials', () => {
  assert.deepEqual(offers.offerDestination(offer), { kind: 'combo', id: 'combo' });
  assert.deepEqual(offers.offerDestination({ ...offer, couponScope: 'category', applicableCategory: 'Grills' }), { kind: 'menu', category: 'Grills' });
  for (const ctaLink of ['javascript:alert(1)', 'https://user:pass@example.test', '/admin', '//example.test', 'https://example.test\n']) assert.equal(offers.offerDestination({ ...offer, orderProduct: null, ctaLink }).kind, 'menu');
  assert.equal(offers.offerDestination({ ...offer, orderProduct: null, ctaLink: 'https://example.test/deal' }).kind, 'external');
  assert.match(offers.offerDate('2026-10-11T21:30:00Z'), /12 Oct 2026.*0:30/);
});
test('Coupon eligibility errors do not incorrectly instruct saved-order recovery', () => {
  assert.match(apiMessage(403, '/offers/validate-coupon', 'private internals'), /membership/);
  assert.match(apiMessage(409, '/offers/validate-coupon', 'private internals'), /eligible/);
  assert.doesNotMatch(apiMessage(409, '/offers/validate-coupon', 'private internals'), /saved order|private internals/);
});
