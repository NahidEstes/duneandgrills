import { useRef, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '../../state/AppProvider';
import { useResource } from '../../hooks/useResource';
import type { Address } from '../../domain/types';
import { Button, Field, Loading, Notice, Screen, messageOf, styles } from '../../components/ui';
export default function AddressEditor() { const app = useApp(); const { id } = useLocalSearchParams<{ id: string }>(); return <AddressForm key={`${app.session?.user._id || 'guest'}:${id}`} />; }
function AddressForm() {
  const { id } = useLocalSearchParams<{ id: string }>(); const app = useApp(); const actor = app.session?.user._id || 'guest';
  const resource = useResource(async signal => app.session ? (await app.request<{ data: Address[] }>('/profile/addresses', { signal })).data : [], actor);
  const initial = resource.data?.find(a => a._id === id) || { label: '', fullAddress: '', phone: '', isDefault: false };
  const [draft, setDraft] = useState<Pick<Address, 'label' | 'fullAddress' | 'phone' | 'isDefault'> | null>(null);
  const { label, fullAddress, phone, isDefault } = draft || initial;
  const setLabel = (label: string) => setDraft(d => ({ ...(d || initial), label }));
  const setFullAddress = (fullAddress: string) => setDraft(d => ({ ...(d || initial), fullAddress }));
  const setPhone = (phone: string) => setDraft(d => ({ ...(d || initial), phone }));
  const setDefault = (isDefault: boolean) => setDraft(d => ({ ...(d || initial), isDefault })); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const gate = useRef(false);
  const save = async () => {
    if (gate.current) return;
    if (!label.trim() || label.length > 40 || !fullAddress.trim() || fullAddress.length > 300) return setError('Enter a label (1–40 characters) and address (1–300 characters)');
    if (phone && !/^[+\d][\d\s()-]{5,29}$/.test(phone.trim())) return setError('Enter a valid phone number');
    gate.current = true; setBusy(true); setError('');
    try { await app.request(`/profile/addresses${id === 'new' ? '' : '/' + id}`, { method: id === 'new' ? 'POST' : 'PATCH', body: { label: label.trim(), fullAddress: fullAddress.trim(), phone: phone.trim(), isDefault } }); await app.validateSession(); router.replace('/(tabs)/profile'); }
    catch (e) { setError(messageOf(e)); } finally { gate.current = false; setBusy(false); }
  };
  if (!app.session) return <Screen><Text style={styles.text}>Sign in to manage addresses.</Text><Button title="Sign in" onPress={() => router.push('/auth')} /></Screen>;
  return <Screen><Text style={styles.title}>{id === 'new' ? 'Add an address' : 'Edit address'}</Text><Notice message={error || resource.error} retry={resource.error ? () => void resource.refresh() : undefined} />
    {resource.loading && !resource.data ? <Loading /> : id !== 'new' && resource.data && !resource.data.some(a => a._id === id) ? <Text style={styles.text}>Address not found in this account.</Text> : <>
      <Field label="Label" value={label} onChangeText={setLabel} maxLength={40} placeholder="Home, work…" /><Field label="Full address" value={fullAddress} onChangeText={setFullAddress} maxLength={300} multiline /><Field label="Phone (optional)" value={phone} onChangeText={setPhone} maxLength={30} keyboardType="phone-pad" />
      <View style={styles.between}><Text style={styles.text}>Default address</Text><Switch accessibilityLabel="Default address" disabled={initial.isDefault} value={isDefault} onValueChange={setDefault} /></View>
      {initial.isDefault && <Text style={styles.muted}>To change your default address, choose another address in Profile.</Text>}
      <Button title={busy ? 'Saving…' : 'Save address'} disabled={busy} onPress={() => void save()} />
    </>}
  </Screen>;
}
