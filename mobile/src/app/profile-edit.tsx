import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../state/AppProvider';
import { useAccountAction } from '../hooks/useAccountAction';
import { profileError } from '../domain/profile';
import type { User } from '../domain/types';
import { Button, Field, Notice, Screen, styles } from '../components/ui';

export default function ProfileEditor() { const app = useApp(); return <ProfileForm key={app.session?.user._id || 'guest'} />; }
function ProfileForm() {
  const app = useApp(); const action = useAccountAction();
  const [name, setName] = useState(app.session?.user.name || ''); const [email, setEmail] = useState(app.session?.user.email || ''); const [phone, setPhone] = useState(app.session?.user.phone || '');
  const [validation, setValidation] = useState(''); const [notice, setNotice] = useState('');
  const change = (set: (value: string) => void) => (value: string) => { set(value); setValidation(''); setNotice(''); };
  const save = () => {
    setNotice(''); const error = profileError(name, email, phone); setValidation(error || ''); if (error) return;
    void action.run(async active => {
      const result = await app.request<{ user: User }>('/auth/me', { method: 'PATCH', body: { name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim() } });
      if (!active()) return;
      await app.updateUser(result.user); if (active()) setNotice('Profile updated.');
    });
  };
  if (!app.session) return <Screen><Text style={styles.text}>Sign in to edit your profile.</Text><Button title="Sign in" onPress={() => router.push('/auth')} /></Screen>;
  return <Screen><Text accessibilityRole="header" style={styles.title}>Personal information</Text><Notice message={validation || action.error || app.error} />
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text>}
    <View style={styles.card}><Field label="Name" value={name} onChangeText={change(setName)} editable={!action.busy} autoComplete="name" maxLength={100} /><Field label="Email" value={email} onChangeText={change(setEmail)} editable={!action.busy} keyboardType="email-address" autoComplete="email" autoCapitalize="none" maxLength={160} /><Field label="Phone (optional)" value={phone} onChangeText={change(setPhone)} editable={!action.busy} keyboardType="phone-pad" autoComplete="tel" maxLength={30} /></View>
    <Button title={action.busy ? 'Saving…' : 'Save profile'} disabled={action.busy} onPress={save} />{!!notice && <Button title="Done" secondary onPress={() => router.dismissTo('/(tabs)/profile')} />}
  </Screen>;
}
