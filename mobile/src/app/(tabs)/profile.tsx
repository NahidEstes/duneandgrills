import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../../state/AppProvider';
import { useResource } from '../../hooks/useResource';
import { customerError } from '../../domain/cart';
import type { Address, User } from '../../domain/types';
import { Button, Field, Loading, Notice, Screen, messageOf, styles } from '../../components/ui';
export default function Profile() { const app = useApp(); return <ProfileForm key={app.session?.user._id || 'guest'} />; }
function ProfileForm() {
  const app = useApp(); const actor = app.session?.user._id || 'guest';
  const addresses = useResource(async signal => app.session ? (await app.request<{ data: Address[] }>('/profile/addresses', { signal })).data : [], actor);
  const [name, setName] = useState(app.session?.user.name || ''); const [email, setEmail] = useState(app.session?.user.email || ''); const [phone, setPhone] = useState(app.session?.user.phone || ''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const gate = useRef(false);
  const action = async (work: () => Promise<void>) => {
    if (gate.current) return; gate.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { setError(messageOf(e)); } finally { gate.current = false; setBusy(false); }
  };
  const save = async () => {
    const validation = customerError({ name: name.trim(), phone: phone.trim() || '+966000000000', email: email.trim(), address: '' });
    if (validation || !email.trim()) throw new Error(validation || 'Email is required');
    const result = await app.request<{ user: User }>('/auth/me', { method: 'PATCH', body: { name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim() } });
    await app.updateUser(result.user); setNotice('Profile updated.');
  };
  return <Screen refreshing={addresses.loading} onRefresh={() => { void addresses.refresh(); void app.validateSession(); }}><Text style={styles.title}>{app.session ? `Hello, ${app.session.user.name}` : 'A seat at our table'}</Text>
    <Notice message={error || app.error} />{!!notice && <Text style={styles.text}>{notice}</Text>}
    {!app.session ? <><Text style={styles.text}>Sign in to manage your profile, saved addresses and order history.</Text><Button title="Sign in" onPress={() => router.push('/auth')} /><Button title="Create customer account" secondary onPress={() => router.push({ pathname: '/auth', params: { mode: 'register' } })} />
      {!!app.cart.length && <Button title="Clear cart and continue as guest" secondary disabled={busy || !!app.pending || app.busy} onPress={() => void action(app.logout)} />}
    </> : <>
      {!app.sessionValidated && <Button title="Validate saved session" secondary onPress={() => void app.validateSession()} />}
      <Field label="Name" value={name} onChangeText={setName} maxLength={100} /><Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={160} /><Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={30} />
      <Button title={busy ? 'Please wait…' : 'Save profile'} disabled={busy} onPress={() => void action(save)} />
      <Text style={styles.heading}>Saved addresses</Text><Notice message={addresses.error} retry={() => void addresses.refresh()} />{addresses.loading && !addresses.data && <Loading />}
      {addresses.data?.map(a => <View key={a._id} style={styles.card}><Text style={styles.heading}>{a.label}{a.isDefault ? ' · Default' : ''}</Text><Text style={styles.text}>{a.fullAddress}</Text><Text style={styles.muted}>{a.phone}</Text>
        <Button title="Edit address" secondary disabled={busy} onPress={() => router.push({ pathname: '/address/[id]', params: { id: a._id } })} />
        {!a.isDefault && <Button title="Set as default" secondary disabled={busy} onPress={() => void action(async () => { await app.request(`/profile/addresses/${a._id}/default`, { method: 'PATCH', body: {} }); await addresses.refresh(); await app.validateSession(); })} />}
        <Button title="Delete address" secondary disabled={busy} onPress={() => void action(async () => { await app.request(`/profile/addresses/${a._id}`, { method: 'DELETE' }); await addresses.refresh(); await app.validateSession(); })} />
      </View>)}
      {addresses.data && !addresses.data.length && <Text style={styles.muted}>No saved addresses yet.</Text>}
      <Button title="Add address" disabled={busy} onPress={() => router.push({ pathname: '/address/[id]', params: { id: 'new' } })} />
      <Text style={styles.muted}>Logout clears this account’s device cart. Resolve any pending order first.</Text><Button title="Log out" secondary disabled={busy || !!app.pending || app.busy} onPress={() => void action(app.logout)} />
    </>}
  </Screen>;
}
