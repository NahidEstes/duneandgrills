import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../../state/AppProvider';
import { availableAddOns, money, subtotal } from '../../domain/cart';
import { Button, Notice, Quantity, Screen, messageOf, styles } from '../../components/ui';
export default function Cart() {
  const app = useApp(); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const change = async (key: string | null, quantity?: number) => {
    if (saving) return; setSaving(true);
    try { await app.setCart(key === null ? [] : quantity === undefined ? app.cart.filter(c => c.key !== key) : app.cart.map(c => c.key === key ? { ...c, quantity } : c)); setError(''); }
    catch (e) { setError(messageOf(e)); } finally { setSaving(false); }
  };
  return <Screen><Text style={styles.title}>Your next great meal</Text><Text style={styles.muted}>Saved on this device. Switching accounts or logging out starts a fresh cart.</Text>
    <Notice message={error} />{app.pending && <><Notice message="An order outcome is unresolved. Your original cart is protected until you retry or reconcile it." /><Button title="Resolve saved order" onPress={() => router.push('/checkout')} /></>}
    {!app.cart.length && <><Text style={styles.text}>Your cart is empty.</Text><Button title="Explore the menu" onPress={() => router.push('/(tabs)')} /></>}
    {app.cart.map(c => <View key={c.key} style={styles.card}><Text style={styles.heading}>{c.product.name}</Text>
      <Text style={styles.muted}>{c.selection.spiceLevel.replace('-', ' ')}{c.selection.note ? ` · ${c.selection.note}` : ''}</Text>
      {c.selection.selectedAddOns.map(a => <Text key={a.id} style={styles.muted}>{a.quantity} × {availableAddOns(c.product).find(b => b._id === a.id)?.name || 'Add-on'}</Text>)}
      <Text style={styles.text}>{money(c.unitPrice)} each · {money(c.unitPrice * c.quantity)}</Text>
      {!app.pending && <><Quantity value={c.quantity} change={n => void change(c.key, n)} /><Button title="Remove" secondary disabled={saving} onPress={() => void change(c.key)} /></>}
    </View>)}
    {!!app.cart.length && <><View style={styles.between}><Text style={styles.heading}>Subtotal</Text><Text style={styles.heading}>{money(subtotal(app.cart))}</Text></View>
      <Text style={styles.muted}>Delivery and discounts are calculated at checkout. Restaurant prices are confirmed again before ordering.</Text>
      <Button title="Continue to checkout" disabled={saving} onPress={() => router.push('/checkout')} />
      <Button title="Clear cart" secondary disabled={!!app.pending || saving} onPress={() => void change(null)} /></>}
  </Screen>;
}
