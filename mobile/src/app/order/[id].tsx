import { useLanguage } from '../../i18n/LocaleProvider';
import { formatDate } from '../../i18n/core';
import { View } from 'react-native';
import { Text } from '../../i18n/native';
import { useLocalSearchParams } from 'expo-router';
import { useApp } from '../../state/AppProvider';
import { API_URL, apiFor } from '../../services/api';
import { useResource } from '../../hooks/useResource';
import { money } from '../../domain/cart';
import { paymentLabel, statusLabel, terminal } from '../../domain/orders';
import type { Order } from '../../domain/types';
import { Button, Loading, Notice, Screen, styles } from '../../components/ui';
import { useOrderAgain } from '../../hooks/useOrderAgain';
import { OrderAgainFeedback } from '../../components/order-again';
export default function OrderDetails() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const app = useApp(); const { id } = useLocalSearchParams<{ id: string }>();
  return <OrderDetailsContent key={`${app.session?.user._id || 'guest'}:${id}`} />;
}
function OrderDetailsContent() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const { id, guest, confirmed } = useLocalSearchParams<{ id: string; guest?: string; confirmed?: string }>();
  const app = useApp(); const actor = app.session?.user._id || 'guest';
  const tracking = app.tracking.find(t => t.orderNumber === id && t.actor === actor);
  const resource = useResource(async signal => {
    if (guest === '1') {
      if (!tracking) throw new Error('Private tracking is not saved for this account on this device');
      return (await apiFor(tracking.baseUrl || API_URL)<{ data: Order }>(`/orders/track/${encodeURIComponent(id)}`, { signal, headers: { 'X-Order-Tracking-Token': tracking.token } })).data;
    }
    if (!app.session) throw new Error('Sign in to view your order');
    return (await app.request<{ data: Order }>(`/orders/${encodeURIComponent(id)}`, { signal })).data;
  }, `${actor}:${id}:${guest}`, order => !terminal(order), guest === '1' ? 120000 : 30000);
  const again = useOrderAgain();
  const order = resource.data || tracking?.order;
  return <Screen refreshing={resource.loading} onRefresh={() => void resource.refresh()}>
    {confirmed === '1' && <Text style={styles.title}>Order confirmed</Text>}
    <Notice message={resource.error} retry={() => void resource.refresh()} />{resource.loading && !order && <Loading />}<OrderAgainFeedback action={again} />
    {order && <><Text style={styles.heading}>{order.orderNumber}</Text><Text style={styles.title}>{statusLabel(order)}</Text><Text style={styles.muted}>{resource.data ? 'Latest restaurant status' : 'Saved confirmation · pull to refresh for live status'}</Text>
      {order.scheduledAt && <Text style={styles.heading}>Scheduled for: {formatDate(order.scheduledAt)}</Text>}
      {!!order.pointsDiscount && <Text style={styles.text}>Points discount: {money(order.pointsDiscount)}</Text>}
      <View style={styles.card}><Text style={styles.heading}>{money(order.totalAmount)}</Text><Text style={styles.text}>{guest === '1' ? 'Cash order' : 'Payment'} · {paymentLabel(order)}</Text><Text style={styles.muted}>{order.fulfillmentType === 'delivery' ? 'Delivery' : order.fulfillmentType === 'pickup' ? 'Pickup' : 'Dine-in'} · {formatDate(order.createdAt)}</Text>
        {!terminal(order) && order.estimatedPreparationMinutes && <Text style={styles.muted}>Estimated preparation: {order.estimatedPreparationMinutes} minutes. Times may change.</Text>}
      </View>
      {!resource.data && <Text style={styles.muted}>Pull to refresh for the full item details and latest status.</Text>}
      {order.items.map((i, n) => <View style={styles.card} key={n}><Text style={styles.heading}>{i.quantity} × {i.name}</Text><Text style={styles.text}>{money(i.price * i.quantity)}</Text><Text style={styles.muted}>{i.spiceLevel} {i.selectedAddOns.map(a => `${a.quantity} × ${a.name}`).join(', ')}</Text>{!!i.itemNote && <Text style={styles.muted}>{i.itemNote}</Text>}</View>)}
      <Text style={styles.text}>Subtotal {money(order.subtotal)} · Delivery {money(order.deliveryFee)} · Discount {money(order.discountAmount || 0)}</Text>
      {!!order.kitchenNotes && <Text style={styles.muted}>Kitchen note: {order.kitchenNotes}</Text>}
      {guest !== '1' && app.session && resource.data && <Button title={again.busy ? 'Checking current menu…' : 'Order again'} disabled={again.disabled} onPress={() => again.start(order)} />}
    </>}
  </Screen>;
}
