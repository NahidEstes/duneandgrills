import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { ArrowLeft, Check, Clock3, X, type LucideIcon } from 'lucide-react-native';
import { router } from 'expo-router';
import logo from './brand-svg';
import type { Note } from '../domain/notebook';

export const c = { bg: '#000000', ink: '#0A0908', surface: '#121110', border: '#2A2320', amber: '#F59E0B', deep: '#D97706', sand: '#E7D9C4', text: '#FAFAFA', muted: '#A79E94', tint: '#271B09' };
export function Brand({ compact = false }: { compact?: boolean }) {
  return <View style={[s.row, { gap: 9, justifyContent: 'center', marginBottom: compact ? 0 : 22 }]}><SvgXml xml={logo} width={compact ? 43 : 55} height={compact ? 34 : 43} /><Text style={{ color: c.sand, fontFamily: 'serif', fontSize: compact ? 21 : 25, fontWeight: '700' }}>Dune &amp; Grills</Text></View>;
}
export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: ViewStyle }) {
  return <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}><View style={s.shell}>{scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, style]}>{children}</ScrollView> : <View style={[{ flex: 1 }, style]}>{children}</View>}</View></SafeAreaView>;
}
export function Heading({ title, subtitle, back = false }: { title: string; subtitle?: string; back?: boolean }) {
  return <View style={{ marginBottom: 24 }}><View style={[s.row, { marginBottom: 22 }]}>{back && <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={s.back}><ArrowLeft color={c.amber} size={24} /></Pressable>}<View style={{ flex: 1 }}><Brand compact /></View>{back && <View style={{ width: 40 }} />}</View><Text accessibilityRole="header" style={s.title}>{title}</Text>{subtitle && <Text style={[s.muted, { marginTop: 7 }]}>{subtitle}</Text>}</View>;
}
export function Button({ title, onPress, icon: Icon, secondary = false, busy = false, disabled = false }: { title: string; onPress: () => void; icon?: LucideIcon; secondary?: boolean; busy?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, { opacity: disabled || busy ? 0.45 : pressed ? 0.8 : 1 }]}>{busy ? <ActivityIndicator color={secondary ? c.amber : c.bg} /> : Icon && <Icon color={secondary ? c.amber : c.bg} size={22} />}<Text style={[s.buttonLabel, secondary && { color: c.amber }]}>{title}</Text></Pressable>;
}
export function Badge({ note }: { note: Pick<Note, 'status' | 'conflict'> }) {
  const pending = note.status === 'pending';
  const Icon = pending ? Clock3 : Check;
  return <View style={[s.badge, { backgroundColor: pending ? c.tint : '#29241D', borderColor: pending ? '#714509' : '#514530' }]}><Icon size={12} color={pending ? c.amber : c.sand} /><Text style={{ color: pending ? c.amber : c.sand, fontSize: 11, fontWeight: '600' }}>{note.conflict ? 'Sync review' : pending ? 'Pending Entry' : 'Entered'}</Text></View>;
}
export function Notice({ children, danger = false }: { children?: ReactNode; danger?: boolean }) {
  return children ? <View accessibilityRole={danger ? 'alert' : undefined} style={[s.notice, danger && { borderColor: '#8D4534' }]}><Text style={{ color: danger ? '#FECACA' : c.sand, fontSize: 13, lineHeight: 20 }}>{children}</Text></View> : null;
}
export function Field({ label, optional, ...props }: TextInputProps & { label: string; optional?: boolean }) {
  return <View style={{ gap: 9 }}><Text style={s.label}>{label}{optional && <Text style={s.muted}> (optional)</Text>}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#756E65" selectionColor={c.amber} {...props} style={[s.input, props.style]} /></View>;
}
export function Chip({ title, active, onPress, icon: Icon }: { title: string; active: boolean; onPress: () => void; icon?: LucideIcon }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [s.chip, active && { backgroundColor: c.amber, borderColor: c.amber }, pressed && { opacity: 0.8 }]}>{Icon && <Icon size={17} color={active ? c.bg : c.sand} />}<Text style={{ color: active ? c.bg : c.sand, fontWeight: '600', fontSize: 13 }}>{title}</Text></Pressable>;
}
export function ReceiptViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return <Modal visible={!!uri} animationType="fade" onRequestClose={onClose}><SafeAreaView style={s.safe}><View style={[s.row, { padding: 20, justifyContent: 'space-between' }]}><Text style={s.heading}>Receipt Photo</Text><Pressable accessibilityRole="button" accessibilityLabel="Close receipt" onPress={onClose} style={s.back}><X color={c.amber} /></Pressable></View>{uri && <ScrollView contentContainerStyle={{ flexGrow: 1 }} maximumZoomScale={4} minimumZoomScale={1}><Image accessibilityLabel="Attached receipt" source={{ uri }} style={{ width: '100%', height: 700 }} resizeMode="contain" /></ScrollView>}</SafeAreaView></Modal>;
}
export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg }, shell: { flex: 1, width: '100%', maxWidth: 580, alignSelf: 'center' },
  content: { padding: 22, paddingBottom: 32, gap: 18 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 30, lineHeight: 37, letterSpacing: -0.7, fontWeight: '800', color: c.text },
  heading: { color: c.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  text: { color: c.text, fontSize: 15, lineHeight: 24 }, muted: { color: c.muted, fontSize: 13, lineHeight: 20 },
  label: { color: c.sand, fontSize: 14, fontWeight: '500' },
  card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 20, padding: 20 },
  button: { minHeight: 56, paddingVertical: 15, paddingHorizontal: 16, borderRadius: 15, backgroundColor: c.amber, borderWidth: 1, borderColor: c.amber, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  secondary: { backgroundColor: 'transparent' }, buttonLabel: { color: c.bg, fontSize: 16, fontWeight: '700' },
  badge: { alignSelf: 'flex-start', borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  notice: { padding: 14, backgroundColor: '#1A150E', borderRadius: 13, borderWidth: 1, borderColor: '#3A2A13' },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 13, backgroundColor: c.surface, color: c.text, padding: 15, fontSize: 16, minHeight: 52 },
  chip: { flexDirection: 'row', gap: 7, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#3C3020', backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: c.border, marginVertical: 16 },
});
