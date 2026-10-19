import { Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { FileText, Receipt, ShoppingBasket } from 'lucide-react-native';
import { dateLabel, money, titleOf, type Note } from '../domain/notebook';
import { Badge, c, s } from './ui';
export default function NoteCard({ note }: { note: Note }) {
  const Icon = note.category === 'purchase' ? ShoppingBasket : note.category === 'expense' ? Receipt : FileText;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open note: ${titleOf(note)}`} onPress={() => router.push({ pathname: '/note/[id]', params: { id: note.id } })} style={({ pressed }) => [s.card, { padding: 17, opacity: pressed ? 0.8 : 1 }]}>
    <View style={[s.row, { alignItems: 'flex-start' }]}><View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.tint, alignItems: 'center', justifyContent: 'center' }}><Icon color={c.amber} size={23} /></View><View style={{ flex: 1, gap: 5 }}><Text numberOfLines={2} style={[s.text, { fontWeight: '700', lineHeight: 21 }]}>{titleOf(note)}</Text><Text style={s.muted}>{note.amountMinor !== null ? money(note.amountMinor) : 'No amount'}{note.payment ? ` · ${note.payment === 'cash' ? 'Cash' : 'Credit'}` : ''}</Text></View>{!!note.receiptData && <Image source={{ uri: note.receiptData }} style={{ width: 39, height: 48, borderRadius: 7, borderWidth: 1, borderColor: c.border }} />}</View>
    <View style={[s.row, { justifyContent: 'space-between', marginTop: 15 }]}><Text style={[s.muted, { fontSize: 11 }]}>{dateLabel(note.createdAt)}</Text><Badge note={note} /></View>
    {!note.synced && <Text style={[s.muted, { fontSize: 10, marginTop: 8 }]}>{note.conflict ? 'Review both versions before syncing' : 'Saved on device'}</Text>}
  </Pressable>;
}
