import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '../state/AppProvider';
import { FavoritesProvider } from '../state/FavoritesProvider';
import { Button, Loading, Notice, Screen, colors, styles } from '../components/ui';
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <SafeAreaProvider><Screen><Text style={styles.title}>Let’s try that again</Text><Text style={styles.text}>This screen could not open. Your saved cart and any unresolved order are kept on this device.</Text><Button title="Try again" onPress={() => void retry()} /></Screen></SafeAreaProvider>;
}
export const unstable_settings = { initialRouteName: '(tabs)', screenErrorBoundary: ErrorBoundary };
function Navigation() {
  const app = useApp();
  if (!app.ready) return <Screen><Loading /><Notice message={app.error} retry={() => void app.bootstrap()} /></Screen>;
  return <><StatusBar style="light" /><Stack screenOptions={{ headerStyle: { backgroundColor: colors.cream }, headerTintColor: colors.ink, contentStyle: { backgroundColor: colors.cream } }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="item/[id]" options={{ title: 'Make it yours' }} />
    <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
    <Stack.Screen name="auth" options={{ title: 'Your account' }} />
    <Stack.Screen name="order/[id]" options={{ title: 'Order details' }} />
    <Stack.Screen name="address/[id]" options={{ title: 'Saved address' }} />
    <Stack.Screen name="address-select" options={{ title: 'Delivery address' }} />
    <Stack.Screen name="addresses" options={{ title: 'Saved addresses' }} />
    <Stack.Screen name="profile-edit" options={{ title: 'Edit profile' }} />
    <Stack.Screen name="combo/[id]" options={{ title: 'Combo details' }} />
    <Stack.Screen name="offer/[id]" options={{ title: 'Offer details' }} />
    <Stack.Screen name="favorites" options={{ title: 'Favourite foods' }} />
    <Stack.Screen name="points" options={{ headerShown: false }} />
    <Stack.Screen name="link-unavailable" options={{ title: 'Link unavailable' }} />
    <Stack.Screen name="explore" options={{ headerShown: false }} />
  </Stack></>;
}
export default function Layout() { return <SafeAreaProvider><AppProvider><FavoritesProvider><Navigation /></FavoritesProvider></AppProvider></SafeAreaProvider>; }
