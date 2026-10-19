import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { acknowledge, mergeRemote, remoteOf, validateDraft, type Binding, type Draft, type Note, type RemoteNote, type Session } from '../domain/notebook';
import { API_URL, ApiError, login, request } from '../services/api';
import { store } from '../services/store';
import { sessionStore } from '../services/session';

const prefix = 'note:';
const Context = createContext<ReturnType<typeof useNotebookState> | null>(null);
function useNotebookState() {
  const [notes, setNotes] = useState<Note[]>([]);
  const rows = useRef<Note[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const auth = useRef<Session | null>(null);
  const binding = useRef<Binding | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('Saved on this device');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const syncLock = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // Serialize only short disk writes, never network waits. Every successful UI
  // save is already durable, including its stable idempotency identifier.
  const serial = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const result = queue.current.then(job);
    queue.current = result.catch(() => {});
    return result;
  }, []);
  const update = useCallback((id: string, change: (old: Note | undefined) => Note | undefined) => serial(async () => {
    const old = rows.current.find(n => n.id === id);
    const next = change(old);
    if (!next) return old;
    if (old && JSON.stringify(old) === JSON.stringify(next)) return old;
    await store.set(prefix + id, JSON.stringify(next));
    rows.current = [...rows.current.filter(n => n.id !== id), next];
    setNotes(rows.current);
    return next;
  }), [serial]);

  const bootstrap = useCallback(async () => {
    try {
      const keys = (await store.keys()).filter(k => k.startsWith(prefix));
      const restored = await Promise.all(keys.map(async key => {
        const value = await store.get(key);
        const n = value ? JSON.parse(value) as Note : null;
        if (!n?.id || typeof n.text !== 'string' || !['pending', 'entered'].includes(n.status)) throw new Error('A saved note could not be read. Keep this app’s data and contact support.');
        return n;
      }));
      rows.current = restored; setNotes(restored);
      const bound = await store.get('binding');
      binding.current = bound ? JSON.parse(bound) : null;
      const saved = await sessionStore.read();
      if (saved && saved.origin === API_URL && binding.current?.origin === API_URL && saved.user.id === binding.current.ownerId) {
        auth.current = saved; setSession(saved);
      }
      setError(''); setReady(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Device storage is unavailable. Retry without clearing app data.'); }
  }, []);
  useEffect(() => {
    const startup = setTimeout(() => { void bootstrap(); }, 0);
    return () => clearTimeout(startup);
  }, [bootstrap]);

  const save = useCallback(async (draft: Draft, id?: string) => {
    const amountMinor = validateDraft(draft);
    const noteId = id || randomUUID();
    await update(noteId, old => {
      if (id && !old) throw new Error('This note could not be found.');
      if (old?.status === 'entered') throw new Error('Entered notes are read-only. Create a new note for a correction.');
      if (old?.conflict) throw new Error('Resolve the sync conflict before editing this note.');
      return { ...old, ...draft, text: draft.text.trim(), title: draft.title.trim(), quantity: draft.quantity.trim(), amountMinor,
        id: noteId, status: 'pending', createdAt: old?.createdAt || new Date().toISOString(), enteredAt: null, enteredBy: '',
        revision: old?.revision || 0, mutationId: randomUUID(), synced: false };
    });
    return noteId;
  }, [update]);
  const markEntered = useCallback(async (id: string) => {
    await update(id, old => {
      if (!old) throw new Error('This note could not be found.');
      if (old.status === 'entered') return undefined;
      if (old.conflict) throw new Error('Resolve the sync conflict before marking this note.');
      return { ...old, status: 'entered', enteredAt: new Date(Math.max(Date.now(), +new Date(old.createdAt))).toISOString(), enteredBy: auth.current?.user.name || 'This device', mutationId: randomUUID(), synced: false };
    });
  }, [update]);

  const sync = useCallback(async () => {
    const signed = auth.current;
    if (!signed || !API_URL || syncLock.current) return;
    if (signed.expiresAt <= Date.now()) { setSyncMessage('Sign in again to resume sync'); return; }
    syncLock.current = true; setSyncing(true);
    try {
      // Retry an unresolved upload verbatim before uploading any later edit.
      // Each snapshot is persisted before sending so app termination is safe.
      for (const id of rows.current.filter(n => !n.synced && !n.conflict).map(n => n.id)) {
        for (let pass = 0; pass < 3; pass++) {
          const prepared = await update(id, old => old && !old.synced && !old.conflict ? { ...old, inFlight: old.inFlight || remoteOf(old) } : undefined);
          if (!prepared || prepared.synced || prepared.conflict || !prepared.inFlight) break;
          const sent = prepared.inFlight;
          try {
            const result = await request<{ note: RemoteNote }>('/notes/' + id, signed.token, { expectedRevision: sent.revision, mutationId: sent.mutationId, note: sent }, 'PUT');
            if (result.note.id !== id || result.note.mutationId !== sent.mutationId) throw new Error('Unexpected sync response. Your local note has been kept.');
            await update(id, old => old ? acknowledge(old, sent, result.note) : undefined);
          } catch (e) {
            if (e instanceof ApiError && e.status === 409 && e.serverNote) {
              const remote = e.serverNote;
              await update(id, old => old ? { ...old, inFlight: undefined, conflict: remote } : undefined);
              break;
            }
            throw e;
          }
        }
      }
      let after: string | null = null;
      do {
        const page: { notes: RemoteNote[]; next: string | null } = await request('/notes' + (after ? '?after=' + encodeURIComponent(after) : ''), signed.token);
        for (const remote of page.notes) await update(remote.id, old => mergeRemote(old, remote));
        after = page.next;
      } while (after);
      const timestamp = new Date().toISOString();
      setLastSync(timestamp);
      setSyncMessage(rows.current.some(n => n.conflict) ? 'Some notes need a sync review' : rows.current.some(n => !n.synced) ? 'Recent changes waiting to sync' : 'All notes synced');
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : 'Sync unavailable. Notes remain on this device.');
      if (e instanceof ApiError && [401, 403].includes(e.status)) {
        await sessionStore.clear(); auth.current = null; setSession(null);
      }
    } finally { syncLock.current = false; setSyncing(false); }
  }, [update]);
  useEffect(() => {
    if (!ready || !session) return;
    const timer = setTimeout(() => { void sync(); }, 1200);
    return () => clearTimeout(timer);
  }, [ready, session, notes, sync]);
  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => { if (AppState.currentState === 'active') void sync(); }, 45000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void sync(); });
    return () => { clearInterval(interval); subscription.remove(); };
  }, [ready, sync]);
  const connect = useCallback(async (email: string, password: string) => {
    if (syncLock.current) throw new Error('Wait for the current sync to finish.');
    const signed = await login(email, password);
    const bound = binding.current;
    if (bound && (bound.ownerId !== signed.user.id || bound.origin !== signed.origin)) throw new Error('This notebook belongs to another account or server. Reconnect with the original staff account.');
    const next = { ownerId: signed.user.id, origin: signed.origin };
    await store.set('binding', JSON.stringify(next)); binding.current = next;
    await sessionStore.write(signed); auth.current = signed; setSession(signed);
  }, []);
  const disconnect = useCallback(async () => {
    if (syncLock.current) throw new Error('Wait for the current sync to finish.');
    await sessionStore.clear(); auth.current = null; setSession(null); setSyncMessage('Saved on this device');
  }, []);
  const resolve = useCallback(async (id: string, choice: 'local' | 'server') => {
    await update(id, old => {
      if (!old?.conflict) return undefined;
      if (choice === 'server') return { ...old.conflict, synced: true };
      if (old.conflict.status === 'entered') throw new Error('The server note is already entered. Keep the server version and create a separate correction note.');
      return { ...old, revision: old.conflict.revision, mutationId: randomUUID(), conflict: undefined, inFlight: undefined, synced: false };
    });
  }, [update]);
  return { notes, ready, error, bootstrap, save, markEntered, session, connect, disconnect, sync, syncing, syncMessage, lastSync, resolve };
}
export function NotebookProvider({ children }: { children: ReactNode }) { const value = useNotebookState(); return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useNotebook() { const value = useContext(Context); if (!value) throw new Error('NotebookProvider is required.'); return value; }
