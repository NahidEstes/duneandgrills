const { test } = require('node:test'); const assert = require('node:assert/strict');
const { buildConfig, STAGING_API } = require('../scripts/build-config.cjs');
const base = require('../app.json').expo; const profiles = require('../eas.json');
test('preview produces an internal APK with explicit HTTPS staging and stable existing identity', () => {
  const profile = profiles.build.preview; const config = buildConfig(base, { ...profile.env, EAS_BUILD_PROFILE: 'preview' });
  assert.equal(profile.distribution, 'internal'); assert.equal(profile.android.buildType, 'apk'); assert.equal(config.extra.apiUrl, STAGING_API);
  assert.equal(config.android.package, base.android.package); assert.equal(config.ios.bundleIdentifier, base.ios.bundleIdentifier);
  assert.equal(profiles.cli.appVersionSource, 'remote'); assert.equal(profile.autoIncrement, true);
  assert.equal(config.android.permissions.length, 0); assert.ok(config.android.blockedPermissions.includes('android.permission.RECORD_AUDIO'));
});
test('production AAB requires approved HTTPS URL, rejects missing/staging/credentials/query; preserves EAS link', () => {
  assert.equal(profiles.build.production.android.buildType, 'app-bundle');
  const env = { EXPO_PUBLIC_APP_ENV: 'production', EAS_BUILD_PROFILE: 'production' };
  for (const value of ['', STAGING_API, 'http://fixture.test/api', 'https://secret:password@fixture.test/api', 'https://fixture.test/api?secret=1', 'https://fixture.test/v1']) assert.throws(() => buildConfig(base, { ...env, EXPO_PUBLIC_API_URL: value }));
  const config = buildConfig({ ...base, owner: 'existing', extra: { eas: { projectId: 'existing-project' } } }, { ...env, EXPO_PUBLIC_API_URL: 'https://approved.fixture.test/api' });
  assert.equal(config.owner, 'existing'); assert.equal(config.extra.eas.projectId, 'existing-project');
});
test('development accepts local API, mismatched release environments and preview destinations fail closed', () => {
  assert.equal(buildConfig(base, { EXPO_PUBLIC_API_URL: 'http://10.0.2.2:5000/api' }).extra.appEnvironment, 'development');
  assert.equal(profiles.build.development.developmentClient, true);
  assert.throws(() => buildConfig(base, { EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_API_URL: STAGING_API }), /match/);
  assert.throws(() => buildConfig(base, { EXPO_PUBLIC_APP_ENV: 'preview', EXPO_PUBLIC_API_URL: 'https://other.fixture.test/api' }), /staging/);
});
