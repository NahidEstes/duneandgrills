import { router } from 'expo-router';
import { Text } from 'react-native';
import { Button, Screen, styles } from '../components/ui';
export default function NotFound() {
  return <Screen><Text style={styles.title}>Let’s get you back to the menu</Text><Text style={styles.text}>This page is unavailable.</Text><Button title="Open menu" onPress={() => router.replace('/(tabs)')} /></Screen>;
}
