module.exports = () => {
  const environment = process.env.EXPO_PUBLIC_APP_ENV || 'development';
  if (!['development', 'staging', 'production'].includes(environment)) throw new Error('Use development, staging or production for the app environment.');
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://duneandgrills-testing-six.vercel.app/api';
  const url = new URL(apiUrl);
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) throw new Error('Use a plain API URL without credentials, query or fragment.');
  if (environment !== 'development' && url.protocol !== 'https:') throw new Error('Release apps require an HTTPS API.');
  if (environment !== 'development' && process.env.EXPO_PUBLIC_RIDER_DEMO === '1') throw new Error('Read-only demo is restricted to development.');
  if (environment === 'production' && (!process.env.EXPO_PUBLIC_API_URL || url.hostname === 'duneandgrills-testing-six.vercel.app')) throw new Error('Set the approved production API URL explicitly.');
  return {
    name: 'Dune & Grills Rider', slug: 'dune-and-grills-rider', owner: 'nahidestes', version: '1.0.0',
    orientation: 'portrait', scheme: 'dunegrillsrider', userInterfaceStyle: 'dark', icon: './assets/brand.png',
    ios: { bundleIdentifier: 'com.duneandgrills.rider', supportsTablet: true, config: { usesNonExemptEncryption: false } },
    android: { package: 'com.duneandgrills.rider', softwareKeyboardLayoutMode: 'resize', blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_BACKGROUND_LOCATION'] },
    web: { output: 'static' }, plugins: ['expo-router', ['expo-secure-store', { configureAndroidBackup: true }]],
    extra: { appEnvironment: environment, apiUrl, readOnlyDemo: environment === 'development' && process.env.EXPO_PUBLIC_RIDER_DEMO === '1', eas: { projectId: '3b82d000-eb94-4f18-9f92-e101b24d1046' } },
  };
};
