import { Tabs } from 'expo-router';
import { Home, UtensilsCrossed, ReceiptText, UserRound } from '../../components/icons';
import { palette } from '../../constants/design';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
export default function TabLayout() {
  const insets = useSafeAreaInsets(); const { fontScale } = useWindowDimensions();
  return <Tabs initialRouteName="home" backBehavior="initialRoute" screenOptions={{ headerShown: false, tabBarActiveTintColor: palette.orange, tabBarInactiveTintColor: palette.muted, tabBarHideOnKeyboard: true,
    tabBarStyle: { backgroundColor: palette.background, borderTopColor: palette.border, height: 72 + Math.max(0, fontScale - 1) * 20 + insets.bottom, paddingTop: 8, paddingBottom: Math.max(8, insets.bottom) }, tabBarLabelStyle: { fontSize: 12, fontWeight: '600' }, tabBarItemStyle: { minHeight: 48 } }}>
    <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <Home size={25} color={color} strokeWidth={1.8} /> }} />
    <Tabs.Screen name="index" options={{ title: 'Menu', tabBarIcon: ({ color }) => <UtensilsCrossed size={25} color={color} strokeWidth={1.8} /> }} />
    <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color }) => <ReceiptText size={25} color={color} strokeWidth={1.8} /> }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <UserRound size={25} color={color} strokeWidth={1.8} /> }} />
    <Tabs.Screen name="cart" options={{ href: null, title: 'Your cart' }} />
  </Tabs>;
}
