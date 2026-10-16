import { useLanguage } from '../i18n/LocaleProvider';
import { router } from 'expo-router';
import { Text } from '../i18n/native';
import { Button, Screen, styles } from '../components/ui';
export default function NotFound() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <Screen><Text style={styles.title}>Let’s get you back to the menu</Text><Text style={styles.text}>This page is unavailable.</Text><Button title="Open menu" onPress={() => router.replace('/(tabs)')} /></Screen>;
}
