import { router } from 'expo-router';
import { Linking, Pressable, Text, View } from 'react-native';
import { useState } from 'react';
import { Banknote, ChevronRight, Clock3, ClipboardCheck, TriangleAlert } from 'lucide-react-native';
import { usePortal } from '../../hooks/usePortal';
import { cashLabels, halala, phoneHref } from '../../domain/rider';
import { DEMO } from '../../services/api';
import { Brand, Button, Card, colors, LinkRow, Notice, ReadStatus, Screen, styles } from '../../components/ui';
export default function Cash() {
  const read = usePortal(), data = read.data; const [error, setError] = useState('');
  const contact = phoneHref(data?.restaurantContact?.phone);
  const icons = { collection_pending: Banknote, awaiting_confirmation: Clock3, discrepancy: TriangleAlert };
  return <Screen refresh={() => void read.refresh()} refreshing={read.loading}><Brand riderName={data?.profile.name} /><View style={{ gap: 4 }}><Text style={styles.title}>Cash overview</Text><Text style={[styles.muted, { fontSize: 14 }]}>Your reported cash and pending tasks</Text></View><Notice text="Reporting collected cash does not mark an order paid. Cashier confirmation is separate." /><Text style={styles.heading}>Pending Cash</Text>{data?.pendingCash ? (['collection_pending', 'awaiting_confirmation', 'discrepancy'] as const).map(key => {
    const group = data.pendingCash!.groups[key], Icon = icons[key];
    const title = key === 'collection_pending' ? 'Needs report' : key === 'awaiting_confirmation' ? 'Awaiting cashier' : 'Discrepancy';
    return <Card key={key} tone={key === 'discrepancy' ? 'danger' : 'neutral'} style={{ borderColor: key === 'discrepancy' ? '#75403d' : colors.border }}><Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => router.navigate({ pathname: '/deliveries', params: { history: '1', cashStatus: key } })} style={[styles.row, { minHeight: 62 }]}><Icon size={31} color={key === 'discrepancy' ? colors.red : key === 'collection_pending' ? colors.amber : colors.text} /><View style={{ flex: 1, gap: 3 }}><Text style={styles.heading}>{title}</Text><Text style={styles.muted}>{group.count} {group.count === 1 ? 'order' : 'orders'}</Text><Text style={[styles.text, { fontWeight: '700' }]}>{halala(group.amountHalala)} {key === 'collection_pending' ? 'outstanding' : 'reported'}</Text></View><ChevronRight size={19} color={colors.muted} /></Pressable></Card>;
  }) : data && <Card><Text style={styles.text}>Cash overview unavailable</Text><Text style={styles.muted}>Pending cash is available when the rider workflow is enabled.</Text></Card>}
    {!!data?.pendingCash?.deliveries.length && <><Text style={styles.heading}>Recent cash tasks</Text><Card>{data.pendingCash.deliveries.map((row, index) => <View key={row.id} style={index ? styles.divider : undefined}><LinkRow title={row.orderNumber} subtitle={cashLabels[row.cashState]} icon={<ClipboardCheck size={21} color={colors.text} />} onPress={() => router.push({ pathname: '/deliveries/[id]', params: { id: row.id } })} /></View>)}<Text style={styles.muted}>Latest tasks. Open a category for all matching orders.</Text></Card></>}
    <Button title="View cash history" outline onPress={() => router.navigate({ pathname: '/deliveries', params: { history: '1', cashStatus: 'all' } })} /><Button title="Contact Restaurant / Manager" outline disabled={!contact || DEMO} onPress={() => { if (contact) void Linking.openURL(contact).catch(() => setError('The phone app could not open. Contact your restaurant directly.')); }} /><Notice text={error} danger /><ReadStatus {...read} refresh={() => void read.refresh()} /></Screen>;
}
