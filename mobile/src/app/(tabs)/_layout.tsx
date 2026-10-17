import { useLanguage } from '../../i18n/LocaleProvider';
import { t } from '../../i18n/core';
import { Tabs } from 'expo-router';
import { Home, UtensilsCrossed, ReceiptText, UserRound, Tag } from '../../components/icons';
import { palette } from '../../constants/design';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { Text } from '../../i18n/native';
export default function TabLayout() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const insets = useSafeAreaInsets(); const { fontScale } = useWindowDimensions();
  return <Tabs initialRouteName="home" backBehavior="initialRoute" screenOptions={{ headerShown: false, tabBarActiveTintColor: palette.orange, tabBarInactiveTintColor: palette.muted, tabBarHideOnKeyboard: true,
    tabBarStyle: { backgroundColor: palette.background, borderTopColor: palette.border, height: 72 + Math.max(0, fontScale - 1) * 20 + insets.bottom, paddingTop: 8, paddingBottom: Math.max(8, insets.bottom) }, tabBarLabelPosition: 'below-icon', tabBarLabelStyle: { fontSize: 11, fontWeight: '600' }, tabBarItemStyle: { minHeight: 48 } }}>
    <Tabs.Screen name="home" options={{ title: t('Home'), tabBarIcon: ({ color }) => <Home size={25} color={color} strokeWidth={1.8} /> }} />
    <Tabs.Screen name="index" options={{ title: t('Menu'), tabBarIcon: ({ color }) => <UtensilsCrossed size={25} color={color} strokeWidth={1.8} /> }} />
    <Tabs.Screen name="offers" options={{ title: t('Offers'), tabBarIcon: ({ color }) => <Tag size={25} color={color} strokeWidth={1.8} /> }} />
    <Tabs.Screen name="orders" options={{ title: t('Orders'), tabBarIcon: ({ color }) => <ReceiptText size={25} color={color} strokeWidth={1.8} /> }} />
    <Tabs.Screen name="profile" options={{ title: t('Profile'), tabBarLabel: ({ color }) => <Text style={{ color, fontSize: 11, lineHeight: 14, fontWeight: '600', textAlign: 'center', maxWidth: '100%', flexShrink: 1 }}>{t('Profile')}</Text>, tabBarIcon: ({ color }) => <UserRound size={25} color={color} strokeWidth={1.8} /> }} />
    <Tabs.Screen name="cart" options={{ href: null, title: t('Your cart') }} />
  </Tabs>;
}
