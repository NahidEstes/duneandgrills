module.exports = () => {
  const environment = process.env.EXPO_PUBLIC_APP_ENV || 'development';
  const apiUrl = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
  if (!['development', 'staging', 'production'].includes(environment)) throw new Error('Invalid app environment.');
  if (apiUrl) {
    const url = new URL(apiUrl);
    if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol)) throw new Error('Use a plain API URL.');
    if (environment !== 'development' && url.protocol !== 'https:') throw new Error('Release sync requires HTTPS.');
  }
  return {
    name: 'Dune & Grills Notebook', slug: 'dune-and-grills-notebook', version: '1.0.0',
    scheme: 'dunegrillsnotebook', orientation: 'portrait', userInterfaceStyle: 'dark',
    icon: './assets/brand.png',
    ios: { bundleIdentifier: 'com.duneandgrills.notebook', supportsTablet: true, config: { usesNonExemptEncryption: false } },
    android: { package: 'com.duneandgrills.notebook', softwareKeyboardLayoutMode: 'resize', blockedPermissions: ['android.permission.RECORD_AUDIO'] },
    web: { output: 'static', favicon: './assets/brand.png' },
    plugins: ['expo-router', 'expo-sqlite', 'expo-secure-store', ['expo-image-picker', { cameraPermission: 'Take a photo of your restaurant receipt.', photosPermission: 'Attach a receipt from your photos.', microphonePermission: false }]],
    extra: { appEnvironment: environment, apiUrl },
  };
};
