import { useLanguage } from '../i18n/LocaleProvider';
import { Image, Modal, StyleSheet, View } from 'react-native';
import { Pressable, Text } from '../i18n/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, type LucideIcon } from './icons';
import { Button, Notice, colors, styles } from './ui';
import { palette } from '../constants/design';

export function ProfileBrand() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <View style={profileStyles.brand}><Image source={require('../../assets/images/brand.png')} style={{ width: 36, height: 36 }} resizeMode="contain" accessible={false} /><Text style={profileStyles.wordmark}>Dune & <Text style={{ color: colors.accent }}>Grills</Text></Text></View>;
}
export function ProfileRow({ icon: Icon, title, detail, onPress, disabled = false }: { icon: LucideIcon; title: string; detail?: string; onPress?: () => void; disabled?: boolean }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const contents = <><Icon size={25} color={colors.muted} accessible={false} /><View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={styles.text}>{title}</Text>{!!detail && <Text style={styles.muted}>{detail}</Text>}</View>{!!onPress && <ChevronRight size={22} color={colors.muted} accessible={false} />}</>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [profileStyles.row, pressed && { opacity: 0.65 }, disabled && { opacity: 0.5 }]}>{contents}</Pressable> : <View style={profileStyles.row}>{contents}</View>;
}
export function ProfileTile({ icon: Icon, title, onPress }: { icon: LucideIcon; title: string; onPress: () => void }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.card, profileStyles.tile, pressed && { opacity: 0.65 }]}><Icon color={colors.muted} size={24} accessible={false} /><Text style={[styles.text, { fontSize: 14, flexShrink: 1, fontWeight: '600' }]}>{title}</Text><ChevronRight size={18} color={colors.muted} accessible={false} /></Pressable>;
}
export function DeleteAddressDialog({ label, busy, error, onCancel, onDelete }: { label: string | null; busy: boolean; error: string; onCancel: () => void; onDelete: () => void }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <Modal visible={label !== null} transparent animationType="fade" onRequestClose={() => { if (!busy) onCancel(); }}><SafeAreaView style={profileStyles.overlay}><View accessibilityViewIsModal style={[styles.card, { width: '100%', maxWidth: 440 }]}><Text accessibilityRole="header" style={styles.heading}>Delete address?</Text><Text style={styles.text}>Remove “{label}” from your saved addresses?</Text><Notice message={error} /><Button title={busy ? 'Deleting…' : 'Delete address'} disabled={busy} onPress={onDelete} /><Button title="Cancel" secondary disabled={busy} onPress={onCancel} /></View></SafeAreaView></Modal>;
}
export const profileStyles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 },
  wordmark: { fontSize: 23, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 18, paddingHorizontal: 16, minHeight: 64 },
  group: { ...styles.card, padding: 0, gap: 0, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: colors.line, marginHorizontal: 16 },
  tile: { flex: 1, minWidth: 120, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, minHeight: 70, gap: 8 },
  section: { ...styles.muted, marginTop: 8, fontSize: 12, fontWeight: '700', letterSpacing: 1.8, textTransform: 'uppercase' },
  identity: { ...styles.card, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.orangeTint, borderWidth: 1, borderColor: '#79502D', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { color: colors.ink, fontSize: 27, fontWeight: '800' },
  edit: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  logout: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, borderRadius: 16, minHeight: 56, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 20 },
});
