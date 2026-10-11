import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, type LucideIcon } from './icons';
import { Button, Notice, colors, styles } from './ui';

export function ProfileBrand() {
  return <View style={profileStyles.brand}><Image source={require('../../assets/images/brand.png')} style={{ width: 36, height: 36 }} resizeMode="contain" accessible={false} /><Text style={profileStyles.wordmark}>Dune & <Text style={{ color: colors.accent }}>Grills</Text></Text></View>;
}
export function ProfileRow({ icon: Icon, title, detail, onPress, disabled = false }: { icon: LucideIcon; title: string; detail?: string; onPress?: () => void; disabled?: boolean }) {
  const contents = <><Icon size={25} color={colors.muted} accessible={false} /><View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={styles.text}>{title}</Text>{!!detail && <Text style={styles.muted}>{detail}</Text>}</View>{!!onPress && <ChevronRight size={22} color={colors.muted} accessible={false} />}</>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [profileStyles.row, pressed && { opacity: 0.65 }, disabled && { opacity: 0.5 }]}>{contents}</Pressable> : <View style={profileStyles.row}>{contents}</View>;
}
export function ProfileTile({ icon: Icon, title, onPress }: { icon: LucideIcon; title: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.card, profileStyles.tile, pressed && { opacity: 0.65 }]}><Icon color={colors.accent} size={30} accessible={false} /><Text style={[styles.text, { textAlign: 'center', fontWeight: '600' }]}>{title}</Text></Pressable>;
}
export function DeleteAddressDialog({ label, busy, error, onCancel, onDelete }: { label: string | null; busy: boolean; error: string; onCancel: () => void; onDelete: () => void }) {
  return <Modal visible={label !== null} transparent animationType="fade" onRequestClose={() => { if (!busy) onCancel(); }}><SafeAreaView style={profileStyles.overlay}><View accessibilityViewIsModal style={[styles.card, { width: '100%', maxWidth: 440 }]}><Text accessibilityRole="header" style={styles.heading}>Delete address?</Text><Text style={styles.text}>Remove “{label}” from your saved addresses?</Text><Notice message={error} /><Button title={busy ? 'Deleting…' : 'Delete address'} disabled={busy} onPress={onDelete} /><Button title="Cancel" secondary disabled={busy} onPress={onCancel} /></View></SafeAreaView></Modal>;
}
export const profileStyles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 },
  wordmark: { fontSize: 23, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 18, paddingHorizontal: 16, minHeight: 64 },
  group: { ...styles.card, padding: 0, gap: 0, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: colors.line, marginHorizontal: 16 },
  tile: { flex: 1, minWidth: 120, alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 10 },
  section: { ...styles.muted, marginTop: 4, fontSize: 15 },
  identity: { ...styles.card, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { color: colors.ink, fontSize: 27, fontWeight: '800' },
  edit: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  logout: { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 16, minHeight: 52, padding: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 20 },
});
