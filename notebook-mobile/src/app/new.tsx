import { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Camera, Check, ImagePlus, Info, Mic, MoreHorizontal, ShoppingCart, Wallet, X } from 'lucide-react-native';
import { useNotebook } from '../state/NotebookProvider';
import { emptyDraft, type Draft } from '../domain/notebook';
import { Button, c, Chip, Field, Heading, Notice, ReceiptViewer, Screen, s } from '../components/ui';
import { pickReceipt } from '../services/receipt';
import { useDictation } from '../services/dictation';

export default function NewNote() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const app = useNotebook();
  const existing = app.notes.find(n => n.id === id);
  const [initial] = useState<Draft>(() => existing ? { text: existing.text, title: existing.title, category: existing.category, quantity: existing.quantity, payment: existing.payment, receiptData: existing.receiptData, amount: existing.amountMinor === null ? '' : (existing.amountMinor / 100).toFixed(2) } : emptyDraft());
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [details, setDetails] = useState(!!existing?.title || !!existing?.quantity);
  const [showReceipt, setShowReceipt] = useState(false);
  const [voiceHelp, setVoiceHelp] = useState(false);
  const [discard, setDiscard] = useState(false);
  const leaving = useRef(false);
  const navigation = useNavigation();
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const dictation = useDictation(text => setDraft(old => ({ ...old, text: [old.text, text].filter(Boolean).join(' ') })), setError);
  useEffect(() => navigation.addListener('beforeRemove', event => {
    if (dirty && !leaving.current) { event.preventDefault(); setDiscard(true); }
  }), [dirty, navigation]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(old => ({ ...old, [key]: value }));
  async function attach(camera: boolean) {
    if (photoBusy) return;
    setPhotoBusy(true); setError('');
    try { const image = await pickReceipt(camera); if (image) set('receiptData', image); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not attach the receipt. Try again.'); }
    finally { setPhotoBusy(false); }
  }
  async function save() {
    if (busy || photoBusy) return;
    dictation.stop(); setBusy(true); setError('');
    try { const noteId = await app.save(draft, id); leaving.current = true; router.replace({ pathname: '/note/[id]', params: { id: noteId } }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Keep this screen open and retry.'); }
    finally { setBusy(false); }
  }
  if (id && (!existing || existing.status === 'entered')) return <Screen><Heading title="Note Unavailable" back /><Notice>Entered notes are read-only. Open the note details or create a separate correction.</Notice><Button title="Back to Notes" onPress={() => router.replace('/notes')} /></Screen>;
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Screen>
    <Heading title={id ? 'Edit Note' : 'New Note'} back />
    {discard && <View style={{ gap: 10 }}><Notice>You have an unsaved note. Save it below or discard these changes.</Notice><Button title="Keep Editing" secondary onPress={() => setDiscard(false)} /><Button title="Discard Changes" onPress={() => { dictation.stop(); leaving.current = true; router.back(); }} /></View>}
    <View style={{ gap: 8 }}><Field label="What would you like to note?" accessibilityHint="Only this field is required" value={draft.text} onChangeText={value => set('text', value)} multiline maxLength={5000} placeholder="Bought 10 kg of chicken for SAR 230. Paid in cash." style={{ minHeight: 165, paddingBottom: 45, textAlignVertical: 'top', fontSize: 17, lineHeight: 26 }} /><Pressable accessibilityRole="button" accessibilityLabel={dictation.listening ? 'Stop voice input' : 'Voice input'} onPress={() => dictation.supported ? dictation.listening ? dictation.stop() : dictation.start() : setVoiceHelp(!voiceHelp)} style={{ position: 'absolute', bottom: 9, right: 10, padding: 8 }}><Mic size={24} color={dictation.listening ? c.text : c.amber} /></Pressable></View>
    {dictation.listening && <Notice>Listening in English… Tap the microphone to stop.</Notice>}
    {voiceHelp && <Notice>In-app voice input is unavailable on this device. Use your phone keyboard’s microphone to dictate your note.</Notice>}
    <View style={{ gap: 10 }}><Text style={s.label}>Category <Text style={s.muted}>(optional)</Text></Text><View style={[s.row, { gap: 8, flexWrap: 'wrap' }]}>{([{ value: 'purchase', label: 'Purchase', icon: ShoppingCart }, { value: 'expense', label: 'Expense', icon: Wallet }, { value: 'other', label: 'Other', icon: MoreHorizontal }] as const).map(item => <Chip key={item.value} title={item.label} icon={item.icon} active={draft.category === item.value} onPress={() => set('category', draft.category === item.value ? '' : item.value)} />)}</View></View>
    <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#714509', borderRadius: 16, backgroundColor: '#100D08', padding: 18, gap: 13 }}>
      {draft.receiptData ? <View style={[s.row, { justifyContent: 'space-between' }]}><Pressable accessibilityRole="button" accessibilityLabel="Preview attached receipt" onPress={() => setShowReceipt(true)}><Image source={{ uri: draft.receiptData }} style={{ width: 66, height: 88, borderRadius: 8 }} /></Pressable><View style={{ flex: 1 }}><Text style={s.text}>Receipt attached</Text><Text style={s.muted}>Tap to preview</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Remove receipt" onPress={() => set('receiptData', '')} style={s.back}><X color={c.amber} size={19} /></Pressable></View> : <View style={{ alignItems: 'center', gap: 9 }}><Camera color={c.amber} size={31} /><Text style={{ color: c.sand, fontSize: 15, fontWeight: '600' }}>{photoBusy ? 'Preparing receipt…' : 'Add Receipt Photo'}</Text></View>}
      <View style={[s.row, { justifyContent: 'center', gap: 22 }]}><Pressable disabled={photoBusy} accessibilityRole="button" onPress={() => void attach(true)} style={s.row}><Camera color={c.amber} size={15} /><Text style={{ color: c.amber, fontSize: 12 }}>Take Photo</Text></Pressable><Pressable disabled={photoBusy} accessibilityRole="button" onPress={() => void attach(false)} style={s.row}><ImagePlus color={c.amber} size={15} /><Text style={{ color: c.amber, fontSize: 12 }}>Choose Photo</Text></Pressable></View>
    </View>
    <View><Field label="Amount" optional value={draft.amount} onChangeText={value => set('amount', value)} keyboardType="decimal-pad" placeholder="0.00" style={{ paddingRight: 65 }} /><Text style={{ position: 'absolute', right: 16, bottom: 17, color: c.sand, fontWeight: '600' }}>SAR</Text></View>
    <View style={{ gap: 10 }}><Text style={s.label}>Payment Method <Text style={s.muted}>(optional)</Text></Text><View style={s.row}>{(['cash', 'credit'] as const).map(value => <View key={value} style={{ flex: 1 }}><Chip title={value === 'cash' ? 'Cash' : 'Credit'} icon={Wallet} active={draft.payment === value} onPress={() => set('payment', draft.payment === value ? '' : value)} /></View>)}</View></View>
    <Pressable accessibilityRole="button" onPress={() => setDetails(!details)}><Text style={{ color: c.amber, fontSize: 13 }}>{details ? '− Hide Extra Details' : '+ Add Title or Quantity'}</Text></Pressable>
    {details && <><Field label="Title" optional value={draft.title} onChangeText={value => set('title', value)} maxLength={100} placeholder="Chicken purchase" /><Field label="Quantity" optional value={draft.quantity} onChangeText={value => set('quantity', value)} maxLength={60} placeholder="10 kg" /></>}
    <Notice danger>{error}</Notice>
    <View style={[s.row, { justifyContent: 'center', gap: 7 }]}><Info color={c.muted} size={14} /><Text style={[s.muted, { fontSize: 11 }]}>You can add more details later.</Text></View>
    <Button title={id ? 'Save Changes' : 'Save Note'} icon={Check} busy={busy} disabled={photoBusy} onPress={() => void save()} />
    <ReceiptViewer uri={showReceipt ? draft.receiptData : null} onClose={() => setShowReceipt(false)} />
  </Screen></KeyboardAvoidingView>;
}
