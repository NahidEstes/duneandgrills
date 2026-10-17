import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Image, Pressable, Text } from '../i18n/native';
import { useLanguage } from '../i18n/LocaleProvider';
import { useApp } from '../state/AppProvider';
import { ArrowLeft, ArrowRight, ShoppingBag } from './icons';
import { palette } from '../constants/design';
import { IconButton, styles } from './ui';

export function BrandHeader() {
  "use no memo";
  useLanguage();
  const { cart } = useApp();
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  return <View style={local.header}>
    <View style={local.brand}>
      <Image source={require('../../assets/images/brand.png')} accessibilityLabel="Dune & Grills logo" style={local.logo} />
      <Text translate={false} style={local.wordmark}>Dune & <Text translate={false} style={{ color: palette.orange }}>Grills</Text></Text>
    </View>
    <View>
      <IconButton icon={ShoppingBag} label={`Open cart, ${count} items`} onPress={() => router.push('/(tabs)/cart')} />
      {count > 0 && <View pointerEvents="none" style={local.badge}><Text translate={false} style={local.badgeText}>{count > 99 ? '99+' : count}</Text></View>}
    </View>
  </View>;
}

export function BackHeading({ title, detail, onBack }: { title: string; detail?: string; onBack: () => void }) {
  "use no memo";
  useLanguage();
  return <View style={local.header}><IconButton icon={ArrowLeft} label="Back" onPress={onBack} /><View style={{ flex: 1, minWidth: 0 }}><Text accessibilityRole="header" style={styles.heading}>{title}</Text>{!!detail && <Text style={styles.muted}>{detail}</Text>}</View></View>;
}

export function PurchaseFooter({ title, label, amount, disabled, onPress }: { title: string; label?: string; amount?: string; disabled?: boolean; onPress: () => void }) {
  "use no memo";
  useLanguage();
  return <View style={local.footer}><Pressable accessibilityRole="button" accessibilityLabel={label || title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [local.purchase, { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}>
    <Text style={[styles.buttonText, { flex: 1, flexShrink: 1 }]}>{title}</Text>
    {!!amount && <Text translate={false} style={styles.buttonText}>{amount}</Text>}
    <ArrowRight size={21} color={palette.onOrange} accessible={false} />
  </Pressable></View>;
}

export function SectionEyebrow({ children }: { children: string }) {
  "use no memo";
  useLanguage();
  return <Text style={local.eyebrow}>{children}</Text>;
}

const local = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  logo: { width: 38, height: 38, borderRadius: 11 },
  wordmark: { ...styles.heading, fontSize: 21, flexShrink: 1 },
  badge: { position: 'absolute', right: 0, top: 0, minWidth: 20, minHeight: 20, paddingHorizontal: 4, borderRadius: 12, backgroundColor: palette.orange, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: palette.onOrange, fontSize: 11, fontWeight: '800' },
  footer: { backgroundColor: palette.background, borderTopWidth: 1, borderTopColor: palette.border, paddingHorizontal: 20, paddingVertical: 12, width: '100%', maxWidth: 720, alignSelf: 'center' },
  purchase: { backgroundColor: palette.orange, borderRadius: 18, minHeight: 56, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  eyebrow: { ...styles.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1.6, marginTop: 8 },
});
