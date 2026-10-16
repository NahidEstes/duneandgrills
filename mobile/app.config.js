const { buildConfig } = require('./scripts/build-config.cjs');
module.exports = ({ config }) => {
  const result = buildConfig(config);
  return { ...result, plugins: [...(result.plugins || []), ['expo-location', { locationWhenInUsePermission: 'Allow Dune & Grills to select your delivery location.', isAndroidBackgroundLocationEnabled: false, isAndroidForegroundServiceEnabled: false }], ...(process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ? [['react-native-maps', { androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY }]] : [])], android: { ...result.android, blockedPermissions: result.android.blockedPermissions.filter(permission => !['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'].includes(permission)) } };
};
