import { Tabs } from 'expo-router';
import { House, List, UserRound, Wallet } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../components/ui';
export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.amber, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: '#101515', borderTopColor: colors.border, height: 68 + insets.bottom, paddingTop: 7, paddingBottom: Math.max(insets.bottom, 8) }, tabBarLabelStyle: { fontSize: 11, fontWeight: '600' }, sceneStyle: { backgroundColor: colors.bg } }}><Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} /><Tabs.Screen name="deliveries" options={{ title: 'Deliveries', tabBarIcon: ({ color, size }) => <List color={color} size={size} /> }} /><Tabs.Screen name="cash" options={{ title: 'Cash', tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} /> }} /><Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} /></Tabs>;
}
