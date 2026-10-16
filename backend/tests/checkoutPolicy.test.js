import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutDefaults, normalizeCheckoutPolicy, normalizeDeliveryDetails, deliveryQuote, pointsQuote, availableSlotTimes, scheduleQuote } from '../services/checkoutPolicy.js';
import { getRestaurantSettingsDefaults, getRestaurantSettingsDiff } from '../services/restaurantSettingsService.js';
import { checkoutQuote } from '../services/checkoutService.js';
const settings = () => ({ ...getRestaurantSettingsDefaults(), checkout: normalizeCheckoutPolicy({ points: { enabled: true, pointsPerSAR: 100, minimumPoints: 100, maximumDiscountSAR: 10, stackWithCoupons: true, refundPolicy: 'proportional' }, delivery: { enabled: true, latitude: 24.7, longitude: 46.7, radiusKm: 5, feeSAR: 7 }, scheduling: { enabled: true, openingHoursConfirmed: true, slotMinutes: 30, capacity: 1, cutoffMinutes: 40, horizonDays: 2 } }) });
test('new policies stay disabled until an administrator explicitly configures every rule', () => {
  assert.deepEqual(normalizeCheckoutPolicy(), checkoutDefaults());
  for (const group of ['points', 'delivery', 'scheduling']) assert.throws(() => normalizeCheckoutPolicy({ [group]: { enabled: true } }));
  assert.throws(() => normalizeCheckoutPolicy({ ...settings().checkout, points: { ...settings().checkout.points, refundPolicy: null } }));
  assert.ok(getRestaurantSettingsDiff(getRestaurantSettingsDefaults(), settings()).changedFields.includes('checkout.points.enabled'));
});
test('points enforce integral intent, conversion, coupon stacking, minimum and subtotal/max caps', () => {
  const policy = settings().checkout.points;
  assert.deepEqual(pointsQuote(policy, 250, 20, true), { points: 250, discount: 2.5 });
  for (const value of [1, -1, 1.5, '100', 1100]) assert.throws(() => pointsQuote(policy, value, 20, false));
  assert.throws(() => pointsQuote(policy, 500, 4, false));
  assert.throws(() => pointsQuote({ ...policy, stackWithCoupons: false }, 100, 10, true));
});
test('new clients bind their reviewed amount while older API consumers remain compatible', () => {
  const config = getRestaurantSettingsDefaults();
  assert.equal(checkoutQuote(config, { fulfillmentType: 'pickup' }, 20).total, 20);
  assert.throws(() => checkoutQuote(config, { fulfillmentType: 'pickup', reviewedTotal: 19 }, 20), /changed/);
  assert.equal(checkoutQuote(config, { fulfillmentType: 'pickup', reviewedTotal: 20 }, 20).total, 20);
});
test('address coordinates validate and legacy manual addresses keep existing fees', () => {
  assert.equal(normalizeDeliveryDetails(undefined), undefined);
  assert.throws(() => normalizeDeliveryDetails({ coordinates: { latitude: NaN, longitude: 2 } }));
  assert.throws(() => normalizeDeliveryDetails({ coordinates: { latitude: 91, longitude: 2 } }));
  const legacy = getRestaurantSettingsDefaults();
  assert.equal(deliveryQuote(legacy, 'delivery').fee, legacy.orders.deliveryFee);
  assert.throws(() => deliveryQuote(legacy, 'delivery', { coordinates: { latitude: 0, longitude: 0 } }), /not configured/);
  assert.equal(deliveryQuote(settings(), 'delivery', { coordinates: { latitude: 24.7, longitude: 46.7 } }).fee, 7);
  assert.throws(() => deliveryQuote(settings(), 'delivery', { coordinates: { latitude: 0, longitude: 0 } }), /outside/);
  assert.equal(deliveryQuote(settings(), 'pickup').fee, 0);
});
test('Riyadh slots enforce preparation, cutoff, horizon and closed days', () => {
  const config = settings(); const now = new Date('2026-10-18T07:00:00Z'); // Sunday 10:00 Riyadh
  const times = availableSlotTimes(config, now);
  assert.ok(times.includes('2026-10-18T08:20:00.000Z')); // open 11 + 20 prep
  assert.ok(times.every(date => new Date(date) >= new Date(now.getTime() + 40 * 60000)));
  assert.ok(times.every(date => new Date(date) <= new Date(now.getTime() + 2 * 86400000)));
  config.openingHours.forEach(day => { day.isOpen = false; }); assert.deepEqual(availableSlotTimes(config, now), []);
});
test('overnight windows use the previous opening day across Riyadh midnight without duplicates', () => {
  const config = settings(); config.openingHours.forEach(day => { day.isOpen = day.day === 'saturday'; day.periods = [{ open: '23:00', close: '02:00' }]; });
  const now = new Date('2026-10-17T21:00:00Z'); // Sunday 00:00 Riyadh, Saturday opening
  const times = availableSlotTimes(config, now);
  assert.ok(times.includes('2026-10-17T21:50:00.000Z')); assert.equal(new Set(times).size, times.length);
  assert.ok(times.every(date => new Date(date) <= new Date('2026-10-17T23:00:00Z')));
  assert.throws(() => scheduleQuote(config, '2026-10-17T21:00:00.000Z', now), /unavailable/);
  assert.throws(() => scheduleQuote(config, '2026-10-17T23:20:00.000Z', now), /unavailable/);
  assert.equal(scheduleQuote(config, times[0], now).kitchenReleaseAt.getTime(), new Date(times[0]).getTime() - 20 * 60000);
});
