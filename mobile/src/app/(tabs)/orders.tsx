import { useLanguage } from '../../i18n/LocaleProvider';
import { View } from 'react-native';
import { Text } from '../../i18n/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '../../state/AppProvider';
import { useResource } from '../../hooks/useResource';
import { useActiveOrders } from '../../hooks/useActiveOrders';
import { useOrderAgain } from '../../hooks/useOrderAgain';
import { OrderAgainFeedback } from '../../components/order-again';
import type { Order } from '../../domain/types';
import { newestActiveOrders, terminal } from '../../domain/orders';
import { Button, Chip, Loading, Notice, Screen, styles } from '../../components/ui';
import { BrandHeader, SectionEyebrow } from '../../components/storefront';
import { OrderCard } from '../../components/order-card';
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
  const currentOrders = (visible || []).filter(order => !terminal(order));
  const pastOrders = (visible || []).filter(terminal);
  return <Screen top refreshing={resource.loading || guestActive.loading} onRefresh={() => { void resource.refresh(); void guestActive.refresh(); }}><BrandHeader /><Text accessibilityRole="header" style={styles.title}>{activeOnly ? 'Active orders' : 'Your orders'}</Text>
    <View style={styles.row}><Chip label="All orders" selected={!activeOnly} onPress={() => router.setParams({ active: '0' })} /><Chip label="Active orders" selected={activeOnly} onPress={() => router.setParams({ active: '1' })} /></View>
    {app.pending && <Button title="Resolve unresolved order" onPress={() => router.push('/checkout')} />}
    <OrderAgainFeedback action={again} />
    <Notice message={resource.error} retry={() => void resource.refresh()} />{resource.loading && !resource.data && <Loading />}
    {activeOnly && <><Notice message={guestActive.error || (guestActive.outdated ? 'Status may be outdated.' : '')} retry={() => void guestActive.refresh()} />{guestActive.loading && !guestActive.data && <Loading />}</>}
    {!app.session && <><Text style={styles.muted}>Guest tracking saved securely on this phone. Sign in to see your account history.</Text><Button title="Sign in" secondary onPress={() => router.push('/auth')} /></>}
    {app.session && !!currentOrders.length && <SectionEyebrow>CURRENT ORDERS</SectionEyebrow>}
    {app.session && currentOrders.map(order => <OrderCard key={order._id} order={order} onAgain={() => again.start(order)} disabled={again.disabled} />)}
    {app.session && !!pastOrders.length && <SectionEyebrow>PAST ORDERS</SectionEyebrow>}
    {app.session && pastOrders.map(order => <OrderCard key={order._id} order={order} onAgain={() => again.start(order)} disabled={again.disabled} />)}
    {!!guestVisible.length && <SectionEyebrow>{activeOnly ? 'CURRENT ORDERS' : 'SAVED ORDERS'}</SectionEyebrow>}
    {guestVisible.map(tracking => <OrderCard key={tracking.orderNumber} order={guestActive.orders.find(order => order.orderNumber === tracking.orderNumber) || tracking.order} guest stale={!activeOnly || guestActive.outdated} />)}
    {resource.data && !visible?.length && !guestVisible.length && !guestActive.loading && <Text style={styles.text}>{activeOnly ? 'No active orders.' : 'No orders yet. Your next meal starts in the menu.'}</Text>}
  </Screen>;
}
