import { useLanguage } from '../../i18n/LocaleProvider';
import { catalogText } from '../../i18n/core';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Pressable, Text, TextInput } from '../../i18n/native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, CirclePlus, Tag, Trash2 } from '../../components/icons';
import { useApp } from '../../state/AppProvider';
import { useResource } from '../../hooks/useResource';
import { useDeliveryAddress } from '../../hooks/useDeliveryAddress';
import { useCartCoupon } from '../../hooks/useCartCoupon';
import { loadOrderConfig } from '../../services/api';
import { availableAddOns, money, subtotal } from '../../domain/cart';
import { offerTerms } from '../../domain/offers';
import { browseOffer } from '../../components/offers';
import { AddressCard, OrderSummary, PaymentCard, openMenu } from '../../components/commerce';
import { palette } from '../../constants/design';
import { Button, FoodImage, FulfillmentSelector, IconButton, Notice, Quantity, Screen, messageOf, styles } from '../../components/ui';
export default function Cart() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage(); const app = useApp(); return <CartContents key={app.actor} />; }
function CartContents() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const { repeatNotice } = useLocalSearchParams<{ repeatNotice?: string }>();
  const app = useApp(); const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const gate = useRef(false);
  const config = useResource(loadOrderConfig, 'cart-config'); const { customer, addresses } = useDeliveryAddress();
  const { type, coupon } = app.checkoutDraft; const selected = useCartCoupon();
  const locked = saving || selected.busy || !!app.pending || app.busy;
  const fee = config.data?.orderTypes.find(option => option.value === type)?.deliveryFee;
  const change = async (key: string | null, quantity?: number) => {
    if (gate.current || locked) return; gate.current = true; setSaving(true);
    try { await app.setCart(key === null ? [] : quantity === undefined ? app.cart.filter(c => c.key !== key) : app.cart.map(c => c.key === key ? { ...c, quantity } : c)); setError(''); }
    catch (e) { setError(messageOf(e)); } finally { gate.current = false; setSaving(false); }
  };
  return <Screen top>
    {!!repeatNotice && <Text accessibilityLiveRegion="polite" style={styles.text}>{repeatNotice.slice(0, 4000)}</Text>}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><IconButton icon={ArrowLeft} label="Back to menu" onPress={() => router.canGoBack() ? router.back() : openMenu()} /><Text style={styles.title}>Your cart</Text></View>
    <FulfillmentSelector value={type} change={type => app.setCheckoutDraft(d => ({ ...d, type }))} disabled={locked} available={config.data?.orderTypes.map(option => option.value)} />
    <Notice message={error} />
    {app.pending && <><Notice message="An order outcome is unresolved. Your original cart is protected until you retry or reconcile it." /><Button title="Resolve saved order" onPress={() => router.push('/checkout')} /></>}
    {!app.cart.length && <View style={styles.card}><Text style={styles.heading}>Your cart is empty.</Text><Text style={styles.muted}>Find your next favourite bite.</Text><Button title="Explore the menu" onPress={() => openMenu()} /></View>}
    {app.cart.map(c => <View key={c.key} style={styles.card}>
      <View style={{ flexDirection: 'row', gap: 14 }}><FoodImage uri={c.product.image} style={{ width: 88, height: 88 }} /><View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text style={styles.heading}>{catalogText(c.product)}</Text><Text style={[styles.heading, { color: palette.orange }]}>{money(c.unitPrice * c.quantity)}</Text><Text style={styles.muted}>{money(c.unitPrice)} each</Text></View></View>
      {!!(c.selection.spiceLevel || c.selection.note) && <Text style={styles.muted}>{[c.selection.spiceLevel.replace('-', ' '), c.selection.note].filter(Boolean).join(' · ')}</Text>}
      {c.selection.selectedAddOns.map(a => <Text key={a.id} style={styles.muted}>{a.quantity} × {availableAddOns(c.product).find(b => b._id === a.id)?.name || 'Add-on'}</Text>)}
      <View style={styles.between}><Quantity value={c.quantity} disabled={locked} change={n => void change(c.key, n)} /><IconButton icon={Trash2} label={`Remove ${catalogText(c.product)}`} disabled={locked} onPress={() => void change(c.key)} /></View>
    </View>)}
    <Pressable accessibilityRole="button" onPress={() => openMenu()} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}><CirclePlus color={palette.orange} size={25} /><Text style={[styles.text, { fontWeight: '700', color: palette.orange }]}>Add something extra</Text></Pressable>
    <Notice message={selected.error} retry={selected.error ? () => void selected.retry() : undefined} />
    <Notice message={selected.notice || (selected.unavailable ? 'This selected offer is no longer available. Remove or replace the coupon.' : '')} />
    {selected.loading && <Text style={styles.muted}>Checking selected offer…</Text>}
    {selected.loginRequired && !selected.offer && <Button title="Sign in to use this coupon" disabled={locked} onPress={selected.signIn} />}
    {selected.offer && <View style={styles.card}><Text style={styles.heading}>{selected.offer.title}</Text><Text style={styles.muted}>{offerTerms(selected.offer)}</Text>
      {selected.loginRequired ? <Button title="Sign in to use this offer" disabled={locked} onPress={selected.signIn} /> : <>
        {!app.cart.length && <Text style={styles.text}>Suggested coupon: {selected.offer.promoCode}. Add eligible items before applying.</Text>}
        <Button title="Browse eligible products" secondary onPress={() => void browseOffer(selected.offer!).catch(e => setError(messageOf(e)))} />
      </>}
    </View>}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><View style={[styles.field, { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 155 }]}><Tag size={20} color={palette.muted} /><TextInput accessibilityLabel="Coupon code" placeholder="Enter coupon code" placeholderTextColor={palette.muted} selectionColor={palette.orange} style={[styles.text, { flex: 1, minWidth: 0 }]} value={coupon} maxLength={40} autoCapitalize="characters" editable={!locked} onChangeText={selected.change} onSubmitEditing={() => void selected.apply()} returnKeyType="done" /></View><Button title={selected.busy ? 'Please wait…' : 'Apply'} secondary disabled={locked || !coupon.trim() || !app.cart.length || selected.loginRequired} onPress={() => void selected.apply()} /></View>
    {(!!coupon || selected.selected) && <Button title="Remove coupon" secondary disabled={locked} onPress={() => selected.change('')} />}
    {selected.applied ? <Text accessibilityLiveRegion="polite" style={styles.muted}>Coupon applied. Confirmed again at checkout.</Text> : !!coupon && <Text style={styles.muted}>{app.cart.length ? 'Apply the coupon for the current cart. Discounts are confirmed at checkout.' : 'Suggested coupon. Add eligible items before applying.'}</Text>}
    {!!app.cart.length && <>
      {type === 'delivery' && <><AddressCard address={customer.address} disabled={!!app.pending || saving} /><Notice message={addresses.error} retry={() => void addresses.refresh()} /></>}
      <Notice message={config.error} retry={() => void config.refresh()} />
      <OrderSummary sub={subtotal(app.cart)} discount={selected.discount} fee={fee} />
      <PaymentCard type={type} />
      <Button title="Continue to checkout" disabled={saving || selected.busy} onPress={() => router.push('/checkout')} />
      <Button title="Clear cart" secondary disabled={locked} onPress={() => void change(null)} />
      <Text style={styles.muted}>Saved on this device. Switching accounts or logging out starts a fresh cart.</Text>
    </>}
  </Screen>;
}
