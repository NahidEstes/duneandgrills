const { test } = require('node:test'); const assert = require('node:assert/strict');
const { changeLanguage, t, formatDate, formatMoney, formatNumber, catalogText, normalizeDigits } = require('../.test-build/i18n/core');
const { locateDelivery } = require('../.test-build/domain/location');
const { OrderRequests } = require('../.test-build/services/order-request');
test('Arabic and English presentation, mixed identifiers, Riyadh midnight and catalog fallback', () => {
  changeLanguage('ar'); assert.equal(t('Checkout'), 'إتمام الطلب'); assert.match(formatMoney(12.5), /١٢/); assert.equal(formatNumber(123), '١٢٣');
  assert.match(formatDate('2026-10-17T22:30:00Z'), /١٨/); assert.match(t('View order DG-123'), /DG-123/);
  assert.equal(catalogText({ name: 'Original', translations: { ar: { name: '  ' } } }), 'Original');
  assert.equal(catalogText({ name: 'Original', translations: { ar: { name: 'مشاوي' } } }), 'مشاوي');
  assert.equal(t('Your session expired. Please sign in again.'), 'انتهت جلستك. سجل الدخول مجددًا.');
  assert.equal(normalizeDigits('+٩٦٦٥٠٠٠٠٠٠٠٠'), '+966500000000'); assert.equal(normalizeDigits('٢٤٫۷'), '24.7');
  changeLanguage('en'); assert.equal(t('Checkout'), 'Checkout'); assert.equal(formatMoney(12.5), 'SAR 12.50');
});
test('permission denial, unavailable location and timeout leave existing address data untouched', async () => {
  const draft = { address: 'Old saved manual address', building: '2' }; let reads = 0;
  const denied = await locateDelivery({ permission: async () => 'denied', position: async () => { reads++; return { latitude: 1, longitude: 2 }; } });
  assert.equal(reads, 0); assert.match(denied.message, /denied/); assert.equal(denied.coordinates, undefined);
  const failure = await locateDelivery({ permission: async () => 'granted', position: async () => { throw Error('GPS failure'); } }); assert.match(failure.message, /unavailable/);
  const timeout = await locateDelivery({ permission: async () => 'granted', position: () => new Promise(() => {}) }, 5); assert.match(timeout.message, /unavailable/);
  const success = await locateDelivery({ permission: async () => 'granted', position: async () => ({ latitude: 24.7, longitude: 46.7 }) }); assert.equal(success.coordinates.latitude, 24.7);
  assert.deepEqual(draft, { address: 'Old saved manual address', building: '2' });
});
test('language switching, restart, failed slot and original-request recovery preserve combined intent exactly', async () => {
  const saved = new Map(); const sends = []; let fail = true;
  const vault = { read: async key => saved.get(key) || null, write: async (key, value) => saved.set(key, structuredClone(value)), remove: async key => saved.delete(key) };
  const send = async pending => { sends.push(structuredClone(pending)); if (fail) throw Error('slot full / unknown response'); return { cancelled: true }; };
  const payload = { fulfillmentType: 'delivery', paymentOption: 'cod', pointsToRedeem: 500, scheduledAt: '2026-10-18T12:00:00.000Z', couponCode: 'SAVE', customer: { name: 'عميل', phone: '+966500000000', email: '', address: 'عنوان', deliveryDetails: { coordinates: { latitude: 24.7, longitude: 46.7 }, building: '2', instructions: 'اتصل' } }, kitchenNotes: '', items: [] };
  const first = new OrderRequests(vault, () => 'immutable-checkout-key', send, async () => {});
  await assert.rejects(first.run('create', 'owner', payload), /slot full/); changeLanguage('ar');
  const restarted = new OrderRequests(vault, () => 'must-never-change', send, async () => {});
  await assert.rejects(restarted.run('retry', 'owner'), /slot full/);
  assert.deepEqual(sends[0].payload, sends[1].payload);
  await assert.rejects(restarted.run('create', 'owner', { ...payload, pointsToRedeem: 0 }), /previous/);
  fail = false; await restarted.run('reconcile', 'owner'); assert.equal(saved.has('pending'), false);
  changeLanguage('en');
});
