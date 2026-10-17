import { useState } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { useRider } from '../state/RiderProvider';
import { Button, Notice, Review, styles } from './ui';
export default function Recovery() {
  const app = useRider(); const [open, setOpen] = useState(false), [error, setError] = useState('');
  if (!app.pending || !app.session) return null;
  const pending = app.pending;
  return <View style={{ padding: 12, backgroundColor: '#292318', gap: 8 }}><Text style={styles.text}>Unconfirmed action: {pending.orderNumber || 'Availability'} · {pending.action.replace('_', ' ')}</Text><Text style={styles.muted}>Check the server, then explicitly retry the saved request. Nothing is sent automatically.</Text><View style={{ flexDirection: 'row', gap: 10 }}>{pending.deliveryId && <View style={{ flex: 1 }}><Button title="View delivery" outline disabled={app.busy} onPress={() => router.push({ pathname: '/deliveries/[id]', params: { id: pending.deliveryId! } })} /></View>}<View style={{ flex: 1 }}><Button title="Review retry" disabled={app.busy} onPress={() => { setError(''); setOpen(true); }} /></View></View><Review visible={open} title="Retry the saved action?" busy={app.busy} close={() => setOpen(false)} confirm={() => { void app.retry().then(() => setOpen(false)).catch(e => setError(e.message)); }}><Text style={styles.text}>This resends the original request with the same unique identifier. A previously stored action will not be repeated.</Text><Text style={styles.muted}>{pending.orderNumber || 'Availability'} · {pending.action.replace('_', ' ')}</Text>{pending.payload.amount !== undefined && <Text style={styles.text}>Cash report: SAR {String(pending.payload.amount)}</Text>}{pending.payload.available !== undefined && <Text style={styles.text}>Availability: {pending.payload.available ? 'Available' : 'Unavailable'}</Text>}{pending.payload.reason ? <Text style={styles.text}>Reason: {String(pending.payload.reason)}</Text> : null}<Notice text={error} danger /></Review></View>;
}
