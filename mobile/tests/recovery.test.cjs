const { test } = require('node:test'); const assert = require('node:assert/strict');
const { OrderRequests, trackingFor } = require('../.test-build/services/order-request');
const { ApiError } = require('../.test-build/services/api-client');
const payload = () => ({ fulfillmentType: 'pickup', paymentOption: 'cod', customer: { name: 'Owned', phone: '+966500000000', email: '', address: '' }, kitchenNotes: '', couponCode: '', items: [{ productId: 'dish', productType: 'menuItem', quantity: 1, customization: { selectedAddOns: [], spiceLevel: '', note: '' } }] });
function storage() { const map = new Map(); return { map, read: async k => map.has(k) ? structuredClone(map.get(k)) : null, write: async (k, v) => { map.set(k, structuredClone(v)); }, remove: async k => { map.delete(k); } }; }
test('persist-before-send, immutable payload, restart and identical explicit retry', async () => {
  const vault = storage(); const original = payload(); let sent; let confirmed = false;
  const first = new OrderRequests(vault, () => 'fixed-random-uuid', async p => { assert.deepEqual(await vault.read('pending'), p); sent = p; throw new ApiError('Lost response', 0, 'network'); }, async () => {});
  await assert.rejects(first.run('create', 'guest', original, null, 'https://fixture.test/api'));
  original.customer.name = 'Changed'; original.items[0].quantity = 99;
  assert.equal((await first.read()).payload.customer.name, 'Owned'); assert.equal((await first.read()).payload.items[0].quantity, 1);
  const resumed = new OrderRequests(vault, () => { throw Error('must not create key'); }, async (p, cancel) => { assert.deepEqual(p, sent); assert.equal(cancel, false); return { data: { orderNumber: 'DG-fixture' }, trackingToken: 'private' }; }, async () => { assert.ok(await vault.read('pending')); confirmed = true; });
  await resumed.run('retry', 'guest'); assert.equal(confirmed, true); assert.equal(await resumed.read(), null);
});
test('storage denial prevents any network submission', async () => {
  let sent = false; const vault = storage(); vault.write = async () => { throw Error('storage denied'); };
  const manager = new OrderRequests(vault, () => 'key', async () => { sent = true; }, async () => {});
  await assert.rejects(manager.run('create', 'guest', payload()), /storage denied/); assert.equal(sent, false);
});
test('requests above the server body budget fail before saving or sending, including multi-byte notes', async () => {
  const vault = storage(); let sent = false;
  const manager = new OrderRequests(vault, () => 'key', async () => { sent = true; }, async () => {});
  await assert.rejects(manager.run('create', 'guest', { ...payload(), kitchenNotes: 'ع'.repeat(50000) }), /too large/);
  assert.equal(sent, false); assert.equal(await manager.read(), null);
});
test('secure tracking retains token, origin and totals in a bounded summary without full images or notes', () => {
  const data = { orderNumber: 'DG-1', totalAmount: 20, subtotal: 20, deliveryFee: 0, discountAmount: 0, status: 'pending', paymentStatus: 'pending', fulfillmentType: 'pickup', createdAt: '2026-10-10T00:00:00Z', kitchenNotes: 'private note', items: [{ name: 'Large item', image: 'x'.repeat(100000), itemNote: 'private note' }] };
  const record = trackingFor({ data, trackingToken: 'private-token' }, { actor: 'guest', baseUrl: 'https://original.test/api' });
  assert.equal(record.order.totalAmount, 20); assert.equal(record.baseUrl, 'https://original.test/api'); assert.equal(record.token, 'private-token');
  assert.equal(record.order.items.length, 0); assert.equal('kitchenNotes' in record.order, false); assert.ok(JSON.stringify(record).length < 1000);
});
test('409, 400, 410, 503 and timeout preserve request until server reconciliation', async () => {
  for (const status of [409, 400, 410, 503, 0]) {
    const vault = storage(); const manager = new OrderRequests(vault, () => 'key', async () => { throw new ApiError('Unknown', status, 'http'); }, async () => {});
    await assert.rejects(manager.run('create', 'guest', payload())); assert.ok(await manager.read());
    await assert.rejects(manager.run('create', 'guest', payload()), /previous/);
  }
});
test('wrong account cannot retry; same account refreshes credential but not payload', async () => {
  const vault = storage(); const first = new OrderRequests(vault, () => 'key', async () => { throw Error('offline'); }, async () => {});
  await assert.rejects(first.run('create', 'customer-a', payload(), 'old-token', 'https://old.test/api'));
  let calls = 0;
  const next = new OrderRequests(vault, () => '', async (p, cancel) => { calls++; assert.equal(p.actor, 'customer-a'); assert.equal(p.token, 'refreshed'); assert.equal(p.baseUrl, 'https://old.test/api'); assert.equal(p.payload.idempotencyKey, 'key'); assert.equal(cancel, true); return { cancelled: true }; }, async () => assert.fail('no order to confirm'));
  await assert.rejects(next.run('retry', 'customer-b'), /original account/); assert.equal(calls, 0);
  await next.run('reconcile', 'customer-a', undefined, 'refreshed'); assert.equal(await next.read(), null);
});
test('reconciliation recovers committed order; confirmation storage failure retains pending', async () => {
  const vault = storage(); const manager = new OrderRequests(vault, () => 'key', async () => { throw Error('offline'); }, async () => {});
  await assert.rejects(manager.run('create', 'guest', payload()));
  const resumed = new OrderRequests(vault, () => '', async (_p, cancel) => { assert.equal(cancel, true); return { data: { orderNumber: 'DG-1' }, trackingToken: 'secret' }; }, async () => { throw Error('tracking persistence failed'); });
  await assert.rejects(resumed.run('reconcile', 'guest'), /persistence/); assert.ok(await resumed.read());
});
test('duplicate taps and concurrent retry/cancel have one shared gate', async () => {
  const vault = storage(); let release; let sends = 0;
  const waiting = new Promise(r => { release = r; });
  const manager = new OrderRequests(vault, () => 'key', async () => { sends++; await waiting; throw Error('unknown'); }, async () => {});
  const first = manager.run('create', 'guest', payload());
  await assert.rejects(manager.run('create', 'guest', payload()), /in progress/);
  await assert.rejects(manager.run('reconcile', 'guest'), /in progress/);
  release(); await assert.rejects(first); assert.equal(sends, 1); assert.ok(await manager.read());
});
