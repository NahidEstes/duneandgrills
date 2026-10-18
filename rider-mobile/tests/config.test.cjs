const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../app.config');
test('release configuration rejects fixture mode, unsafe URLs and accidental staging production', () => {
  const keys = ['EXPO_PUBLIC_APP_ENV', 'EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_RIDER_DEMO'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const set = values => { for (const key of keys) { if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key]; } };
  try {
    set({}); const standard = config(); assert.equal(standard.extra.readOnlyDemo, false); assert.equal(standard.android.package, 'com.duneandgrills.rider');
    assert.equal(standard.owner, 'nahidestes');
    assert.equal(standard.extra.eas.projectId, '3b82d000-eb94-4f18-9f92-e101b24d1046');
    set({ EXPO_PUBLIC_APP_ENV: 'staging', EXPO_PUBLIC_API_URL: 'http://127.0.0.1/api' }); assert.throws(config, /HTTPS/);
    set({ EXPO_PUBLIC_APP_ENV: 'staging', EXPO_PUBLIC_RIDER_DEMO: '1' }); assert.throws(config, /development/);
    set({ EXPO_PUBLIC_APP_ENV: 'production' }); assert.throws(config, /production API/);
    set({ EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_API_URL: 'https://secret:password@example.invalid/api' }); assert.throws(config, /credentials/);
    set({ EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_RIDER_DEMO: '1' }); assert.equal(config().extra.readOnlyDemo, true);
    set({ EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_API_URL: 'https://owned-production.invalid/api' }); assert.equal(config().extra.readOnlyDemo, false);
  } finally { set(saved); }
});
