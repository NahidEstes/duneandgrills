import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '../state/AppProvider';
import { Loading, Notice, Screen, colors } from '../components/ui';
function Navigation() {
  const app = useApp();
  if (!app.ready) return <Screen><Loading /><Notice message={app.error} retry={() => void app.bootstrap()} /></Screen>;
  return <><StatusBar style="dark" /><Stack screenOptions={{ headerStyle: { backgroundColor: colors.cream }, headerTintColor: colors.green, contentStyle: { backgroundColor: colors.cream } }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="item/[id]" options={{ title: 'Make it yours' }} />
    <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
    <Stack.Screen name="auth" options={{ title: 'Your account' }} />
    <Stack.Screen name="order/[id]" options={{ title: 'Order details' }} />
    <Stack.Screen name="address/[id]" options={{ title: 'Saved address' }} />
    <Stack.Screen name="explore" options={{ headerShown: false }} />
  </Stack></>;
}
export default function Layout() { return <SafeAreaProvider><AppProvider><Navigation /></AppProvider></SafeAreaProvider>; }
