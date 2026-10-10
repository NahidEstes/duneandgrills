import React from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { imageUrl } from '../services/api';
export const colors = { ink: '#242a21', muted: '#6c7165', accent: '#e89425', green: '#344c34', cream: '#faf7f0', line: '#e5e0d4', white: '#ffffff', danger: '#9b3026' };
const fontFamily = Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' });
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream }, content: { padding: 20, gap: 16, paddingBottom: 36, width: '100%', maxWidth: 720, alignSelf: 'center' },
  title: { fontFamily, fontSize: 30, fontWeight: '800', color: colors.ink }, heading: { fontFamily, fontSize: 20, fontWeight: '700', color: colors.ink },
  text: { fontFamily, fontSize: 16, lineHeight: 23, color: colors.ink }, muted: { fontFamily, fontSize: 14, lineHeight: 21, color: colors.muted },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  field: { fontFamily, backgroundColor: colors.white, color: colors.ink, borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 14, minHeight: 50, fontSize: 16 },
  button: { backgroundColor: colors.green, borderRadius: 13, minHeight: 50, padding: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily, color: colors.white, fontSize: 16, fontWeight: '700' }, error: { fontFamily, color: colors.danger, fontSize: 15, lineHeight: 22 },
  chip: { borderRadius: 24, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, paddingVertical: 12, minHeight: 46, backgroundColor: colors.white },
});
export function Screen({ children, refreshing, onRefresh }: React.PropsWithChildren<{ refreshing?: boolean; onRefresh?: () => void }>) {
  return <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.green} /> : undefined}>{children}</ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}
export function Button({ title, onPress, disabled, secondary }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, secondary && { backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.line }, { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}><Text style={[styles.buttonText, secondary && { color: colors.green }]}>{title}</Text></Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 6 }}><Text style={styles.muted}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} {...props} style={[styles.field, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, props.style]} /></View>;
}
export function Notice({ message, retry }: { message: string; retry?: () => void }) {
  if (!message) return null;
  return <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{message}</Text>{retry && <Button title="Retry" secondary onPress={retry} />}</View>;
}
export function Loading() { return <ActivityIndicator accessibilityLabel="Loading" size="large" color={colors.green} style={{ padding: 30 }} />; }
export function FoodImage(props: { uri: string; large?: boolean }) { return <FoodImageContent key={props.uri} {...props} />; }
function FoodImageContent({ uri, large }: { uri: string; large?: boolean }) {
  const [failed, setFailed] = React.useState(false);
  return uri && !failed ? <Image source={{ uri: imageUrl(uri) }} onError={() => setFailed(true)} style={{ width: '100%', height: large ? 240 : 150, borderRadius: 14 }} resizeMode="cover" /> : <View style={{ height: large ? 240 : 110, backgroundColor: colors.cream, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}><Text style={styles.heading}>Dune & Grills</Text></View>;
}
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={onPress} style={[styles.chip, selected && { backgroundColor: colors.green }]}><Text style={{ fontFamily, color: selected ? colors.white : colors.ink, fontWeight: '600' }}>{label}</Text></Pressable>;
}
export function Quantity({ value, change }: { value: number; change: (n: number) => void }) {
  return <View style={styles.row}><Button title="−" secondary disabled={value <= 1} onPress={() => change(value - 1)} /><Text accessibilityLabel={`Quantity ${value}`} style={styles.heading}>{value}</Text><Button title="+" secondary disabled={value >= 99} onPress={() => change(value + 1)} /></View>;
}
export const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please retry.';
