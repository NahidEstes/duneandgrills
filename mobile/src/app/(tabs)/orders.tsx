import { useLanguage } from '../../i18n/LocaleProvider';
import { formatDate } from '../../i18n/core';
import { View } from 'react-native';
import { Pressable, Text } from '../../i18n/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '../../state/AppProvider';
import { useResource } from '../../hooks/useResource';
import { useActiveOrders } from '../../hooks/useActiveOrders';
import { useOrderAgain } from '../../hooks/useOrderAgain';
import { OrderAgainFeedback } from '../../components/order-again';
import type { Order } from '../../domain/types';
import { money } from '../../domain/cart';
import { newestActiveOrders, paymentLabel, statusLabel, terminal } from '../../domain/orders';
import { Button, Chip, Loading, Notice, Screen, styles } from '../../components/ui';
export default function Orders() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const app = useApp(); const actor = app.actor; const params = useLocalSearchParams<{ active?: string }>(); const activeOnly = params.active === '1';
  const again = useOrderAgain();
  const guestActive = useActiveOrders(activeOnly && actor === 'guest');
  const resource = useResource(async signal => app.session ? (await app.request<{ data: Order[] }>('/orders/my', { signal })).data : [], actor, orders => orders.some(o => !terminal(o)), 30000);
  const guest = actor === 'guest' ? app.tracking.filter(t => t.actor === 'guest') : [];
  const visible = activeOnly ? newestActiveOrders(resource.data || []) : resource.data;
  const guestVisible = activeOnly ? guest.filter(t => guestActive.orders.some(o => o.orderNumber === t.orderNumber)) : guest;
  return <Screen top refreshing={resource.loading || guestActive.loading} onRefresh={() => { void resource.refresh(); void guestActive.refresh(); }}><Text style={styles.title}>{activeOnly ? 'Active orders' : 'Your orders'}</Text>
    <View style={styles.row}><Chip label="All orders" selected={!activeOnly} onPress={() => router.setParams({ active: '0' })} /><Chip label="Active orders" selected={activeOnly} onPress={() => router.setParams({ active: '1' })} /></View>
    {app.pending && <Button title="Resolve unresolved order" onPress={() => router.push('/checkout')} />}
    <OrderAgainFeedback action={again} />
    <Notice message={resource.error} retry={() => void resource.refresh()} />{resource.loading && !resource.data && <Loading />}
    {activeOnly && <><Notice message={guestActive.error || (guestActive.outdated ? 'Status may be outdated.' : '')} retry={() => void guestActive.refresh()} />{guestActive.loading && !guestActive.data && <Loading />}</>}
    {!app.session && <><Text style={styles.muted}>Guest tracking saved securely on this phone. Sign in to see your account history.</Text><Button title="Sign in" secondary onPress={() => router.push('/auth')} /></>}
    {app.session && visible?.map(o => <View key={o._id} style={styles.card}><Pressable accessibilityRole="button" accessibilityLabel={`View order ${o.orderNumber}`} onPress={() => router.push({ pathname: '/order/[id]', params: { id: o._id! } })}>
      <Text style={styles.heading}>{o.orderNumber}</Text>{o.scheduledAt && <Text style={styles.muted}>Scheduled for: {formatDate(o.scheduledAt)}</Text>}<Text style={styles.text}>{statusLabel(o)} · {money(o.totalAmount)}</Text><Text style={styles.muted}>{paymentLabel(o)} · {formatDate(o.createdAt)}</Text>
    </Pressable><Button title="Order again" label={`Order again ${o.orderNumber}`} secondary disabled={again.disabled} onPress={() => again.start(o)} /></View>)}
    {guestVisible.map(t => <Pressable key={t.orderNumber} accessibilityRole="button" onPress={() => router.push({ pathname: '/order/[id]', params: { id: t.orderNumber, guest: '1' } })} style={styles.card}><Text style={styles.heading}>{t.orderNumber}</Text>{t.order.scheduledAt && <Text style={styles.muted}>Scheduled for: {formatDate(t.order.scheduledAt)}</Text>}<Text style={styles.muted}>{activeOnly ? statusLabel(guestActive.orders.find(o => o.orderNumber === t.orderNumber)!) : 'Open private tracking'} · {money(t.order.totalAmount)}</Text></Pressable>)}
    {resource.data && !visible?.length && !guestVisible.length && !guestActive.loading && <Text style={styles.text}>{activeOnly ? 'No active orders.' : 'No orders yet. Your next meal starts in the menu.'}</Text>}
  </Screen>;
}
