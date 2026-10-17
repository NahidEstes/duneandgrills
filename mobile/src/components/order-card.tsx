import { View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Text, Pressable } from '../i18n/native';
import { useLanguage } from '../i18n/LocaleProvider';
import { formatDate, t } from '../i18n/core';
import type { Order } from '../domain/types';
import { activeOrder, orderProgress, paymentLabel, statusLabel, terminal } from '../domain/orders';
import { money } from '../domain/cart';
import { palette } from '../constants/design';
import { Check, CookingPot, ShoppingBag, Truck, ReceiptText } from './icons';
import { Button, FoodImage, styles } from './ui';

export function OrderCard({ order, guest = false, stale = false, onAgain, disabled }: { order: Order; guest?: boolean; stale?: boolean; onAgain?: () => void; disabled?: boolean }) {
  "use no memo";
  useLanguage();
  const finished = terminal(order);
  const tone = stale ? palette.muted : order.status === 'delivered' ? palette.success : finished ? palette.danger : palette.orange;
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const open = () => router.push({ pathname: '/order/[id]', params: guest ? { id: order.orderNumber, guest: '1' } : { id: order._id! } });
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={`View order ${order.orderNumber}`} onPress={open} style={{ gap: 12 }}>
      <View style={styles.between}><Text translate={false} style={[styles.heading, { fontSize: 18, flexShrink: 1 }]}>{order.orderNumber}</Text><View style={{ borderWidth: 1, borderColor: tone, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ color: tone, fontSize: 12, fontWeight: '700' }}>{stale ? 'Open private tracking' : statusLabel(order)}</Text></View></View>
      <Text style={styles.muted}>{order.fulfillmentType === 'delivery' ? 'Delivery' : order.fulfillmentType === 'pickup' ? 'Pickup' : 'Dine in'} · {formatDate(order.createdAt)}</Text>
      {order.scheduledAt && <Text style={styles.text}>Scheduled for: {formatDate(order.scheduledAt)}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {order.items[0] && <FoodImage uri={order.items[0].image} style={{ width: 72, height: 72, borderRadius: 13 }} />}
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={[styles.text, { fontWeight: '600' }]}>{order.items.map(item => item.name).join(' + ')}</Text><Text style={styles.muted}>{count} {count === 1 ? 'item' : 'items'}</Text><Text style={[styles.heading, { fontSize: 20 }]}>{money(order.totalAmount)}</Text></View>
      </View>
    </Pressable>
    {activeOrder(order) && !stale && <Progress order={order} />}
    {!finished && !stale && order.status === 'preparing' && typeof order.estimatedPreparationMinutes === 'number' && order.estimatedPreparationMinutes > 0 && <Text style={styles.muted}>Preparation estimate · {order.estimatedPreparationMinutes} min</Text>}
    <Text style={styles.muted}>{paymentLabel(order)}</Text>
    {!finished || guest ? <Button title="Track order" label={`Track order ${order.orderNumber}`} onPress={open} /> : null}
    {onAgain && <Button title="Order again" label={`Order again ${order.orderNumber}`} secondary disabled={disabled} onPress={onAgain} />}
  </View>;
}

function Progress({ order }: { order: Order }) {
  "use no memo";
  useLanguage();
  const { width, fontScale } = useWindowDimensions();
  const vertical = width < 360 || fontScale > 1.2;
  const progress = orderProgress(order);
  const icons = [ReceiptText, CookingPot, ShoppingBag, ...(order.fulfillmentType === 'delivery' ? [Truck] : []), Check];
  return <View accessible accessibilityLabel={`Order progress: ${progress.map(step => `${t(step.label)}, ${t(step.state)}`).join('; ')}`} style={{ flexDirection: vertical ? 'column' : 'row', gap: vertical ? 10 : 0, paddingVertical: 10 }}>
    {progress.map((step, index) => {
      const Icon = step.state === 'complete' ? Check : icons[index]; const active = step.state !== 'upcoming';
      return <View key={step.label} style={{ flex: vertical ? undefined : 1, alignItems: 'center', flexDirection: vertical ? 'row' : 'column', gap: 8 }}>
        <View style={{ width: vertical ? 36 : '100%', alignItems: 'center' }}>
          {!vertical && index < progress.length - 1 && <View style={{ height: 2, top: 17, position: 'absolute', left: '50%', width: '100%', backgroundColor: step.state === 'complete' ? palette.orange : palette.border }} />}
          <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: active ? palette.orange : palette.border, backgroundColor: active ? palette.orange : palette.surface, alignItems: 'center', justifyContent: 'center' }}><Icon size={18} color={active ? palette.onOrange : palette.muted} /></View>
        </View>
        <Text style={[styles.muted, { fontSize: 11, lineHeight: 16, textAlign: vertical ? undefined : 'center', flexShrink: 1 }]}>{step.label}</Text>
      </View>;
    })}
  </View>;
}
