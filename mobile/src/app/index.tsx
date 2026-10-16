import { useLanguage } from '../i18n/LocaleProvider';
import { Redirect } from 'expo-router';
export default function Index() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage(); return <Redirect href="/(tabs)/home" />; }
