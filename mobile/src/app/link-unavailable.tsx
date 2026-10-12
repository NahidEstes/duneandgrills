import { Text } from 'react-native';
import { router } from 'expo-router';
import { Button, Screen, styles } from '../components/ui';
export default function LinkUnavailable() { return <Screen><Text style={styles.title}>Link unavailable</Text><Text style={styles.text}>This link is invalid or is not a public Dune & Grills item. Explore the current menu instead.</Text><Button title="Explore menu" onPress={() => router.replace('/(tabs)')} /></Screen>; }
