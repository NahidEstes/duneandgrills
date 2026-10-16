import { catalogText } from '../i18n/core';
import { useLanguage } from '../i18n/LocaleProvider';
import { useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Pressable, Text } from '../i18n/native';
import { router } from 'expo-router';
import { ArrowRight, ChevronRight, MapPin, Plus, ShoppingBag, Banknote, UtensilsCrossed } from './icons';
import { useApp } from '../state/AppProvider';
import { emptySelection, lineFor, money, subtotal } from '../domain/cart';
import type { Product } from '../domain/types';
import { palette } from '../constants/design';
import { Chip, FoodImage, IconButton, messageOf, styles } from './ui';
import { FavoriteButton } from './favorite';

export function openProduct(product: Product) { if (product.productType === 'combo') router.push({ pathname: '/combo/[id]', params: { id: product._id } }); else router.push({ pathname: '/item/[id]', params: { id: product._id, type: product.productType } }); }
export function openMenu(category = 'All', q = '') { router.navigate({ pathname: '/(tabs)', params: { category, q, filter: Date.now().toString() } }); }
export function useProductAdder() {
  const app = useApp(); const gate = useRef(false); const [working, setWorking] = useState(false); const [error, setError] = useState('');
  const add = async (product: Product) => {
    if (gate.current || app.pending) return;
    if (product.productType === 'combo' || product.customization?.enabled || product.addOns?.length) { openProduct(product); return; }
    gate.current = true; setWorking(true); setError('');
    try { await app.add(lineFor(product, emptySelection(), 1)); } catch (e) { setError(messageOf(e)); } finally { gate.current = false; setWorking(false); }
  };
  return { add, error, disabled: working || !!app.pending || app.busy };
}
export function CategoryChips({ categories, selected, change }: { categories: string[]; selected: string; change: (category: string) => void }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} keyboardShouldPersistTaps="handled">{categories.map(category => <Chip key={category} label={category} selected={selected === category} onPress={() => change(category)} />)}</ScrollView>;
}
export function ProductCard({ product, grid = false, add, disabled }: { product: Product; grid?: boolean; add: (product: Product) => void; disabled?: boolean }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const { width, fontScale } = useWindowDimensions(); const stacked = !grid && fontScale > 1.35;
  const photoWidth = Math.min(126, Math.max(90, width * 0.30));
  return <View style={[styles.card, { padding: grid ? 0 : 6, gap: grid ? 0 : 12, overflow: 'hidden', flexDirection: grid || stacked ? 'column' : 'row' }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${catalogText(product)}`} onPress={() => openProduct(product)} style={grid || stacked ? undefined : { width: photoWidth, alignSelf: 'stretch' }}><FoodImage uri={product.image} style={grid ? { height: undefined, aspectRatio: 1.13, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : stacked ? { height: 170 } : { height: undefined, minHeight: 130, flex: 1 }} /></Pressable>
    <View style={{ flex: 1, minWidth: 0, gap: grid ? 8 : 10, padding: grid ? 12 : 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}><Pressable accessibilityRole="button" accessibilityLabel={`Details for ${catalogText(product)}`} onPress={() => openProduct(product)} style={{ flex: 1, minWidth: 0 }}><Text style={[styles.heading, { fontSize: grid ? 17 : 20 }]}>{catalogText(product)}</Text>{!grid && !!catalogText(product, 'description') && <Text style={[styles.muted, { marginTop: 6 }]}>{catalogText(product, 'description')}</Text>}</Pressable>{!grid && <FavoriteButton product={product} />}</View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, marginTop: 'auto' }}><Text style={[grid ? styles.muted : styles.heading, { flexShrink: 1 }]}>{money(product.price)}</Text><IconButton icon={Plus} orange label={`Add ${catalogText(product)}`} onPress={() => add(product)} disabled={disabled || !product.isAvailable} /></View>
      {!product.isAvailable && <Text style={styles.muted}>Unavailable</Text>}
    </View>
    {grid && <View style={{ position: 'absolute', top: 8, right: 8 }}><FavoriteButton product={product} /></View>}
  </View>;
}
export function CartBar() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const { cart } = useApp(); const count = cart.reduce((n, line) => n + line.quantity, 0);
  if (!count) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`View cart, ${count} items, ${money(subtotal(cart))}`} onPress={() => router.push('/(tabs)/cart')} style={({ pressed }) => ({ marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 20, backgroundColor: palette.orange, flexDirection: 'row', gap: 12, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}><ShoppingBag color={palette.onOrange} size={28} /><Text style={[styles.heading, { color: palette.onOrange, flex: 1 }]}>{count} {count === 1 ? 'item' : 'items'}</Text><View style={{ alignItems: 'flex-end', flexShrink: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Text style={[styles.text, { color: palette.onOrange }]}>View cart</Text><ChevronRight color={palette.onOrange} size={18} /></View><Text style={[styles.heading, { color: palette.onOrange }]}>{money(subtotal(cart))}</Text></View></Pressable>;
}
export function AddressCard({ address, compact = false, disabled = false }: { address: string; compact?: boolean; disabled?: boolean }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <Pressable accessibilityRole="button" accessibilityLabel={`Choose delivery address${address ? `, ${address}` : ''}`} accessibilityState={{ disabled }} disabled={disabled} onPress={() => router.push('/address-select')} style={[compact ? { paddingVertical: 2, minHeight: 48 } : styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}><MapPin size={compact ? 22 : 26} color={palette.orange} /><View style={{ flex: 1 }}><Text style={compact ? styles.muted : styles.heading}>{compact ? 'Deliver to' : 'Delivery address'}</Text><Text style={compact ? styles.text : styles.muted}>{address || 'Choose your address'}</Text></View><ChevronRight size={22} color={palette.text} /></Pressable>;
}
export function PaymentCard({ type }: { type: 'delivery' | 'pickup' }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <View style={[styles.card, { flexDirection: 'row', alignItems: 'center' }]}><Banknote color={palette.text} size={26} /><View style={{ flex: 1, gap: 4 }}><Text style={styles.heading}>Payment method</Text><Text style={styles.muted}>Cash on {type === 'delivery' ? 'delivery' : 'pickup'}</Text></View></View>;
}
export function OrderSummary({ sub, discount = 0, fee, pointsDiscount = 0, reviewed = false }: { sub: number; pointsDiscount?: number; discount?: number; fee?: number; reviewed?: boolean }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <View style={styles.card}><Text style={styles.heading}>Order summary</Text><View style={styles.between}><Text style={styles.text}>Subtotal</Text><Text style={styles.text}>{money(sub)}</Text></View>{discount > 0 && <View style={styles.between}><Text style={styles.text}>Coupon discount</Text><Text style={styles.text}>−{money(discount)}</Text></View>}{pointsDiscount > 0 && <View style={styles.between}><Text style={styles.text}>Points discount</Text><Text style={styles.text}>−{money(pointsDiscount)}</Text></View>}<View style={styles.between}><Text style={styles.muted}>Delivery fee</Text><Text style={styles.text}>{fee === undefined ? 'At checkout' : money(fee)}</Text></View><View style={[styles.between, { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 12 }]}><Text style={styles.heading}>{reviewed ? 'Reviewed total' : 'Total'}</Text><Text style={styles.heading}>{fee === undefined ? 'At checkout' : money(Number((sub - discount - pointsDiscount + fee).toFixed(2)))}</Text></View><Text style={styles.muted}>Prices are confirmed again before ordering.</Text></View>;
}
export function SectionLink({ title, label = 'View all', onPress }: { title: string; label?: string; onPress: () => void }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <View style={styles.between}><Text style={[styles.heading, { fontSize: 25 }]}>{title}</Text><Pressable accessibilityRole="button" onPress={onPress} style={{ flexDirection: 'row', minHeight: 48, alignItems: 'center', gap: 6 }}><Text style={[styles.text, { color: palette.orange, fontWeight: '700' }]}>{label}</Text><ArrowRight size={20} color={palette.orange} /></Pressable></View>;
}
export function CategoryShortcuts({ categories }: { categories: string[] }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{categories.map(category => <Pressable key={category} accessibilityRole="button" accessibilityLabel={`Browse ${category}`} onPress={() => openMenu(category)} style={[styles.card, { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: 10 }]}><UtensilsCrossed size={25} color={palette.orange} /><Text style={[styles.text, { fontWeight: '600' }]}>{category}</Text></Pressable>)}</ScrollView>;
}

