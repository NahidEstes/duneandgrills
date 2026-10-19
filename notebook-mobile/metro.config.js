const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Other Expo apps in this repository share identical dependency sources.
// Isolate transformed manifests and environment-specific API configuration.
config.cacheVersion = 'dune-grills-notebook-v1:' + (process.env.EXPO_PUBLIC_API_URL || 'device-only') + ':' + (process.env.EXPO_PUBLIC_APP_ENV || 'development');
module.exports = config;
