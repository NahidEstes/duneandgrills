import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Banknote, CircleCheck, Clock3, MapPin, Package, Truck, TriangleAlert, UtensilsCrossed } from 'lucide-react-native';
import { cashLabels, halala, stage, stamp } from '../domain/rider';
import type { Delivery } from '../domain/types';
import { Badge, Button, Card, colors, Notice, styles } from './ui';
export default function DeliveryCard({ row, compact = false }: { row: Delivery; compact?: boolean }) {
  const label = stage(row), completed = row.deliveryStatus === 'delivered';
  const Icon = completed ? CircleCheck : row.deliveryStatus === 'issue' ? TriangleAlert : row.deliveryStatus === 'picked_up' ? Truck : row.restaurantStatus === 'ready' ? Package : Clock3;
  const color = label.tone === 'success' ? colors.green : label.tone === 'danger' ? colors.red : label.tone === 'blue' ? colors.blue : colors.amber;
  return <Card style={{ gap: compact ? 8 : 11, padding: compact ? 13 : 15 }}>
    <View style={[styles.spread, { flexWrap: 'wrap', gap: 8 }]}><Text style={[styles.heading, { fontSize: 19 }]}>{row.orderNumber}</Text><Badge text={label.text} tone={label.tone} icon={<Icon size={14} color={color} />} /></View>
    {!completed && <View style={[styles.row, styles.divider]}><UtensilsCrossed size={21} color={colors.text} /><View style={{ flex: 1 }}>{!compact && <Text style={styles.muted}>Restaurant pickup</Text>}<Text style={[styles.text, { fontWeight: '600' }]}>Dune &amp; Grills</Text></View></View>}
    <View style={[styles.row, styles.divider]}>{completed ? <CircleCheck size={21} color={colors.green} /> : <MapPin size={21} color={colors.text} />}<View style={{ flex: 1 }}>{completed ? <><Text style={styles.muted}>Delivered · Riyadh</Text><Text style={styles.text}>{stamp(row.deliveredAt)}</Text></> : <>{!compact && <Text style={styles.muted}>Customer</Text>}<Text style={[styles.text, { fontWeight: '600' }]}>{row.customerName || 'Customer'}</Text><Text style={styles.muted}>{row.customerAddress || 'Open details for the location.'}</Text></>}</View></View>
    <View style={[styles.row, styles.divider]}><Banknote size={21} color={colors.text} /><View style={{ flex: 1 }}><Text style={styles.muted}>{row.cashState === 'collection_pending' && !completed ? 'Cash to collect' : cashLabels[row.cashState]}</Text><Text style={[styles.text, { fontWeight: '700' }]}>{halala(row.cashState === 'collection_pending' ? row.customerCollectionHalala : row.cashState === 'no_collection' ? 0 : row.reportedCashHalala)}</Text></View></View>
    {completed && <Badge text={cashLabels[row.cashState]} tone={row.cashState === 'confirmed' || row.cashState === 'no_collection' ? 'success' : row.cashState === 'discrepancy' || row.cashState === 'unavailable' ? 'danger' : 'amber'} />}
    {row.deliveryStatus === 'assigned' && row.restaurantStatus !== 'ready' && <Text style={[styles.muted, { fontSize: 11 }]}>Pickup available when the kitchen marks this order Ready.</Text>}
    {row.issue && <Notice text="Awaiting manager review. Do not resume until the issue is resolved." danger />}
    <Button title="View delivery →" compact={compact} onPress={() => router.push({ pathname: '/deliveries/[id]', params: { id: row.id } })} />
  </Card>;
}
