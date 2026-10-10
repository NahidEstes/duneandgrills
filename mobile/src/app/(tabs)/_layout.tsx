import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useApp } from '../../state/AppProvider';
import { colors } from '../../components/ui';
export default function TabLayout() {
  const { cart } = useApp();
  return <Tabs screenOptions={{ tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: colors.muted,
    headerStyle: { backgroundColor: colors.cream }, headerTintColor: colors.green, tabBarHideOnKeyboard: true,
    tabBarStyle: { backgroundColor: colors.white }, tabBarLabelStyle: { fontSize: 12, fontWeight: '600' } }}>
    <Tabs.Screen name="index" options={{ title: 'Menu', headerTitle: 'Dune & Grills', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }}>♨</Text> }} />
    <Tabs.Screen name="cart" options={{ title: 'Cart', tabBarBadge: cart.length ? cart.reduce((s, c) => s + c.quantity, 0) : undefined, tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 22 }}>▤</Text> }} />
    <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 22 }}>◷</Text> }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 22 }}>◉</Text> }} />
  </Tabs>;
}
