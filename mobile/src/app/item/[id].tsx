import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../services/api';
import { useResource } from '../../hooks/useResource';
import { availableAddOns, emptySelection, lineFor, money, selectionError } from '../../domain/cart';
import type { Product, Selection } from '../../domain/types';
import { useApp } from '../../state/AppProvider';
import { Button, Chip, Field, FoodImage, Loading, Notice, Quantity, Screen, messageOf, styles } from '../../components/ui';
export default function Item() {
  const { id, type } = useLocalSearchParams<{ id: string; type?: string }>(); const kind = type === 'combo' ? 'combo' : 'menuItem';
  const { data: product, loading, error, refresh } = useResource<Product>(async signal => ({ ...(await api<{ data: Product }>(`/${kind === 'combo' ? 'combos' : 'menu'}/${encodeURIComponent(id)}`, { signal })).data, productType: kind }), `${kind}:${id}`);
  const [draft, setDraft] = useState<Selection | null>(null);
  const initialSelection = { ...emptySelection(), spiceLevel: product?.customization?.enabled && product.customization.spice?.enabled ? product.customization.spice.default || product.customization.spice.options[0] || '' : '' };
  const selection = draft || initialSelection;
  const setSelection = (update: (s: Selection) => Selection) => setDraft(s => update(s || initialSelection)); const [quantity, setQuantity] = useState(1); const [failure, setFailure] = useState(''); const [saving, setSaving] = useState(false);
  const app = useApp();
  const toggle = (aid: string, singleGroup?: string[]) => setSelection(s => ({ ...s, selectedAddOns: s.selectedAddOns.some(a => a.id === aid) ? s.selectedAddOns.filter(a => a.id !== aid) : [...s.selectedAddOns.filter(a => !singleGroup?.includes(a.id)), { id: aid, quantity: 1 }] }));
  const validation = product ? selectionError(product, selection) : '';
  const price = product && !validation ? lineFor(product, selection, quantity).unitPrice * quantity : product ? product.price * quantity : 0;
  const add = async () => { if (!product || saving) return; setSaving(true); try { await app.add(lineFor(product, selection, quantity)); router.push('/(tabs)/cart'); } catch (e) { setFailure(messageOf(e)); } finally { setSaving(false); } };
  return <Screen><Notice message={error} retry={() => void refresh()} />{loading && !product && <Loading />}{product && <>
    <FoodImage uri={product.image} large /><Text style={styles.title}>{product.name}</Text><Text style={styles.text}>{product.description}</Text>
    {product.items?.map((i, idx) => <Text key={idx} style={styles.muted}>{i.quantity} × {i.name}</Text>)}
    {product.customization?.enabled && <>
      {product.customization.groups?.map(g => <View key={g.name} style={styles.card}><Text style={styles.heading}>{g.name}</Text><Text style={styles.muted}>Choose {g.minSelections}–{g.selectionType === 'single' ? 1 : g.maxSelections}</Text>
        {g.addOns.map(a => <Chip key={a._id} label={`${a.name} +${money(a.price)}`} selected={selection.selectedAddOns.some(b => b.id === a._id)} onPress={() => toggle(a._id, g.selectionType === 'single' ? g.addOns.map(b => b._id) : undefined)} />)}
      </View>)}
      {availableAddOns(product).filter(a => !product.customization?.groups?.some(g => g.addOns.some(b => b._id === a._id))).map(a => <Chip key={a._id} label={`${a.name} +${money(a.price)}`} selected={selection.selectedAddOns.some(b => b.id === a._id)} onPress={() => toggle(a._id)} />)}
      {product.customization.spice?.enabled && <><Text style={styles.heading}>Spice level</Text><View style={styles.row}>{product.customization.spice.options.map(s => <Chip key={s} label={s.replace('-', ' ')} selected={selection.spiceLevel === s} onPress={() => setSelection(v => ({ ...v, spiceLevel: s }))} />)}</View></>}
      <Field label="Item note (optional, 240 characters)" maxLength={240} multiline value={selection.note} onChangeText={note => setSelection(s => ({ ...s, note }))} />
    </>}
    <Quantity value={quantity} change={setQuantity} /><Notice message={validation || failure} />
    <Button title={saving ? 'Adding…' : `Add to cart · ${money(price)}`} disabled={!!validation || saving || !!app.pending} onPress={() => void add()} />
  </>}</Screen>;
}

