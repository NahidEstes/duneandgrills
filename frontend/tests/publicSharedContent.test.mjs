import { test } from 'node:test'; import assert from 'node:assert/strict';
import { sharedContentPath, publicContentAvailable } from '../src/utils/publicSharedContent.js';
test('public fallback selects only public content endpoints and rejects malformed IDs', () => {
  assert.equal(sharedContentPath('item', 'fixture-food'), '/api/menu/fixture-food'); assert.equal(sharedContentPath('combo', 'fixture-meal'), '/api/combos/fixture-meal'); assert.equal(sharedContentPath('offer', 'fixture-offer'), '/api/offers/fixture-offer');
  for (const id of ['../orders', '%2f', 'a?token=secret', '', 'x'.repeat(121)]) assert.equal(sharedContentPath('item', id), null); assert.equal(sharedContentPath('orders', 'id'), null);
});
test('unavailable food, unpublished/incomplete combos and expired offers get useful unavailable fallback', () => {
  assert.equal(publicContentAvailable('item', { _id: 'food', isAvailable: false }), false);
  assert.equal(publicContentAvailable('combo', { _id: 'meal', isAvailable: true, status: 'draft', items: [] }), false);
  assert.equal(publicContentAvailable('combo', { _id: 'meal', isAvailable: true, status: 'published', items: [{ menuItem: { isAvailable: true } }] }), true);
  const offer = { _id: 'offer', isActive: true, startDate: '2026-10-01', expiresAt: '2026-10-18', usageLimit: 10, usageCount: 0 }; const now = Date.parse('2026-10-12');
  assert.equal(publicContentAvailable('offer', offer, now), true); assert.equal(publicContentAvailable('offer', { ...offer, expiresAt: '2026-10-11' }, now), false); assert.equal(publicContentAvailable('offer', { ...offer, usageCount: 10 }, now), false);
});
