import { useLayoutEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, CirclePlus, Tag, Trash2 } from '../../components/icons';
import { useApp } from '../../state/AppProvider';
import { useResource } from '../../hooks/useResource';
import { useDeliveryAddress } from '../../hooks/useDeliveryAddress';
import { loadOrderConfig } from '../../services/api';
import { availableAddOns, money, orderItems, subtotal } from '../../domain/cart';
import { AddressCard, OrderSummary, PaymentCard, openMenu } from '../../components/commerce';
import { palette } from '../../constants/design';
import { Button, FoodImage, FulfillmentSelector, IconButton, Notice, Quantity, Screen, messageOf, styles } from '../../components/ui';
type Quote = { fingerprint: string; discount: number };
export default function Cart() { const app = useApp(); return <CartContents key={app.actor} />; }
function CartContents() {
  const app = useApp(); const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const gate = useRef(false);
  const config = useResource(loadOrderConfig, 'cart-config'); const { customer, addresses } = useDeliveryAddress();
  const { type, coupon } = app.checkoutDraft; const [quote, setQuote] = useState<Quote | null>(null);
  const fingerprint = JSON.stringify([app.actor, app.cart, coupon.trim()]); const current = useRef(fingerprint);
  useLayoutEffect(() => { current.current = fingerprint; }, [fingerprint]);
  const discount = quote?.fingerprint === fingerprint ? quote.discount : 0;
  const fee = config.data?.orderTypes.find(option => option.value === type)?.deliveryFee;
  const change = async (key: string | null, quantity?: number) => {
    if (gate.current) return; gate.current = true; setSaving(true);
    try { await app.setCart(key === null ? [] : quantity === undefined ? app.cart.filter(c => c.key !== key) : app.cart.map(c => c.key === key ? { ...c, quantity } : c)); setError(''); }
    catch (e) { setError(messageOf(e)); } finally { gate.current = false; setSaving(false); }
  };
  const apply = async () => {
    if (gate.current || app.pending || !coupon.trim()) return; gate.current = true; setSaving(true); setError(''); setQuote(null);
    try {
      const result = await app.request<{ data: { originalSubtotal: number; discountAmount: number } }>('/offers/validate-coupon', { method: 'POST', body: { code: coupon.trim(), items: orderItems(app.cart) } });
      if (current.current !== fingerprint) return;
      if (result.data.originalSubtotal !== subtotal(app.cart)) throw new Error('The restaurant updated prices. Review your cart at checkout.');
      setQuote({ fingerprint, discount: result.data.discountAmount });
    } catch (e) { if (current.current === fingerprint) setError(messageOf(e)); } finally { gate.current = false; setSaving(false); }
  };
  return <Screen top>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><IconButton icon={ArrowLeft} label="Back to menu" onPress={() => router.canGoBack() ? router.back() : openMenu()} /><Text style={styles.title}>Your cart</Text></View>
    <FulfillmentSelector value={type} change={type => app.setCheckoutDraft(d => ({ ...d, type }))} disabled={!!app.pending || saving} available={config.data?.orderTypes.map(option => option.value)} />
    <Notice message={error} />
    {app.pending && <><Notice message="An order outcome is unresolved. Your original cart is protected until you retry or reconcile it." /><Button title="Resolve saved order" onPress={() => router.push('/checkout')} /></>}
    {!app.cart.length && <View style={styles.card}><Text style={styles.heading}>Your cart is empty.</Text><Text style={styles.muted}>Find your next favourite bite.</Text><Button title="Explore the menu" onPress={() => openMenu()} /></View>}
    {app.cart.map(c => <View key={c.key} style={styles.card}>
      <View style={{ flexDirection: 'row', gap: 14 }}><FoodImage uri={c.product.image} style={{ width: 88, height: 88 }} /><View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text style={styles.heading}>{c.product.name}</Text><Text style={[styles.heading, { color: palette.orange }]}>{money(c.unitPrice * c.quantity)}</Text><Text style={styles.muted}>{money(c.unitPrice)} each</Text></View></View>
      {!!(c.selection.spiceLevel || c.selection.note) && <Text style={styles.muted}>{[c.selection.spiceLevel.replace('-', ' '), c.selection.note].filter(Boolean).join(' · ')}</Text>}
      {c.selection.selectedAddOns.map(a => <Text key={a.id} style={styles.muted}>{a.quantity} × {availableAddOns(c.product).find(b => b._id === a.id)?.name || 'Add-on'}</Text>)}
      <View style={styles.between}><Quantity value={c.quantity} disabled={saving || !!app.pending} change={n => void change(c.key, n)} /><IconButton icon={Trash2} label={`Remove ${c.product.name}`} disabled={saving || !!app.pending} onPress={() => void change(c.key)} /></View>
    </View>)}
    <Pressable accessibilityRole="button" onPress={() => openMenu()} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}><CirclePlus color={palette.orange} size={25} /><Text style={[styles.text, { fontWeight: '700', color: palette.orange }]}>Add something extra</Text></Pressable>
    {!!app.cart.length && <>
      {type === 'delivery' && <><AddressCard address={customer.address} disabled={!!app.pending || saving} /><Notice message={addresses.error} retry={() => void addresses.refresh()} /></>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><View style={[styles.field, { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 155 }]}><Tag size={20} color={palette.muted} /><TextInput accessibilityLabel="Coupon code" placeholder="Enter coupon code" placeholderTextColor={palette.muted} selectionColor={palette.orange} style={[styles.text, { flex: 1, minWidth: 0 }]} value={coupon} maxLength={80} autoCapitalize="characters" editable={!saving && !app.pending} onChangeText={coupon => app.setCheckoutDraft(d => ({ ...d, coupon }))} onSubmitEditing={() => void apply()} returnKeyType="done" /></View><Button title={saving ? 'Please wait…' : 'Apply'} secondary disabled={saving || !!app.pending || !coupon.trim()} onPress={() => void apply()} /></View>
      {quote?.fingerprint === fingerprint && <Text accessibilityLiveRegion="polite" style={styles.muted}>Coupon applied. Confirmed again at checkout.</Text>}
      <Notice message={config.error} retry={() => void config.refresh()} />
      <OrderSummary sub={subtotal(app.cart)} discount={discount} fee={fee} />
      <PaymentCard type={type} />
      <Button title="Continue to checkout" disabled={saving} onPress={() => router.push('/checkout')} />
      <Button title="Clear cart" secondary disabled={!!app.pending || saving} onPress={() => void change(null)} />
      <Text style={styles.muted}>Saved on this device. Switching accounts or logging out starts a fresh cart.</Text>
    </>}
  </Screen>;
}
