import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowUpRight, FileClock, Plus, Wallet, WifiOff } from 'lucide-react-native';
import { useNotebook } from '../../state/NotebookProvider';
import { money, summaries } from '../../domain/notebook';
import { Button, c, Heading, Screen, s } from '../../components/ui';
import NoteCard from '../../components/NoteCard';
export default function Home() {
  const app = useNotebook();
  const summary = summaries(app.notes);
  const recent = [...app.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  return <Screen><Heading title="Expense Notebook" subtitle="Capture now. Enter in your main system later." />
    <View style={[s.row, { gap: 12 }]}><View style={[s.card, { flex: 1, padding: 17, backgroundColor: '#1C1409', borderColor: '#65400A', gap: 12 }]}><FileClock color={c.amber} size={23} /><Text style={s.muted}>Pending Entries</Text><Text style={{ color: c.amber, fontSize: 32, fontWeight: '800' }}>{summary.pending}</Text></View><View style={[s.card, { flex: 1, padding: 17, gap: 12 }]}><Wallet color={c.amber} size={23} /><Text style={s.muted}>Today’s Expenses</Text><Text adjustsFontSizeToFit numberOfLines={1} style={{ color: c.amber, fontSize: 23, fontWeight: '800', minHeight: 39 }}>{money(summary.todayMinor)}</Text></View></View>
    <Button title="New Note" icon={Plus} onPress={() => router.push('/new')} />
    <View style={[s.row, { gap: 7, marginTop: 1 }]}><WifiOff size={13} color={c.muted} /><Text style={[s.muted, { fontSize: 11 }]}>{app.syncing ? 'Syncing your notes…' : app.session ? app.syncMessage : 'Works offline · Saved on this device'}</Text></View>
    <View style={[s.row, { justifyContent: 'space-between', marginTop: 8 }]}><Text style={s.heading}>Recent Notes</Text><Pressable accessibilityRole="button" onPress={() => router.push('/notes')} style={s.row}><Text style={{ color: c.amber, fontSize: 12 }}>View All</Text><ArrowUpRight color={c.amber} size={15} /></Pressable></View>
    {recent.map(note => <NoteCard key={note.id} note={note} />)}
    {!recent.length && <View style={[s.card, { paddingVertical: 35, alignItems: 'center', gap: 13 }]}><FileClock color={c.amber} size={34} /><Text style={s.heading}>Your notebook starts here</Text><Text style={[s.muted, { textAlign: 'center', maxWidth: 270 }]}>Bought something? Paid a bill? Save a quick note so nothing gets missed.</Text></View>}
  </Screen>;
}
