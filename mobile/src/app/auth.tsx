import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '../state/AppProvider';
import { passwordError } from '../domain/cart';
import { Button, Chip, Field, Notice, Screen, messageOf, styles } from '../components/ui';
export default function Auth() {
  const { mode: initialMode, offer, combo, quantity, favorite } = useLocalSearchParams<{ mode?: string; offer?: string; combo?: string; quantity?: string; favorite?: string }>();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode === 'register' ? 'register' : 'login');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const gate = useRef(false); const app = useApp();
  const submit = async () => {
    if (gate.current) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 160) return setError('Enter a valid email');
    if (!password) return setError('Enter your password');
    if (mode === 'register' && (!name.trim() || name.length > 100 || passwordError(password))) return setError(passwordError(password) || 'Enter a name of 1–100 characters');
    if (phone && !/^[+\d][\d\s()-]{5,29}$/.test(phone.trim())) return setError('Enter a valid phone');
    gate.current = true; setBusy(true); setError('');
    try {
      await app.authenticate(mode, { name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), password }); setPassword('');
      // Return only to fixed app routes. The destination re-fetches the offer ID;
      // no coupon, price, or arbitrary return URL is trusted from auth params.
      const safeId = (value?: string) => typeof value === 'string' && /^[A-Za-z0-9-]{1,120}$/.test(value);
      if (app.pending) router.replace('/checkout');
      else if (safeId(favorite)) router.replace({ pathname: '/item/[id]', params: { id: favorite!, favorite: 'review' } });
      else if (safeId(offer) && safeId(combo)) router.replace({ pathname: '/combo/[id]', params: { id: combo!, offer, quantity: String(Number.isInteger(Number(quantity)) && Number(quantity) >= 1 && Number(quantity) <= 99 ? Number(quantity) : 1) } });
      else if (safeId(offer)) router.replace({ pathname: '/(tabs)/cart', params: { offer } });
      else router.replace('/(tabs)/profile');
    }
    catch (e) { setError(messageOf(e)); } finally { gate.current = false; setBusy(false); }
  };
  return <Screen><Text style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Join the table'}</Text>
    <View style={styles.row}><Chip label="Sign in" disabled={busy} selected={mode === 'login'} onPress={() => setMode('login')} /><Chip label="Register" disabled={busy} selected={mode === 'register'} onPress={() => setMode('register')} /></View>
    <Text style={styles.muted}>Use your existing Dune & Grills customer account. Switching accounts starts a fresh device cart.</Text>
    {mode === 'register' && <><Field label="Name" value={name} onChangeText={setName} maxLength={100} autoComplete="name" /><Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={30} /></>}
    <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={160} />
    <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
    {mode === 'register' && <Text style={styles.muted}>At least 10 characters: uppercase, lowercase, number and symbol.</Text>}
    <Notice message={error} /><Button title={busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} disabled={busy} onPress={() => void submit()} />
  </Screen>;
}
