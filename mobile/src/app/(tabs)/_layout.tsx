import { useLanguage } from '../../i18n/LocaleProvider';
import { t } from '../../i18n/core';
import { Tabs, usePathname } from 'expo-router';
import { Home, UtensilsCrossed, ReceiptText, UserRound } from '../../components/icons';
import { palette } from '../../constants/design';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
export default function TabLayout() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  useLanguage();
  const insets = useSafeAreaInsets(); const { fontScale } = useWindowDimensions();
  const inOffers = usePathname() === '/offers';
  return <Tabs initialRouteName="home" backBehavior="initialRoute" screenOptions={{ headerShown: false, tabBarActiveTintColor: palette.orange, tabBarInactiveTintColor: palette.muted, tabBarHideOnKeyboard: true,
    tabBarStyle: { backgroundColor: palette.background, borderTopColor: palette.border, height: 72 + Math.max(0, fontScale - 1) * 20 + insets.bottom, paddingTop: 8, paddingBottom: Math.max(8, insets.bottom) }, tabBarLabelStyle: { fontSize: 12, fontWeight: '600' }, tabBarItemStyle: { minHeight: 48 } }}>
    <Tabs.Screen name="home" options={{ title: t('Home'), tabBarLabelStyle: { fontSize: 12, fontWeight: '600', ...(inOffers ? { color: palette.orange } : {}) }, tabBarIcon: ({ color }) => <Home size={25} color={inOffers ? palette.orange : color} strokeWidth={1.8} /> }} />
    <Tabs.Screen name="index" options={{ title: t('Menu'), tabBarIcon: ({ color }) => <UtensilsCrossed size={25} color={color} strokeWidth={1.8} /> }} />
    <Tabs.Screen name="orders" options={{ title: t('Orders'), tabBarIcon: ({ color }) => <ReceiptText size={25} color={color} strokeWidth={1.8} /> }} />
    <Tabs.Screen name="profile" options={{ title: t('Profile'), tabBarIcon: ({ color }) => <UserRound size={25} color={color} strokeWidth={1.8} /> }} />
    <Tabs.Screen name="cart" options={{ href: null, title: t('Your cart') }} />
    <Tabs.Screen name="offers" options={{ href: null, title: t('Offers') }} />
  </Tabs>;
}
