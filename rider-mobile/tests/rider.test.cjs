const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../.test-build/domain/rider');
const { prepareAction, settleAction } = require('../.test-build/services/action-journal');
const row = { id: 'd1', riderId: 'r1', revision: 1, orderRevision: 2, canOperate: true, restaurantStatus: 'ready', deliveryStatus: 'assigned', paymentStatus: 'pending', cashState: 'collection_pending', customerCollectionHalala: 8400, cashReport: { status: 'none' } };
test('pickup and completion obey kitchen and assignment state', () => {
  assert.equal(r.actionError(row, 'pickup', 'r1'), '');
  for (const patch of [{ riderId: 'other' }, { canOperate: false }, { restaurantStatus: 'preparing' }, { deliveryStatus: 'issue' }, { deliveryStatus: 'delivered' }]) assert.notEqual(r.actionError({ ...row, ...patch }, 'pickup', 'r1'), '');
  assert.notEqual(r.actionError(row, 'deliver', 'r1'), '');
  assert.equal(r.actionError({ ...row, deliveryStatus: 'picked_up', restaurantStatus: 'out-for-delivery' }, 'deliver', 'r1'), '');
});
test('cash requires completed delivery, full precision and one report, shortages need reasons', () => {
  const completed = { ...row, deliveryStatus: 'delivered' };
  assert.equal(r.actionError(completed, 'report_cash', 'r1', { amount: '84.00', reason: '' }), '');
  for (const amount of ['84.01', '-1', '1.001', '1e2', '', ' 84', 'Infinity']) assert.notEqual(r.cashError(amount, 'reason', 8400), '');
  assert.notEqual(r.cashError('0', '', 8400), ''); assert.equal(r.cashError('0', 'Customer did not pay', 8400), '');
  assert.notEqual(r.actionError(row, 'report_cash', 'r1', { amount: '84' }), '');
  assert.notEqual(r.actionError({ ...completed, cashReport: { status: 'unconfirmed' } }, 'report_cash', 'r1', { amount: '84' }), '');
  assert.notEqual(r.cashError('1', 'reason', null), ''); assert.notEqual(r.cashError('1', 'reason', 0), '');
});
test('only active deliveries report bounded issues; fingerprints include order and payment revisions', () => {
  assert.equal(r.actionError(row, 'issue', 'r1', { reason: 'Customer unreachable' }), '');
  assert.notEqual(r.actionError(row, 'issue', 'r1', { reason: ' ' }), '');
  assert.notEqual(r.actionError(row, 'issue', 'r1', { reason: 'x'.repeat(501) }), '');
  assert.notEqual(r.actionError({ ...row, deliveryStatus: 'delivered' }, 'issue', 'r1', { reason: 'reason' }), '');
  for (const patch of [{ orderRevision: 3 }, { paymentStatus: 'paid' }, { customerCollectionHalala: 0 }, { riderId: 'r2' }, { cashReport: { status: 'unconfirmed' } }]) assert.notEqual(r.fingerprint(row), r.fingerprint({ ...row, ...patch }));
});
test('maps use saved coordinates or escaped addresses and never historical customer data', () => {
  const active = { ...row, customer: { address: 'Road 5 & 7', deliveryDetails: { coordinates: { latitude: 24.7, longitude: 46.6 } } } };
  assert.match(r.mapHref(active), /24.7%2C46.6/);
  assert.equal(r.mapHref({ ...active, deliveryStatus: 'delivered' }), null);
  assert.equal(r.phoneHref('javascript:alert(1)'), null); assert.equal(r.phoneHref('+966 50 123 4567'), 'tel:+966501234567');
  assert.equal(r.halala(null), 'Amount unavailable'); assert.equal(r.halala(0), 'SAR 0.00');
});
const saved = { version: 1, userId: 'r1', origin: 'https://test.invalid/api', action: 'report_cash', deliveryId: 'd1', payload: { idempotencyKey: 'saved-request-1234567', expectedRevision: 1, amount: '84' }, createdAt: new Date().toISOString() };
test('saved actions are scoped to server and reject malformed journals', () => {
  assert.deepEqual(r.validatePending(saved, saved.origin), saved);
  assert.throws(() => r.validatePending(saved, 'https://other.invalid/api'));
  assert.throws(() => r.validatePending({ ...saved, action: 'confirm_cash' }, saved.origin));
  assert.throws(() => r.validatePending({ ...saved, payload: {} }, saved.origin));
});
test('never sends if secure persistence fails', async () => {
  let sends = 0;
  await assert.rejects(prepareAction(saved, { write: async () => { throw Error('disk'); } }, () => {}, async () => { sends++; }));
  assert.equal(sends, 0);
});
test('lost response retains exact saved request across restart; explicit retry reuses the key', async () => {
  let disk = null, ui = null, calls = [];
  const store = { write: async (_key, value) => { disk = JSON.parse(JSON.stringify(value)); }, remove: async () => { disk = null; } };
  const changed = value => { ui = value; };
  await assert.rejects(prepareAction(saved, store, changed, () => settleAction(store, changed, async () => { calls.push(saved.payload); throw Object.assign(Error('timeout'), { status: 0 }); })));
  assert.deepEqual(disk, saved); assert.deepEqual(ui, saved); assert.equal(calls.length, 1);
  const restored = r.validatePending(disk, saved.origin);
  await settleAction(store, changed, async () => { calls.push(restored.payload); return { success: true, duplicate: true }; });
  assert.deepEqual(calls[0], calls[1]); assert.equal(disk, null); assert.equal(ui, null);
});
test('auth, rate limit and server failures retain journal; definite rejections clear it', async () => {
  for (const status of [0, 401, 408, 429, 500, 503]) {
    let removed = false;
    await assert.rejects(settleAction({ remove: async () => { removed = true; } }, () => {}, async () => { throw { status }; }));
    assert.equal(removed, false, String(status));
  }
  for (const status of [400, 403, 404, 409, 422]) {
    let removed = false;
    await assert.rejects(settleAction({ remove: async () => { removed = true; } }, () => {}, async () => { throw { status }; })); assert.equal(removed, true);
  }
});
test('successful server action with failed cleanup stays saved', async () => {
  let cleared = false;
  await assert.rejects(settleAction({ remove: async () => { throw Error('storage locked'); } }, () => { cleared = true; }, async () => ({ success: true })));
  assert.equal(cleared, false);
});
