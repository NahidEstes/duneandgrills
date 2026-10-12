import { useRef, useState } from 'react';
import { View } from 'react-native';
import { sharePublic } from '../services/sharing';
import type { PublicKind } from '../domain/public-links';
import { Share2 } from './icons';
import { IconButton, Notice, messageOf } from './ui';
export function ShareButton({ kind, id, title, description }: { kind: PublicKind; id: string; title: string; description?: string }) {
  const gate = useRef(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const share = async () => { if (gate.current) return; gate.current = true; setBusy(true); setError(''); try { await sharePublic(kind, id, title, description); } catch (e) { setError(messageOf(e)); } finally { gate.current = false; setBusy(false); } };
  return <View><IconButton icon={Share2} label={`Share ${title}`} disabled={busy} onPress={() => void share()} /><Notice message={error} /></View>;
}
