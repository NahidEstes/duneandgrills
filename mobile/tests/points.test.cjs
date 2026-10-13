const { test } = require('node:test'); const assert = require('node:assert/strict');
const { readPointsAccount, earningRules, activityTitle, signedPoints, pointsDate, morePointsActivity, POINTS_HISTORY_LIMIT } = require('../.test-build/domain/points');
const { ResourceController } = require('../.test-build/services/resource-controller');
const { ApiError } = require('../.test-build/services/api-client');
const account = { pointsBalance: 1250, pointsDebt: 0, pointsPerSAR: 10, policy: { earnAfter: 'completed_and_paid', pointsExpire: false }, history: [] };
test('available points remain the server balance, including zero and debt; malformed balances never become zero', () => {
  assert.equal(readPointsAccount(account).pointsBalance, 1250);
  assert.equal(readPointsAccount({ ...account, pointsBalance: 0, pointsDebt: 350 }).pointsBalance, 0);
  for (const pointsBalance of [undefined, '120', -1, Infinity, NaN]) assert.throws(() => readPointsAccount({ ...account, pointsBalance }));
});
test('earning copy follows the current server rate/policy without inventing rates or expiry', () => {
  assert.match(earningRules(readPointsAccount(account))[0], /Earn 10 points.*completed and paid/);
  assert.match(earningRules(readPointsAccount({ ...account, pointsPerSAR: 7 }))[0], /Earn 7 points/);
  assert.match(earningRules(readPointsAccount({ ...account, pointsPerSAR: undefined }))[0], /rate is unavailable/);
  assert.match(earningRules(readPointsAccount({ ...account, pointsPerSAR: 0 }))[0], /earning is currently unavailable/);
  const future = earningRules(readPointsAccount({ ...account, policy: { earnAfter: 'future_rule', pointsExpire: true } })).join(' ');
  assert.match(future, /Current earning rules are unavailable/); assert.doesNotMatch(future, /do not expire|future_rule/);
  assert.match(earningRules(readPointsAccount(account)).join(' '), /excludes delivery fees.*discounts.*do not expire/);
});
test('earn/redeem and both reversal signs have customer titles and signed amounts', () => {
  for (const [type, points, title, signed] of [['EARN', 100, 'Points earned', '+100 points'], ['REDEEM', -50, 'Reward redeemed', '−50 points'], ['REVERSAL', 20, 'Points returned', '+20 points'], ['REVERSAL', -30, 'Points adjusted after a refund', '−30 points'], ['REVERSAL', 0, 'Points adjustment', '0 points']]) {
    assert.equal(activityTitle({ type, points }), title); assert.equal(signedPoints(points), signed);
  }
});
test('the customer read model removes raw audit/reservation/membership data and accepts only safe populated order links', () => {
  const parsed = readPointsAccount({ ...account, membership: { tier: 'secret-tier' }, activeRedemption: { secret: 1 }, history: [{ type: 'EARN', points: 10, sourceKey: 'SECRET_KEY', balanceAfter: 10, description: 'RAW INTERNAL', createdAt: '2026-10-12T22:30:00Z', order: { _id: '123456789012345678901234', orderNumber: 'DG-1' } }, { type: 'REDEEM', points: -1, order: null }, { type: 'REVERSAL', points: 1, order: '123456789012345678901234' }, { type: 'EARN', points: 1, order: { _id: '../../private', orderNumber: 'DG-2' } }] });
  assert.equal(parsed.history[0].orderId, '123456789012345678901234'); assert.equal(parsed.history[0].orderNumber, 'DG-1');
  assert.ok(parsed.history.slice(1).every(entry => entry.orderId === undefined));
  assert.doesNotMatch(JSON.stringify(parsed), /SECRET|RAW INTERNAL|balanceAfter|secret-tier|activeRedemption/);
});
test('history is newest first, capped at the backend 100 and loaded locally in tens without claiming lifetime completeness', () => {
  const history = Array.from({ length: 105 }, (_, i) => ({ type: 'EARN', points: i, createdAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString() }));
  const result = readPointsAccount({ ...account, history }); assert.equal(result.history.length, POINTS_HISTORY_LIMIT); assert.equal(result.history[0].points, 104);
  assert.equal(morePointsActivity(10, 25), 20); assert.equal(morePointsActivity(20, 25), 25); assert.deepEqual(readPointsAccount(account).history, []);
});
test('ledger dates use Riyadh even across UTC midnight and invalid dates get useful text', () => {
  assert.equal(pointsDate('2026-10-12T22:30:00Z'), '13 Oct 2026, 01:30'); assert.equal(pointsDate('bad-date'), 'Date unavailable');
});
test('the reused points resource has no polling, retains known balance on outage, ignores late owner responses and reports expired authentication', async () => {
  let published; let failure; let resolve; let request = async () => account; const timers = [];
  const reader = new ResourceController((signal) => request(signal), value => { published = value; }, error => { failure = error; }, () => {}, () => undefined, 120000, { now: Date.now, set: (...args) => { timers.push(args); }, clear: () => {} });
  reader.activate(); await new Promise(resolve => setImmediate(resolve)); assert.equal(published.pointsBalance, 1250); assert.equal(timers.length, 0);
  request = async () => { throw new ApiError('Offline', 0, 'network'); }; await reader.refresh(); assert.equal(published.pointsBalance, 1250); assert.equal(failure.code, 'network');
  request = () => new Promise(done => { resolve = done; }); const flight = reader.refresh(); reader.deactivate(); resolve({ ...account, pointsBalance: 9999 }); await flight; assert.equal(published.pointsBalance, 1250);
  request = async () => { throw new ApiError('Expired', 401, 'http'); }; reader.activate(); await new Promise(resolve => setImmediate(resolve)); assert.equal(failure.status, 401); assert.equal(timers.length, 0); reader.deactivate();
});
