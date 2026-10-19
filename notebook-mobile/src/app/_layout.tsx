import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NotebookProvider, useNotebook } from '../state/NotebookProvider';
import { Brand, Button, c, Notice, Screen, s } from '../components/ui';
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <SafeAreaProvider><Screen><Brand /><Text style={s.title}>Let’s try that again</Text><Notice>Your saved notes are kept on this device.</Notice><Button title="Try Again" onPress={() => void retry()} /></Screen></SafeAreaProvider>;
}
function Navigation() {
  const app = useNotebook();
  if (!app.ready) return <Screen><Brand />{app.error ? <><Notice danger>{app.error}</Notice><Button title="Retry" onPress={() => void app.bootstrap()} /></> : <View style={{ paddingTop: 80, gap: 18 }}><ActivityIndicator color={c.amber} /><Text style={[s.muted, { textAlign: 'center' }]}>Opening your notebook…</Text></View>}</Screen>;
  return <><StatusBar style="light" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}><Stack.Screen name="(tabs)" /><Stack.Screen name="new" /><Stack.Screen name="note/[id]" /></Stack></>;
}
export default function Layout() { return <SafeAreaProvider><NotebookProvider><Navigation /></NotebookProvider></SafeAreaProvider>; }
