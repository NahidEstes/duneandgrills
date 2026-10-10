import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../../state/AppProvider';
import { useResource } from '../../hooks/useResource';
import type { Order } from '../../domain/types';
import { money } from '../../domain/cart';
import { paymentLabel, statusLabel, terminal } from '../../domain/orders';
import { Button, Loading, Notice, Screen, styles } from '../../components/ui';
export default function Orders() {
  const app = useApp(); const actor = app.session?.user._id || 'guest';
  const resource = useResource(async signal => app.session ? (await app.request<{ data: Order[] }>('/orders/my', { signal })).data : [], actor, orders => orders.some(o => !terminal(o)), 30000);
  const guest = actor === 'guest' ? app.tracking.filter(t => t.actor === 'guest') : [];
  return <Screen refreshing={resource.loading} onRefresh={() => void resource.refresh()}><Text style={styles.title}>Your orders</Text>
    {app.pending && <Button title="Resolve unresolved order" onPress={() => router.push('/checkout')} />}
    <Notice message={resource.error} retry={() => void resource.refresh()} />{resource.loading && !resource.data && <Loading />}
    {!app.session && <><Text style={styles.muted}>Guest tracking saved securely on this phone. Sign in to see your account history.</Text><Button title="Sign in" secondary onPress={() => router.push('/auth')} /></>}
    {app.session && resource.data?.map(o => <Pressable key={o._id} accessibilityRole="button" onPress={() => router.push({ pathname: '/order/[id]', params: { id: o._id! } })} style={styles.card}>
      <Text style={styles.heading}>{o.orderNumber}</Text><Text style={styles.text}>{statusLabel(o)} · {money(o.totalAmount)}</Text><Text style={styles.muted}>{paymentLabel(o)} · {new Date(o.createdAt).toLocaleDateString()}</Text>
    </Pressable>)}
    {guest.map(t => <Pressable key={t.orderNumber} accessibilityRole="button" onPress={() => router.push({ pathname: '/order/[id]', params: { id: t.orderNumber, guest: '1' } })} style={styles.card}><Text style={styles.heading}>{t.orderNumber}</Text><Text style={styles.muted}>Open private tracking · {money(t.order.totalAmount)}</Text></Pressable>)}
    {resource.data && !resource.data.length && !guest.length && <Text style={styles.text}>No orders yet. Your next meal starts in the menu.</Text>}
  </Screen>;
}
