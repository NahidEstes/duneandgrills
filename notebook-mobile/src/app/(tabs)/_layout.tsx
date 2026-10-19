import { Tabs } from 'expo-router';
import { Home, NotebookPen, Settings } from 'lucide-react-native';
import { c } from '../../components/ui';
export default function Layout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.amber, tabBarInactiveTintColor: c.muted, tabBarStyle: { backgroundColor: '#0C0B09', borderTopColor: c.border, paddingTop: 9, height: 78, paddingBottom: 15 }, tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 4 }, sceneStyle: { backgroundColor: c.bg } }}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Home size={23} color={color} /> }} />
    <Tabs.Screen name="notes" options={{ title: 'All Notes', tabBarIcon: ({ color }) => <NotebookPen size={23} color={color} /> }} />
    <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <Settings size={23} color={color} /> }} />
  </Tabs>;
}
