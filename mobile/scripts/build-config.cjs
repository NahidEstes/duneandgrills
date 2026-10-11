// Public build configuration only. EAS owns signing credentials and project linking.
const STAGING_API = 'https://duneandgrills-testing-six.vercel.app/api';
function buildConfig(config, env = process.env) {
  const environment = env.EXPO_PUBLIC_APP_ENV || (env.EAS_BUILD_PROFILE === 'production' ? 'production' : env.EAS_BUILD_PROFILE === 'preview' ? 'preview' : 'development');
  if (!['development', 'preview', 'production'].includes(environment)) throw new Error('Choose a valid EXPO_PUBLIC_APP_ENV.');
  if (env.EAS_BUILD_PROFILE && environment !== env.EAS_BUILD_PROFILE) throw new Error('Build profile and API environment must match.');
  const apiUrl = env.EXPO_PUBLIC_API_URL || (environment === 'production' ? '' : STAGING_API);
  let url;
  try { url = new URL(apiUrl); } catch { throw new Error('Set EXPO_PUBLIC_API_URL to the approved API URL ending in /api.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !/\/api\/?$/.test(url.pathname)) throw new Error('API configuration must be an HTTP(S) URL ending in /api with no credentials, query or fragment.');
  if (environment !== 'development' && url.protocol !== 'https:') throw new Error('Preview and production builds require HTTPS.');
  if (environment === 'preview' && apiUrl.replace(/\/$/, '') !== STAGING_API) throw new Error('The internal preview must use the approved staging API.');
  if (environment === 'production' && url.hostname === new URL(STAGING_API).hostname) throw new Error('Set the approved production API; staging cannot be used for production.');
  return {
    ...config,
    ios: { ...config.ios, buildNumber: config.ios?.buildNumber || '1' },
    android: { ...config.android, versionCode: config.android?.versionCode || 1, permissions: [], blockedPermissions: [
      'android.permission.RECORD_AUDIO', 'android.permission.CAMERA', 'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_MEDIA_VIDEO',
      'android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.POST_NOTIFICATIONS', 'android.permission.VIBRATE',
      'android.permission.USE_BIOMETRIC', 'android.permission.USE_FINGERPRINT',
      ...(environment === 'development' ? [] : ['android.permission.SYSTEM_ALERT_WINDOW']),
    ] },
    extra: { ...config.extra, appEnvironment: environment, apiUrl: apiUrl.replace(/\/$/, '') },
  };
}
module.exports = { buildConfig, STAGING_API };
