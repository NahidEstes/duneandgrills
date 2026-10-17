import { router } from 'expo-router';
import { Linking, Text, View } from 'react-native';
import { useState } from 'react';
import { Banknote, ChevronRight, Clock3, TriangleAlert } from 'lucide-react-native';
import { usePortal } from '../../hooks/usePortal';
import { cashLabels, halala, phoneHref } from '../../domain/rider';
import { DEMO } from '../../services/api';
import { Brand, Button, Card, colors, LinkRow, Notice, ReadStatus, Screen, styles } from '../../components/ui';
export default function Cash() {
  const read = usePortal(), data = read.data; const [error, setError] = useState('');
  const contact = phoneHref(data?.restaurantContact?.phone);
  const icons = { collection_pending: Banknote, awaiting_confirmation: Clock3, discrepancy: TriangleAlert };
  return <Screen refresh={() => void read.refresh()} refreshing={read.loading}><Brand /><View><Text style={styles.title}>Cash overview</Text><Text style={styles.muted}>Your reported cash and pending tasks</Text></View><Notice text="Reporting collected cash does not mark an order paid. Cashier confirmation is separate." /><Text style={styles.heading}>Pending Cash</Text>{data?.pendingCash ? (['collection_pending', 'awaiting_confirmation', 'discrepancy'] as const).map(key => { const group = data.pendingCash!.groups[key], Icon = icons[key]; return <Card key={key}><LinkRow title={key === 'collection_pending' ? 'Needs report' : key === 'awaiting_confirmation' ? 'Awaiting cashier' : 'Discrepancy'} subtitle={`${group.count} ${group.count === 1 ? 'order' : 'orders'} · ${halala(group.amountHalala)} ${key === 'collection_pending' ? 'outstanding' : 'reported'}`} icon={<Icon size={27} color={key === 'discrepancy' ? colors.red : colors.amber} />} onPress={() => router.navigate({ pathname: '/deliveries', params: { history: '1', cashStatus: key } })} /></Card>; }) : data && <Card><Text style={styles.text}>Cash overview unavailable</Text><Text style={styles.muted}>Pending cash is available when the rider workflow is enabled.</Text></Card>}
    {!!data?.pendingCash?.deliveries.length && <><Text style={styles.heading}>Recent cash tasks</Text><Card>{data.pendingCash.deliveries.map(row => <LinkRow key={row.id} title={row.orderNumber} subtitle={cashLabels[row.cashState]} icon={<ChevronRight size={18} color={colors.amber} />} onPress={() => router.push({ pathname: '/deliveries/[id]', params: { id: row.id } })} />)}<Text style={styles.muted}>Latest tasks. Open a category for all matching orders.</Text></Card></>}
    <Button title="View cash history" outline onPress={() => router.navigate({ pathname: '/deliveries', params: { history: '1', cashStatus: 'all' } })} /><Button title="Contact Restaurant / Manager" outline disabled={!contact || DEMO} onPress={() => { if (contact) void Linking.openURL(contact).catch(() => setError('The phone app could not open. Contact your restaurant directly.')); }} /><Notice text={error} danger /><ReadStatus {...read} refresh={() => void read.refresh()} /></Screen>;
}
