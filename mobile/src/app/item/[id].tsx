import { catalogText } from '../../i18n/core';
import { useLanguage } from '../../i18n/LocaleProvider';
import { useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Pressable, Text } from '../../i18n/native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { api } from '../../services/api';
import { useResource } from '../../hooks/useResource';
import { availableAddOns, emptySelection, lineFor, money, selectionError } from '../../domain/cart';
import type { Product, Selection } from '../../domain/types';
import { useApp } from '../../state/AppProvider';
import { useFavorites } from '../../state/FavoritesProvider';
import { FavoriteButton } from '../../components/favorite';
import { ShareButton } from '../../components/share';
import { validPublicId } from '../../domain/public-links';
import { Chip, Field, FoodImage, Loading, Notice, Quantity, Screen, messageOf, styles } from '../../components/ui';
import { PurchaseFooter } from '../../components/storefront';
import { palette } from '../../constants/design';
export default function Item() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const { id, type } = useLocalSearchParams<{ id: string; type?: string }>();
  return type === 'combo' ? <Redirect href={{ pathname: '/combo/[id]', params: { id } }} /> : <ItemContents key={id} />;
}
function ItemContents() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const { id, type, favorite } = useLocalSearchParams<{ id: string; type?: string; favorite?: string }>(); const kind = type === 'combo' ? 'combo' : 'menuItem';
  const favorites = useFavorites();
  const { data: product, loading, error, refresh } = useResource<Product>(async signal => { if (!validPublicId(id)) throw new Error('This item link is invalid.'); return { ...(await api<{ data: Product }>(`/${kind === 'combo' ? 'combos' : 'menu'}/${encodeURIComponent(id)}`, { signal })).data, productType: kind }; }, `${kind}:${id}`);
  const [draft, setDraft] = useState<Selection | null>(null);
  const initialSelection = { ...emptySelection(), spiceLevel: product?.customization?.enabled && product.customization.spice?.enabled ? product.customization.spice.default || product.customization.spice.options[0] || '' : '' };
  const selection = draft || initialSelection;
  const setSelection = (update: (s: Selection) => Selection) => setDraft(s => update(s || initialSelection)); const [quantity, setQuantity] = useState(1); const [failure, setFailure] = useState(''); const [saving, setSaving] = useState(false);
  const app = useApp();
  const { width, fontScale } = useWindowDimensions();
  const toggle = (aid: string, singleGroup?: string[]) => setSelection(s => ({ ...s, selectedAddOns: s.selectedAddOns.some(a => a.id === aid) ? s.selectedAddOns.filter(a => a.id !== aid) : [...s.selectedAddOns.filter(a => !singleGroup?.includes(a.id)), { id: aid, quantity: 1 }] }));
  const validation = product ? selectionError(product, selection) : '';
  const price = product && !validation ? lineFor(product, selection, quantity).unitPrice * quantity : product ? product.price * quantity : 0;
  const add = async () => { if (!product || saving) return; setSaving(true); try { await app.add(lineFor(product, selection, quantity)); router.push('/(tabs)/cart'); } catch (e) { setFailure(messageOf(e)); } finally { setSaving(false); } };
  return <Screen footer={product ? <PurchaseFooter title={saving ? 'Adding…' : 'Add to cart'} label={saving ? 'Adding…' : `Add to cart · ${money(price)}`} amount={money(price)} disabled={!product.isAvailable || !!validation || saving || !!app.pending || app.busy} onPress={() => void add()} /> : undefined}>
    <Notice message={error} retry={() => void refresh()} />{loading && !product && <Loading />}{product && <>
    <View style={{ marginHorizontal: -20, marginTop: -20 }}>
      <FoodImage uri={product.image} style={{ height: Math.min(width * 0.95, 430), borderRadius: 0 }} />
      <View style={detail.photoActions}><FavoriteButton product={product} /></View>
    </View>
    <View style={[styles.between, { alignItems: 'flex-start' }]}><Text accessibilityRole="header" style={[styles.title, { flex: 1, minWidth: 0 }]}>{catalogText(product)}</Text><Text style={[styles.heading, { fontSize: 25, color: palette.orange }]}>{money(product.price)}</Text></View><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={[styles.muted, { flex: 1 }]}>{catalogText(product, 'description')}</Text><ShareButton kind="item" id={product._id} title={catalogText(product)} description={catalogText(product, 'description')} /></View>
    {!product.isAvailable && <Notice message="This item is currently unavailable." />}
    {favorite === 'review' && app.session && <Text style={styles.muted}>Signed in as {app.session.user.name}. Tap the heart to save this food to this account.</Text>}<Notice message={favorites.error} retry={() => void favorites.refresh()} />
    {product.items?.map((i, idx) => <Text key={idx} style={styles.muted}>{i.quantity} × {i.name}</Text>)}
    {product.customization?.enabled && <>
      {product.customization.groups?.map(g => <View key={g.name} style={styles.card}><Text style={styles.heading}>{g.name}</Text><Text style={styles.muted}>Choose {g.minSelections}–{g.selectionType === 'single' ? 1 : g.maxSelections}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{g.addOns.map(a => {
          const selected = selection.selectedAddOns.some(b => b.id === a._id);
          return <Pressable key={a._id} accessibilityRole="button" accessibilityLabel={`${a.name} +${money(a.price)}`} accessibilityState={{ selected, disabled: saving || !!app.pending }} disabled={saving || !!app.pending} onPress={() => toggle(a._id, g.selectionType === 'single' ? g.addOns.map(b => b._id) : undefined)} style={({ pressed }) => ({ flexGrow: 1, flexBasis: fontScale > 1.35 ? '100%' : '45%', minHeight: 72, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: selected ? palette.orange : palette.border, backgroundColor: selected ? palette.orangeTint : palette.background, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.7 : 1 })}><Text style={[styles.text, { color: selected ? palette.orange : palette.text, textAlign: 'center', fontWeight: '600' }]}>{a.name}</Text>{a.price > 0 && <Text style={styles.muted}>+{money(a.price)}</Text>}</Pressable>;
        })}</View>
      </View>)}
      {availableAddOns(product).filter(a => !product.customization?.groups?.some(g => g.addOns.some(b => b._id === a._id))).map(a => <Chip key={a._id} label={`${a.name} +${money(a.price)}`} selected={selection.selectedAddOns.some(b => b.id === a._id)} onPress={() => toggle(a._id)} />)}
      {product.customization.spice?.enabled && <><Text style={styles.heading}>Spice level</Text><View style={styles.row}>{product.customization.spice.options.map(s => <Chip key={s} label={s.replace('-', ' ')} selected={selection.spiceLevel === s} onPress={() => setSelection(v => ({ ...v, spiceLevel: s }))} />)}</View></>}
      <Field label="Item note (optional, 240 characters)" maxLength={240} multiline value={selection.note} onChangeText={note => setSelection(s => ({ ...s, note }))} />
    </>}
    <View style={styles.between}><Text style={styles.heading}>Quantity</Text><Quantity value={quantity} change={setQuantity} disabled={saving || !!app.pending || app.busy} /></View><Notice message={validation || failure} />
  </>}</Screen>;
}

const detail = StyleSheet.create({
  photoActions: { position: 'absolute', top: 12, right: 16, flexDirection: 'row', gap: 8, backgroundColor: 'rgba(16,16,16,0.8)', borderRadius: 28 },
});

