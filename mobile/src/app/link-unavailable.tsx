import { useLanguage } from '../i18n/LocaleProvider';
import { Text } from '../i18n/native';
import { router } from 'expo-router';
import { Button, Screen, styles } from '../components/ui';
export default function LinkUnavailable() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage(); return <Screen><Text style={styles.title}>Link unavailable</Text><Text style={styles.text}>This link is invalid or is not a public Dune & Grills item. Explore the current menu instead.</Text><Button title="Explore menu" onPress={() => router.replace('/(tabs)')} /></Screen>; }
