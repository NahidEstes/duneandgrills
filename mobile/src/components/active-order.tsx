import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { activeStatus, orderProgress } from '../domain/orders';
import type { Order } from '../domain/types';
import { palette } from '../constants/design';
import { Check, ChevronRight, CookingPot, ReceiptText, ShoppingBag, Truck } from './icons';
import { styles } from './ui';

export function ActiveOrderCard({ orders, guest, outdated, refreshing, retry }: { orders: Order[]; guest: boolean; outdated: boolean; refreshing: boolean; retry: () => void }) {
  const { width, fontScale } = useWindowDimensions(); const vertical = width < 360 || fontScale > 1.2;
  const order = orders[0];
  if (!order) return outdated ? <View style={{ gap: 4 }}><Text style={styles.muted}>Unable to refresh order status.</Text><Action label="Retry order status" title="Retry" onPress={retry} disabled={refreshing} /></View> : null;
  const status = activeStatus(order); const progress = orderProgress(order); const pickup = order.fulfillmentType === 'pickup'; const delivery = order.fulfillmentType === 'delivery';
  const Icon = delivery ? Truck : ShoppingBag;
  const StatusIcon = order.status === 'pending' ? ReceiptText : order.status === 'confirmed' ? Check : order.status === 'preparing' ? CookingPot : Icon;
  return <View style={[styles.card, local.card]}>
    <View style={styles.between}><Text style={[styles.muted, local.label]}>ACTIVE ORDER</Text><Text style={[styles.muted, { flexShrink: 1 }]}>{order.orderNumber}</Text></View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View accessible={false} style={local.icon}><StatusIcon size={30} color={palette.orange} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text accessibilityRole="header" style={styles.heading}>{status.title}</Text><Text style={styles.muted}>{status.description}</Text></View>
    </View>
    <View accessible accessibilityLabel={`Order progress: ${status.title}. ${progress.map(step => `${step.label}, ${step.state}`).join('; ')}`} style={{ flexDirection: vertical ? 'column' : 'row', gap: vertical ? 8 : 0 }}>
      {progress.map((step, i) => <View key={step.label} style={{ flex: vertical ? undefined : 1, flexDirection: vertical ? 'row' : 'column', alignItems: vertical ? 'flex-start' : 'center', gap: 6 }}>
        <View style={{ width: vertical ? 28 : '100%', height: 28, alignItems: 'center', justifyContent: 'center' }}>
          {!vertical && i > 0 && <View style={[local.connector, { left: 0, right: '50%', backgroundColor: progress[i - 1].state === 'complete' ? palette.orange : palette.border }]} />}
          {!vertical && i < progress.length - 1 && <View style={[local.connector, { left: '50%', right: 0, backgroundColor: step.state === 'complete' ? palette.orange : palette.border }]} />}
          <View style={[local.dot, step.state !== 'upcoming' && { borderColor: palette.orange, backgroundColor: palette.orange }, step.state === 'current' && { borderWidth: 3, borderColor: '#FFA25C' }]}>{step.state === 'complete' && <Check size={16} color={palette.onOrange} />}</View>
        </View>
        <Text style={[styles.muted, { fontSize: 12, textAlign: vertical ? 'left' : 'center', flexShrink: 1, ...(vertical ? { flex: 1, paddingTop: 3 } : {}) }]}>{step.label}</Text>
      </View>)}
    </View>
    {outdated && <View style={styles.between}><Text style={[styles.muted, { flexShrink: 1 }]}>Status may be outdated.</Text><Action label="Retry order status" title="Retry" onPress={retry} disabled={refreshing} /></View>}
    <View style={[styles.between, { borderTopWidth: 1, borderColor: palette.border, paddingTop: 4 }]}>
      <Action title="View order" label={`View order ${order.orderNumber}`} onPress={() => router.push({ pathname: '/order/[id]', params: guest ? { id: order.orderNumber, guest: '1' } : { id: order._id! } })} />
      <View style={styles.row}><Icon size={20} color={palette.muted} /><Text style={styles.muted}>{pickup ? 'Pickup' : delivery ? 'Delivery' : 'Dine in'}</Text></View>
    </View>
    {orders.length > 1 && <Action title={`View all active orders (${orders.length})`} onPress={() => router.navigate({ pathname: '/(tabs)/orders', params: { active: '1' } })} />}
  </View>;
}
function Action({ title, label, onPress, disabled }: { title: string; label?: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label || title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, opacity: disabled ? 0.45 : pressed ? 0.65 : 1, flexShrink: 1 })}><Text style={[styles.text, { color: palette.orange, fontWeight: '700', flexShrink: 1 }]}>{title}</Text><ChevronRight color={palette.orange} size={20} /></Pressable>;
}
const local = StyleSheet.create({
  card: { borderColor: palette.orange, gap: 16 }, label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  icon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#382719', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#555555', backgroundColor: palette.border },
  connector: { height: 3, position: 'absolute', top: 12 },
});
