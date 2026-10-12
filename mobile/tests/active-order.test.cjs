const { test } = require('node:test'); const assert = require('node:assert/strict');
const { activeOrder, activeStatus, orderProgress, newestActiveOrders } = require('../.test-build/domain/orders');
const { ActiveOrderReader, guestCandidates } = require('../.test-build/services/active-order-reader');
const { ResourceController } = require('../.test-build/services/resource-controller');
const { ApiError } = require('../.test-build/services/api-client');
const signal = () => new AbortController().signal; const settle = () => new Promise(resolve => setImmediate(resolve));
const order = (id = 'one', status = 'preparing', fulfillmentType = 'pickup', createdAt = '2026-10-10T10:00:00Z') => ({ _id: id, orderNumber: `FIXTURE-${id}`, status, fulfillmentType, createdAt, items: [], totalAmount: 29 });
test('pending waits for acceptance; pickup and delivery progress reflect the stored lifecycle', () => {
  assert.equal(activeStatus(order('one', 'pending')).title, 'Order received');
  assert.match(activeStatus(order('one', 'pending')).description, /Waiting for restaurant/);
  assert.ok(orderProgress(order('one', 'pending')).every(s => s.state === 'upcoming'));
  assert.deepEqual(orderProgress(order()).map(s => [s.label, s.state]), [['Confirmed', 'complete'], ['Preparing', 'current'], ['Ready', 'upcoming'], ['Collected', 'upcoming']]);
  assert.equal(activeStatus(order('one', 'ready')).title, 'Ready for pickup');
  assert.equal(activeStatus(order('one', 'ready', 'delivery')).title, 'Ready for dispatch');
  assert.deepEqual(orderProgress(order('one', 'out-for-delivery', 'delivery')).map(s => s.label), ['Confirmed', 'Preparing', 'Ready', 'On the way', 'Delivered']);
  assert.equal(activeStatus(order('one', 'delivered')).title, 'Collected');
  assert.equal(activeStatus(order('one', 'delivered', 'delivery')).title, 'Delivered');
  for (const status of ['delivered', 'cancelled', 'failed', 'refunded', 'unknown', 'Completed']) assert.equal(activeOrder(order('one', status)), false);
});
test('latest created active order wins, duplicates and terminal history do not count', () => {
  const old = order(); const recent = order('two', 'ready', 'delivery', '2026-10-11T10:00:00Z');
  assert.deepEqual(newestActiveOrders([old, order('done', 'delivered'), recent, old]).map(o => o._id), ['two', 'one']);
});
test('signed discovery reads owner history once; polls only known active IDs and stops after completion', async () => {
  let history = 0; const ids = []; let state = 'preparing';
  const reader = new ActiveOrderReader({ history: async () => { history++; return [order(), order('old', 'delivered')]; }, order: async id => { ids.push(id); return order(id, state); } });
  assert.equal((await reader.load(signal(), 'activate')).orders.length, 1);
  await reader.load(signal(), 'poll'); assert.equal(history, 1); assert.deepEqual(ids, ['one']);
  state = 'delivered'; assert.equal((await reader.load(signal(), 'poll')).orders.length, 0);
  await reader.load(signal(), 'poll'); assert.deepEqual(ids, ['one', 'one']);
  await reader.load(signal(), 'manual'); assert.equal(history, 2);
});
test('guest summaries are credential candidates only; status requires a fresh private read', async () => {
  const track = { actor: 'guest', orderNumber: 'FIXTURE-one', token: 'private-fixture', order: order() };
  assert.deepEqual(guestCandidates([track, { ...track, actor: 'another-account' }, { ...track, token: '' }, { ...track, orderNumber: 'mismatched' }]), [track]);
  const reader = new ActiveOrderReader({ history: async () => { throw Error('Guest must not read owner history'); }, order: async () => order('one', 'ready') }, [track.orderNumber]);
  assert.equal((await reader.load(signal(), 'activate')).orders[0].status, 'ready');
  const revoked = new ActiveOrderReader({ history: async () => [], order: async () => { throw new ApiError('Revoked', 404, 'http'); } }, [track.orderNumber]);
  assert.equal((await revoked.load(signal(), 'activate')).orders.length, 0);
});
test('outages preserve verified statuses; revoked IDs disappear even when another read is offline', async () => {
  const offline = new ApiError('Offline', 0, 'network'); let fail = false;
  const reader = new ActiveOrderReader({ history: async () => [order(), order('two')], order: async id => { if (!fail) return order(id); throw id === 'one' ? new ApiError('Missing', 404, 'http') : offline; } });
  await reader.load(signal(), 'activate'); fail = true;
  const snapshot = await reader.load(signal(), 'poll'); assert.equal(snapshot.outdated, true); assert.deepEqual(snapshot.orders.map(o => o._id), ['two']);
  await assert.rejects(reader.load(signal(), 'poll'), error => error === offline);
});
test('aborted discovery and status responses cannot mutate reader state or revive prior orders', async () => {
  let resolve; let loaded = false; const ids = [];
  const reader = new ActiveOrderReader({ history: async () => loaded ? [order('current')] : new Promise(done => { resolve = done; }), order: async id => { ids.push(id); return order(id); } });
  const controller = new AbortController(); const late = reader.load(controller.signal, 'activate'); controller.abort(); resolve([order('old-account')]); await late;
  loaded = true; await reader.load(signal(), 'activate'); await reader.load(signal(), 'poll'); assert.deepEqual(ids, ['current']);
});
test('wrong identity responses and expired owner credentials are never retained', async () => {
  const reader = new ActiveOrderReader({ history: async () => [order()], order: async () => order('other') });
  await reader.load(signal(), 'activate'); assert.equal((await reader.load(signal(), 'poll')).orders.length, 0);
  const expired = new ActiveOrderReader({ history: async () => [order()], order: async () => { throw new ApiError('Expired', 401, 'http'); } });
  await expired.load(signal(), 'activate'); await assert.rejects(expired.load(signal(), 'poll'), error => error.status === 401);
});
test('one Home timer polls IDs, aborts on background/blur, refreshes discovery on resume and stops terminal', async () => {
  let now = 0; let counter = 0; let history = 0; let reads = 0; let status = 'preparing'; const timers = new Map(); const values = [];
  const reader = new ActiveOrderReader({ history: async () => { history++; return [order('one', status)]; }, order: async () => { reads++; return order('one', status); } });
  const clock = { now: () => now, set: (work, delay) => { const id = ++counter; timers.set(id, { work, at: now + delay }); return id; }, clear: id => timers.delete(id) };
  const runner = new ResourceController((s, reason) => reader.load(s, reason), v => values.push(v), e => { throw e; }, () => {}, () => v => v.orders.length > 0, 30000, clock, false);
  const advance = async ms => { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.work(); } await settle(); };
  runner.activate(); await settle(); assert.equal(timers.size, 1); await advance(30000); assert.equal(reads, 1); assert.equal(history, 1);
  runner.deactivate(); await advance(60000); assert.equal(reads, 1); assert.equal(timers.size, 0);
  runner.activate(); await settle(); assert.equal(history, 2); assert.equal(timers.size, 1);
  status = 'delivered'; await advance(30000); assert.equal(values.at(-1).orders.length, 0); assert.equal(timers.size, 0); runner.deactivate();
});
test('Home does not start a poll loop without a successfully verified active order', async () => {
  let calls = 0; let timers = 0;
  const clock = { now: () => 0, set: () => { timers++; }, clear: () => {} };
  const runner = new ResourceController(async () => { calls++; throw new ApiError('Offline', 0, 'network'); }, () => {}, () => {}, () => {}, () => v => v.orders.length > 0, 30000, clock, false);
  runner.activate(); await settle(); assert.equal(calls, 1); assert.equal(timers, 0); runner.deactivate();
});
