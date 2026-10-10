const { test } = require('node:test'); const assert = require('node:assert/strict');
const { validateSessionData } = require('../.test-build/services/session'); const { ApiError } = require('../.test-build/services/api-client');
const session = { token: 'saved-private-token', expiresAt: 1, user: { _id: 'customer-a', role: 'customer', name: 'Cached', email: 'cached@fixture.test', phone: '' } };
test('session restoration validates with /auth/me and refreshes only the same customer', async () => {
  const restored = await validateSessionData(session, async () => ({ ...session.user, name: 'Fresh' }));
  assert.equal(restored.validated, true); assert.equal(restored.session.user.name, 'Fresh'); assert.equal(restored.session.token, session.token);
  for (const user of [{ ...session.user, _id: 'customer-b' }, { ...session.user, role: 'admin' }]) {
    const denied = await validateSessionData(session, async () => user); assert.equal(denied.session, null); assert.equal(denied.validated, false);
  }
});
test('transient network, timeout, throttling and service outage preserve secure credentials and cached identity', async () => {
  for (const error of [new ApiError('Offline', 0, 'network'), new ApiError('Timeout', 0, 'timeout'), new ApiError('Wait', 429, 'http'), new ApiError('Unavailable', 503, 'http')]) {
    const result = await validateSessionData(session, async () => { throw error; }); assert.deepEqual(result.session, session); assert.equal(result.validated, false); assert.ok(result.error);
  }
});
test('server-confirmed expired/revoked session clears credentials', async () => {
  const result = await validateSessionData(session, async () => { throw new ApiError('Revoked', 401, 'http'); }); assert.equal(result.session, null); assert.match(result.error, /Sign in again/);
});
