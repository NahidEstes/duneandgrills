const { test } = require('node:test'); const assert = require('node:assert/strict');
const { createApi, ApiError, invalidSession } = require('../.test-build/services/api-client');
test('API sends bearer, private tracking and idempotency headers without cookies or implicit retries', async () => {
  let calls = 0;
  const api = createApi('https://fixture.test/api/', async (url, options) => {
    calls++; assert.equal(url, 'https://fixture.test/api/orders'); assert.equal(options.credentials, 'omit');
    assert.equal(options.headers.Authorization, 'Bearer secret'); assert.equal(options.headers['Idempotency-Key'], 'fixed');
    assert.equal(JSON.parse(options.body).value, 1); return new Response(JSON.stringify({ success: true, data: 1 }));
  });
  assert.equal((await api('/orders', { method: 'POST', body: { value: 1 }, token: 'secret', headers: { 'Idempotency-Key': 'fixed' } })).data, 1); assert.equal(calls, 1);
});
test('structured HTTP errors retain rate budget; only 401 invalidates credentials', async () => {
  const api = createApi('https://fixture.test/api', async () => new Response(JSON.stringify({ success: false, message: 'Wait' }), { status: 429, headers: { 'retry-after': '120' } }));
  await assert.rejects(api('/auth/me'), e => e instanceof ApiError && e.status === 429 && e.retryAfter === 120);
  for (const status of [0, 403, 429, 500, 503]) assert.equal(invalidSession(new ApiError('', status, 'http')), false);
  assert.equal(invalidSession(new ApiError('', 401, 'http')), true);
});
test('network failure, timeout, external cancellation and malformed response remain distinct', async () => {
  await assert.rejects(createApi('https://fixture.test', async () => { throw new TypeError('offline'); })('/orders'), e => e.code === 'network' && e.status === 0);
  const blocking = (_url, options) => new Promise((_, reject) => { if (options.signal.aborted) reject(new Error('aborted')); else options.signal.addEventListener('abort', () => reject(new Error('aborted'))); });
  await assert.rejects(createApi('https://fixture.test', blocking, 5)('/orders'), e => e.code === 'timeout');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createApi('https://fixture.test', blocking)('/orders', { signal: controller.signal }), e => e.code === 'cancelled');
  await assert.rejects(createApi('https://fixture.test', async () => new Response('<html>'))('/orders'), e => e.code === 'response');
});
