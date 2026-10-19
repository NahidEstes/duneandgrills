import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Cloud, CloudOff, RefreshCw, ShieldCheck } from 'lucide-react-native';
import { useNotebook } from '../../state/NotebookProvider';
import { API_URL } from '../../services/api';
import { dateLabel } from '../../domain/notebook';
import { Button, c, Field, Heading, Notice, Screen, s } from '../../components/ui';
export default function Settings() {
  const app = useNotebook();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function connect() {
    if (busy) return; setBusy(true); setError('');
    try { await app.connect(email, password); setPassword(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not connect. Try again.'); }
    finally { setBusy(false); }
  }
  return <Screen><Heading title="Settings" subtitle="A simple notebook. Nothing missed." />
    <View style={[s.card, { gap: 15 }]}><View style={s.row}><ShieldCheck color={c.amber} size={24} /><Text style={s.heading}>Your Notebook</Text></View><View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.muted}>Saved Notes</Text><Text style={s.text}>{app.notes.length}</Text></View><View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.muted}>Waiting to Sync</Text><Text style={s.text}>{app.notes.filter(n => !n.synced).length}</Text></View><Text style={s.muted}>Language: English · Currency: SAR{'\n'}Dates and times: Riyadh</Text></View>
    <View style={[s.card, { gap: 16 }]}><View style={s.row}>{app.session ? <Cloud color={c.amber} /> : <CloudOff color={c.amber} />}<Text style={s.heading}>{app.session ? 'Staff Cloud Backup' : 'Cloud Backup'}</Text></View>
      {app.session ? <><Text style={s.text}>Connected as {app.session.user.name}</Text><Notice>{app.syncMessage}</Notice>{app.lastSync && <Text style={s.muted}>Last sync: {dateLabel(app.lastSync)}</Text>}<Button title="Sync Now" icon={RefreshCw} busy={app.syncing} onPress={() => void app.sync()} /><Button title="Disconnect Backup" secondary disabled={app.syncing} onPress={() => { setError(''); void app.disconnect().catch(e => setError(e.message)); }} /><Text style={s.muted}>Disconnecting keeps your local notes. Reconnect using the same staff account to resume backup.</Text></> : API_URL ? <><Text style={s.muted}>Sign in with your restaurant staff account to back up your notes and access them on another device. Your existing local notes will join this account.</Text><Field label="Staff Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@restaurant.com" /><Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" placeholder="Your staff password" /><Button title="Connect Staff Account" busy={busy} disabled={!email.trim() || !password} onPress={() => void connect()} />{Platform.OS === 'web' && <Text style={s.muted}>For privacy, sign in again after refreshing this browser preview.</Text>}</> : <Notice>This is a device-only notebook. Cloud backup can be enabled when your restaurant’s server is connected. Keep this app’s data to retain your notes.</Notice>}
      <Notice danger>{error}</Notice>
    </View>
    <Notice>Notes are reminders. Saving or marking a note does not update inventory, record a payment, or post an accounting entry.</Notice>
    <Text style={[s.muted, { textAlign: 'center', fontSize: 11 }]}>Dune &amp; Grills Notebook · Version 1.0.0</Text>
  </Screen>;
}
