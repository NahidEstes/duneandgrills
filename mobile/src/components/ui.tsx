import { useLanguage } from '../i18n/LocaleProvider';
import React from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type TextInputProps, type ListRenderItem, type StyleProp, type ViewStyle } from 'react-native';
import { ActivityIndicator, Pressable, Text, TextInput } from '../i18n/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Minus, Plus, Search, Store, Truck, type LucideIcon } from './icons';
import { imageUrl } from '../services/api';
import { palette, radius, spacing, typography } from '../constants/design';
export { messageOf } from '../services/customer-message';
// Legacy names keep existing customer screens on the shared design system.
export const colors = { ink: palette.text, muted: palette.muted, accent: palette.orange, green: palette.orange, cream: palette.background, line: palette.border, white: palette.surface, danger: palette.danger };
const fontFamily = typography.family;
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background }, content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.roomy, width: '100%', maxWidth: 720, alignSelf: 'center' },
  title: { fontFamily, fontSize: typography.title, fontWeight: '800', color: palette.text, letterSpacing: -0.7 }, heading: { fontFamily, fontSize: typography.heading, fontWeight: '700', color: palette.text, letterSpacing: -0.3 },
  text: { fontFamily, fontSize: typography.body, lineHeight: 24, color: palette.text }, muted: { fontFamily, fontSize: typography.caption, lineHeight: 21, color: palette.muted },
  card: { backgroundColor: palette.surface, borderRadius: radius.card, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: palette.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }, between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  field: { fontFamily, backgroundColor: palette.surface, color: palette.text, borderColor: palette.border, borderWidth: 1, borderRadius: radius.input, padding: 14, minHeight: 52, fontSize: typography.body },
  button: { backgroundColor: palette.orange, borderRadius: radius.input, minHeight: 52, padding: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily, color: palette.onOrange, fontSize: typography.body, fontWeight: '700' }, error: { fontFamily, color: palette.danger, fontSize: 15, lineHeight: 22 },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 20, paddingVertical: 12, minHeight: 48, justifyContent: 'center', backgroundColor: palette.surface },
});
export function Screen({ children, refreshing, onRefresh, top = false, footer }: React.PropsWithChildren<{ refreshing?: boolean; onRefresh?: () => void; top?: boolean; footer?: React.ReactNode }>) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <SafeAreaView style={styles.screen} edges={top ? ['top', 'left', 'right'] : ['left', 'right', 'bottom']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={top ? 0 : 90}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={palette.orange} /> : undefined}>{children}</ScrollView>{footer}
  </KeyboardAvoidingView></SafeAreaView>;
}
export function ListScreen<T>({ children, footer, data, renderItem, keyExtractor, refreshing, onRefresh }: React.PropsWithChildren<{ footer?: React.ReactNode; data: T[]; renderItem: ListRenderItem<T>; keyExtractor: (item: T) => string; refreshing: boolean; onRefresh: () => void }>) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}><FlatList data={data} renderItem={renderItem} keyExtractor={keyExtractor}
    contentContainerStyle={styles.content} ListHeaderComponent={<View style={{ gap: 16, paddingBottom: 16 }}>{children}</View>} ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
    initialNumToRender={6} maxToRenderPerBatch={6} windowSize={7} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" refreshing={refreshing} onRefresh={onRefresh} />{footer}</SafeAreaView>;
}
export function Button({ title, onPress, disabled, secondary, label }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; label?: string }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <Pressable accessibilityRole="button" accessibilityLabel={label || title} accessibilityState={{ disabled: !!disabled }} onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, secondary && { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }, { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}><Text style={[styles.buttonText, secondary && { color: palette.orange }]}>{title}</Text></Pressable>;
}
export function IconButton({ icon: Icon, label, onPress, disabled, orange = false }: { icon: LucideIcon; label: string; onPress: () => void; disabled?: boolean; orange?: boolean }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: orange ? palette.orange : 'transparent', opacity: disabled ? 0.45 : pressed ? 0.65 : 1 })}><Icon size={25} color={orange ? palette.onOrange : palette.text} strokeWidth={1.8} /></Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <View style={{ gap: 6 }}><Text style={styles.muted}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={palette.muted} selectionColor={palette.orange} {...props} style={[styles.field, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, props.style]} /></View>;
}
export function SearchField(props: TextInputProps & { label: string }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <View style={[styles.field, { flexDirection: 'row', gap: 12, alignItems: 'center', borderRadius: 28 }]}><Search color={palette.muted} size={23} /><TextInput {...props} accessibilityLabel={props.label} placeholderTextColor={palette.muted} selectionColor={palette.orange} style={[styles.text, { flex: 1, minWidth: 0, padding: 0 }, props.style]} returnKeyType="search" /></View>;
}
export function Notice({ message, retry }: { message: string; retry?: () => void }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  if (!message) return null;
  return <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{message}</Text>{retry && <Button title="Retry" secondary onPress={retry} />}</View>;
}
export function Loading() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage(); return <ActivityIndicator accessibilityLabel="Loading" size="large" color={palette.orange} style={{ padding: 30 }} />; }
export function FoodImage(props: { uri: string; large?: boolean; style?: StyleProp<ViewStyle> }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage(); return <FoodImageContent key={props.uri} {...props} />; }
function FoodImageContent({ uri, large, style }: { uri: string; large?: boolean; style?: StyleProp<ViewStyle> }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const [failed, setFailed] = React.useState(false); const source = imageUrl(uri);
  return <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[{ backgroundColor: palette.background, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, !style && { height: large ? 240 : 150 }, style]}>
    <Image source={require('../../assets/images/brand.png')} style={{ width: 60, height: 60, borderRadius: 14, opacity: 0.75 }} />
    {!!source && !failed && <Image source={{ uri: source }} onError={() => setFailed(true)} style={StyleSheet.absoluteFill} resizeMode="cover" />}
  </View>;
}
export function Chip({ label, selected, onPress, disabled, translate = true }: { label: string; selected?: boolean; onPress: () => void; disabled?: boolean; translate?: boolean }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected, disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[styles.chip, selected && { backgroundColor: palette.orange, borderColor: palette.orange }, disabled && { opacity: 0.45 }]}><Text translate={translate} style={{ fontFamily, fontSize: 15, color: selected ? palette.onOrange : palette.text, fontWeight: '700' }}>{label}</Text></Pressable>;
}
export function Quantity({ value, change, disabled }: { value: number; change: (n: number) => void; disabled?: boolean }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 26, borderWidth: 1, borderColor: palette.border, alignSelf: 'flex-start' }}><IconButton icon={Minus} label="Decrease quantity" disabled={disabled || value <= 1} onPress={() => change(value - 1)} /><Text accessibilityLabel={`Quantity ${value}`} style={[styles.text, { minWidth: 30, textAlign: 'center' }]}>{value}</Text><IconButton icon={Plus} label="Increase quantity" disabled={disabled || value >= 99} onPress={() => change(value + 1)} /></View>;
}
export function FulfillmentSelector({ value, change, disabled, available = ['delivery', 'pickup'] }: { value: 'delivery' | 'pickup'; change: (type: 'delivery' | 'pickup') => void; disabled?: boolean; available?: string[] }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <View style={{ flexDirection: 'row', padding: 4, backgroundColor: palette.surface, borderRadius: 30, borderWidth: 1, borderColor: palette.border }}>{(['delivery', 'pickup'] as const).filter(type => available.includes(type)).map(type => {
    const Icon = type === 'delivery' ? Truck : Store; const active = value === type;
    return <Pressable key={type} accessibilityRole="button" accessibilityState={{ selected: active, disabled: !!disabled }} accessibilityLabel={type === 'delivery' ? 'Delivery' : 'Pickup'} disabled={disabled} onPress={() => change(type)} style={({ pressed }) => ({ flex: 1, minHeight: 48, borderRadius: 26, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? palette.orange : 'transparent', opacity: disabled ? 0.45 : pressed ? 0.7 : 1 })}><Icon size={23} color={active ? palette.onOrange : palette.muted} /><Text style={[styles.text, { fontWeight: '700', flexShrink: 1, color: active ? palette.onOrange : palette.muted }]}>{type === 'delivery' ? 'Delivery' : 'Pickup'}</Text></Pressable>;
  })}</View>;
}
