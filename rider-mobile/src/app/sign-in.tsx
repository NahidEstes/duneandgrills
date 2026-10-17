import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { useRider } from '../state/RiderProvider';
import { Brand, Button, Card, colors, Field, Notice, Screen, styles } from '../components/ui';
export default function SignIn() {
  const app = useRider(); const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState('');
  const submit = async () => { setError(''); try { await app.signIn(email, password); setPassword(''); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in.'); } };
  return <Screen><Brand /><View style={{ alignItems: 'center', gap: 13, paddingVertical: 32 }}><ShieldCheck size={46} color={colors.amber} /><Text style={styles.title}>Rider sign in</Text><Text style={styles.muted}>Your private restaurant delivery workspace</Text></View><Card><Field label="Email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" value={email} onChangeText={setEmail} editable={!app.busy} /><Field label="Password" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} editable={!app.busy} onSubmitEditing={() => void submit()} /><Notice text={error || app.error} danger /><Button title={app.busy ? 'Signing in…' : 'Sign in'} disabled={app.busy || !email.trim() || !password || Platform.OS === 'web'} onPress={() => void submit()} /></Card><Text style={styles.muted}>Use the Rider account provided by your restaurant administrator. There is no public rider registration.</Text>{app.pending && <Notice text="A saved action needs the original rider account. Keep this app data until the result is resolved." />}{Platform.OS === 'web' && <Notice text="Staff sign in requires the native Android or iOS app." />}</Screen>;
}
