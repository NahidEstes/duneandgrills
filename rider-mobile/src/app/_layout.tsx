import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';
import { RiderProvider, useRider } from '../state/RiderProvider';
import { DEMO } from '../services/api';
import { Brand, Button, colors, Notice, Screen, styles } from '../components/ui';
import Recovery from '../components/Recovery';
export function ErrorBoundary({ retry }: ErrorBoundaryProps) { return <SafeAreaProvider><Screen><Brand /><Text style={styles.title}>Let&apos;s try that again</Text><Text style={styles.text}>Your secure session and any unresolved delivery action are kept on this device.</Text><Button title="Try again" onPress={() => void retry()} /></Screen></SafeAreaProvider>; }
function Navigation() {
  const app = useRider();
  if (!app.ready) return <Screen><Brand /><Text style={styles.heading}>Restoring your secure workspace…</Text><Notice text={app.error} danger />{app.error && <Button title="Reconnect" onPress={() => void app.bootstrap()} />}</Screen>;
  return <View style={{ flex: 1, backgroundColor: colors.bg }}><StatusBar style="light" />{DEMO && <SafeAreaView edges={['top']} style={{ backgroundColor: '#3b2d17' }}><Text style={[styles.muted, { textAlign: 'center', padding: 7, color: colors.amber }]}>READ-ONLY DESIGN PREVIEW · SAMPLE DATA</Text></SafeAreaView>}<Recovery /><Stack key={app.session?.user._id || 'signed-out'} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}><Stack.Protected guard={!!app.session}><Stack.Screen name="(tabs)" /></Stack.Protected><Stack.Protected guard={!app.session}><Stack.Screen name="sign-in" /></Stack.Protected></Stack></View>;
}
export default function Layout() { return <SafeAreaProvider><RiderProvider><Navigation /></RiderProvider></SafeAreaProvider>; }
