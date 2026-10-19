import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle2, CreditCard, Info, Package, Pencil, Wallet } from 'lucide-react-native';
import { useNotebook } from '../../state/NotebookProvider';
import { dateLabel, money, titleOf } from '../../domain/notebook';
import { Badge, Button, c, Heading, Notice, ReceiptViewer, Screen, s } from '../../components/ui';
export default function NoteDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useNotebook();
  const note = app.notes.find(n => n.id === id);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Try again.'); } finally { setBusy(false); }
  }
  if (!note) return <Screen><Heading title="Note Not Found" back /><Notice>This note is unavailable on this device.</Notice><Button title="All Notes" onPress={() => router.replace('/notes')} /></Screen>;
  return <Screen><Heading title="Note Details" back /><Badge note={note} />
    <View style={s.card}><Text style={[s.heading, { fontSize: 24, marginBottom: 10 }]}>{titleOf(note)}</Text><Text selectable style={s.text}>{note.text}</Text><Text style={[s.muted, { marginTop: 14 }]}>{dateLabel(note.createdAt)} · Riyadh time</Text>
      {(!!note.quantity || note.amountMinor !== null || !!note.payment) && <View style={s.divider} />}
      {[{ label: 'Quantity', value: note.quantity, icon: Package }, { label: 'Amount', value: note.amountMinor === null ? '' : money(note.amountMinor), icon: Wallet }, { label: 'Payment', value: note.payment === 'cash' ? 'Cash' : note.payment === 'credit' ? 'Credit' : '', icon: CreditCard }].filter(row => row.value).map((row, index) => <View key={row.label} style={[s.row, { paddingVertical: 14, borderTopWidth: index ? 1 : 0, borderColor: c.border }]}><row.icon color={c.amber} size={21} /><Text style={[s.muted, { flex: 1 }]}>{row.label}</Text><Text style={[s.text, { fontWeight: '600', maxWidth: '55%', textAlign: 'right' }]}>{row.value}</Text></View>)}
      {!!note.receiptData && <><View style={s.divider} /><Text style={[s.label, { marginBottom: 12 }]}>Receipt Photo</Text><Pressable accessibilityRole="button" accessibilityLabel="Open full receipt" onPress={() => setReceipt(note.receiptData)}><Image source={{ uri: note.receiptData }} resizeMode="cover" style={{ width: 140, height: 176, borderRadius: 12, borderWidth: 1, borderColor: '#614719' }} /></Pressable><Text style={[s.muted, { fontSize: 11, marginTop: 8 }]}>Tap to view full receipt</Text></>}
    </View>
    {note.conflict && <View style={{ gap: 12 }}><Notice>Another device changed this note. Your local version is shown above. Review the server version below before choosing.</Notice><View style={s.card}><Text style={s.heading}>Server Version</Text><Text style={s.text}>{note.conflict.text}</Text><Text style={s.muted}>{note.conflict.amountMinor === null ? 'No amount' : money(note.conflict.amountMinor)} · {note.conflict.status === 'entered' ? 'Entered' : 'Pending Entry'}</Text>{!!note.conflict.quantity && <Text style={s.muted}>Quantity: {note.conflict.quantity}</Text>}{!!note.conflict.receiptData && <Pressable accessibilityRole="button" accessibilityLabel="View server receipt" onPress={() => setReceipt(note.conflict!.receiptData)}><Text style={{ color: c.amber, marginTop: 10 }}>View Server Receipt</Text></Pressable>}</View><Button title="Keep Server Version" secondary busy={busy} onPress={() => void act(() => app.resolve(id, 'server'))} />{note.conflict.status !== 'entered' && <Button title="Keep My Version" busy={busy} onPress={() => void act(() => app.resolve(id, 'local'))} />}</View>}
    <Notice danger>{error}</Notice>
    {note.status === 'pending' ? <><View style={[s.notice, s.row]}><Info color={c.amber} size={19} /><Text style={[s.muted, { color: c.sand, flex: 1 }]}>After entering this in your main system, mark it below.</Text></View><Button title="Mark as Entered" icon={CheckCircle2} busy={busy} disabled={!!note.conflict} onPress={() => void act(() => app.markEntered(id))} /><Button title="Edit Note" icon={Pencil} secondary disabled={!!note.conflict || busy} onPress={() => router.push({ pathname: '/new', params: { id } })} /></> : <Notice>Marked as entered by {note.enteredBy}{note.enteredAt ? ' on ' + dateLabel(note.enteredAt) : ''}. This note is read-only.</Notice>}
    <Text style={[s.muted, { textAlign: 'center', fontSize: 11 }]}>{note.synced ? 'Saved on device and synced to your staff account' : 'Saved on this device'}</Text><ReceiptViewer uri={receipt} onClose={() => setReceipt(null)} />
  </Screen>;
}
