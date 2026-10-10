import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '../../state/AppProvider';
import { API_URL, loadCatalog } from '../../services/api';
import { createApi } from '../../services/api-client';
import { useResource } from '../../hooks/useResource';
import { addLine, lineFor, money } from '../../domain/cart';
import { paymentLabel, statusLabel, terminal } from '../../domain/orders';
import type { Order } from '../../domain/types';
import { Button, Loading, Notice, Screen, messageOf, styles } from '../../components/ui';
type Repeated = { _id: string; productType: string; quantity: number; selectedAddOns: { _id: string; quantity: number }[]; spiceLevel: string; note: string };
export default function OrderDetails() {
  const { id, guest, confirmed } = useLocalSearchParams<{ id: string; guest?: string; confirmed?: string }>();
  const app = useApp(); const actor = app.session?.user._id || 'guest';
  const tracking = app.tracking.find(t => t.orderNumber === id && t.actor === actor);
  const resource = useResource(async signal => {
    if (guest === '1') {
      if (!tracking) throw new Error('Private tracking is not saved for this account on this device');
      return (await createApi(tracking.baseUrl || API_URL)<{ data: Order }>(`/orders/track/${encodeURIComponent(id)}`, { signal, headers: { 'X-Order-Tracking-Token': tracking.token } })).data;
    }
    if (!app.session) throw new Error('Sign in to view your order');
    return (await app.request<{ data: Order }>(`/orders/${encodeURIComponent(id)}`, { signal })).data;
  }, `${actor}:${id}:${guest}`, order => !terminal(order), guest === '1' ? 120000 : 30000);
  const [error, setError] = useState(''); const [warnings, setWarnings] = useState<string[]>([]); const [busy, setBusy] = useState(false); const gate = useRef(false);
  const reorder = async () => {
    if (gate.current) return; gate.current = true; setBusy(true); setError('');
    try {
      const result = await app.request<{ data: Repeated[]; warnings: string[] }>(`/orders/${id}/repeat`, { method: 'POST', body: {} });
      const products = await loadCatalog(); let cart = [...app.cart]; const skipped = [...result.warnings];
      for (const item of result.data) {
        try {
          const product = products.find(p => p._id === item._id && p.productType === item.productType);
          if (!product) throw new Error('An item is no longer available');
          cart = addLine(cart, lineFor(product, { selectedAddOns: item.selectedAddOns.map(a => ({ id: a._id, quantity: a.quantity })), spiceLevel: item.spiceLevel, note: item.note }, item.quantity));
        } catch (e) { skipped.push(messageOf(e)); }
      }
      await app.setCart(cart); setWarnings(skipped);
      if (!skipped.length) router.push('/(tabs)/cart');
    } catch (e) { setError(messageOf(e)); } finally { gate.current = false; setBusy(false); }
  };
  const order = resource.data || tracking?.order;
  return <Screen refreshing={resource.loading} onRefresh={() => void resource.refresh()}>
    {confirmed === '1' && <Text style={styles.title}>Order confirmed</Text>}
    <Notice message={resource.error || error} retry={() => void resource.refresh()} />{resource.loading && !order && <Loading />}
    {order && <><Text style={styles.heading}>{order.orderNumber}</Text><Text style={styles.title}>{statusLabel(order)}</Text><Text style={styles.muted}>{resource.data ? 'Latest restaurant status' : 'Saved confirmation · pull to refresh for live status'}</Text>
      <View style={styles.card}><Text style={styles.heading}>{money(order.totalAmount)}</Text><Text style={styles.text}>{guest === '1' ? 'Cash order' : 'Payment'} · {paymentLabel(order)}</Text><Text style={styles.muted}>{order.fulfillmentType === 'delivery' ? 'Delivery' : order.fulfillmentType === 'pickup' ? 'Pickup' : 'Dine-in'} · {new Date(order.createdAt).toLocaleString()}</Text>
        {!terminal(order) && order.estimatedPreparationMinutes && <Text style={styles.muted}>Estimated preparation: {order.estimatedPreparationMinutes} minutes. Times may change.</Text>}
      </View>
      {!resource.data && <Text style={styles.muted}>Pull to refresh for the full item details and latest status.</Text>}
      {order.items.map((i, n) => <View style={styles.card} key={n}><Text style={styles.heading}>{i.quantity} × {i.name}</Text><Text style={styles.text}>{money(i.price * i.quantity)}</Text><Text style={styles.muted}>{i.spiceLevel} {i.selectedAddOns.map(a => `${a.quantity} × ${a.name}`).join(', ')}</Text>{!!i.itemNote && <Text style={styles.muted}>{i.itemNote}</Text>}</View>)}
      <Text style={styles.text}>Subtotal {money(order.subtotal)} · Delivery {money(order.deliveryFee)} · Discount {money(order.discountAmount || 0)}</Text>
      {!!order.kitchenNotes && <Text style={styles.muted}>Kitchen note: {order.kitchenNotes}</Text>}
      {guest !== '1' && app.session && <Button title={busy ? 'Checking current menu…' : 'Reorder at current prices'} disabled={busy || !!app.pending} onPress={() => void reorder()} />}
      {!!warnings.length && <><Notice message={`Some items were skipped:\n${warnings.join('\n')}`} /><Button title="View reordered cart" onPress={() => router.push('/(tabs)/cart')} /></>}
    </>}
  </Screen>;
}
