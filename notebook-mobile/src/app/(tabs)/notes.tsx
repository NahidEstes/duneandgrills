import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Search, SlidersHorizontal } from 'lucide-react-native';
import { filterNotes, type Filters } from '../../domain/notebook';
import { useNotebook } from '../../state/NotebookProvider';
import { Button, c, Chip, Field, Heading, Notice, Screen, s } from '../../components/ui';
import NoteCard from '../../components/NoteCard';
export default function Notes() {
  const app = useNotebook();
  const [filters, setFilters] = useState<Filters>({ search: '', status: '', category: '', from: '', to: '' });
  const [expanded, setExpanded] = useState(false);
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [error, setError] = useState('');
  const results = useMemo(() => filterNotes(app.notes, filters), [app.notes, filters]);
  function applyDates() {
    const valid = (value: string) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(+new Date(value)) && new Date(value).toISOString().slice(0, 10) === value);
    if (!valid(from) || !valid(to) || (from && to && from > to)) { setError('Enter a valid date range using YYYY-MM-DD.'); return; }
    setError(''); setFilters(old => ({ ...old, from, to }));
  }
  return <Screen scroll={false}><FlatList data={results} keyExtractor={n => n.id} contentContainerStyle={[s.content, { gap: 13 }]} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <NoteCard note={item} />} refreshing={app.syncing} onRefresh={() => void app.sync()} ListHeaderComponent={<View style={{ gap: 17, paddingBottom: 6 }}><Heading title="All Notes" subtitle={app.notes.length + ' notes · Your restaurant notebook'} />
    <View style={[s.row, s.input, { paddingVertical: 0 }]}><Search color={c.muted} size={20} /><TextInput accessibilityLabel="Search notes" placeholder="Search notes, items, payments…" placeholderTextColor="#756E65" value={filters.search} onChangeText={search => setFilters(old => ({ ...old, search }))} style={{ flex: 1, color: c.text, height: 50, fontSize: 14 }} /><Pressable accessibilityRole="button" accessibilityLabel="More filters" onPress={() => setExpanded(!expanded)} style={{ padding: 6 }}><SlidersHorizontal color={expanded ? c.amber : c.muted} size={20} /></Pressable></View>
    <View style={[s.row, { gap: 8, flexWrap: 'wrap' }]}>{[{ value: '', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'entered', label: 'Entered' }].map(item => <Chip key={item.value} title={item.label} active={filters.status === item.value} onPress={() => setFilters(old => ({ ...old, status: item.value }))} />)}</View>
    {expanded && <View style={[s.card, { gap: 14 }]}><Text style={s.label}>Category</Text><View style={[s.row, { flexWrap: 'wrap', gap: 7 }]}>{['', 'purchase', 'expense', 'other'].map(value => <Chip key={value} title={value ? value[0].toUpperCase() + value.slice(1) : 'Any'} active={filters.category === value} onPress={() => setFilters(old => ({ ...old, category: value }))} />)}</View><Field label="From Date" optional placeholder="YYYY-MM-DD" value={from} onChangeText={setFrom} maxLength={10} /><Field label="To Date" optional placeholder="YYYY-MM-DD" value={to} onChangeText={setTo} maxLength={10} /><Notice danger>{error}</Notice><Button title="Apply Dates" secondary onPress={applyDates} /><Pressable accessibilityRole="button" onPress={() => { setFrom(''); setTo(''); setError(''); setFilters({ search: '', status: '', category: '', from: '', to: '' }); }}><Text style={{ color: c.amber, textAlign: 'center' }}>Reset Filters</Text></Pressable></View>}
    <Text style={s.muted}>{results.length} {results.length === 1 ? 'note' : 'notes'}{filters.from || filters.to ? ' · Date filter applied' : ''}</Text></View>} ListEmptyComponent={<View style={[s.card, { gap: 10, alignItems: 'center', paddingVertical: 35 }]}><Search color={c.amber} size={29} /><Text style={s.heading}>No notes found</Text><Text style={s.muted}>{app.notes.length ? 'Try a different search or filter.' : 'Your first saved note will appear here.'}</Text></View>} /></Screen>;
}
