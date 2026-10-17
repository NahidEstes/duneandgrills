import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { API_URL, ApiError, DEMO, login, request, sendPending } from '../services/api';
import { demoSession } from '../services/demo';
import { vault } from '../services/vault';
import { validatePending } from '../domain/rider';
import { JOURNAL, prepareAction, settleAction } from '../services/action-journal';
import type { Action, Pending, Rider, Session } from '../domain/types';
const SESSION = 'dg.rider.session.v1';
type State = {
  ready: boolean; session: Session | null; pending: Pending | null; busy: boolean; error: string; version: number;
  bootstrap: () => Promise<void>; signIn: (email: string, password: string) => Promise<void>; signOut: () => Promise<void>; expire: () => void;
  mutate: (action: Action, payload: Pending['payload'], deliveryId?: string, orderNumber?: string) => Promise<void>; retry: () => Promise<void>;
};
const Context = createContext<State | null>(null);
export function RiderProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false), [session, setSession] = useState<Session | null>(null), [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [version, setVersion] = useState(0);
  const sessionRef = useRef<Session | null>(null), pendingRef = useRef<Pending | null>(null), lock = useRef(false);
  const putSession = useCallback((value: Session | null) => { sessionRef.current = value; setSession(value); }, []);
  const putPending = useCallback((value: Pending | null) => { pendingRef.current = value; setPending(value); }, []);
  const expire = useCallback(() => { putSession(null); setError('Your session expired. Sign in again with the original rider account.'); void vault.remove(SESSION).catch(() => {}); }, [putSession]);
  const bootstrap = useCallback(async () => {
    if (lock.current) return;
    lock.current = true; setReady(false); setError('');
    try {
      if (DEMO) { putSession(demoSession); setReady(true); return; }
      const savedPending = validatePending(await vault.read<Pending>(JOURNAL), API_URL); putPending(savedPending);
      const saved = await vault.read<Session>(SESSION);
      if (saved) {
        if (saved.origin !== API_URL || saved.user?.role !== 'rider' || !saved.user._id || !saved.token || (savedPending && savedPending.userId !== saved.user._id)) throw new Error('Saved workspace differs from this app or rider. Keep app data and contact the restaurant.');
        if (saved.expiresAt > Date.now()) {
          try {
            const response = await request<{ user: Rider }>('/auth/me', saved.token);
            if (response.user.role !== 'rider' || response.user._id !== saved.user._id) throw new ApiError('Rider access is unavailable.', 401);
            putSession({ ...saved, user: response.user });
          } catch (e) { if (e instanceof ApiError && e.status === 401) await vault.remove(SESSION); else throw e; }
        } else await vault.remove(SESSION);
      }
      setReady(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to restore your secure workspace.'); }
    finally { lock.current = false; }
  }, [putPending, putSession]);
  useEffect(() => { void Promise.resolve().then(bootstrap); }, [bootstrap]);
  useEffect(() => {
    const check = () => { if (!DEMO && sessionRef.current && sessionRef.current.expiresAt <= Date.now()) expire(); };
    const timer = setInterval(check, 15000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [expire]);
  const signIn = async (email: string, password: string) => {
    if (lock.current || DEMO) return;
    if (Platform.OS === 'web') throw new Error('Staff sign in requires the native Android or iOS app.');
    lock.current = true; setBusy(true); setError('');
    try {
      const next = await login(email, password);
      if (pendingRef.current && pendingRef.current.userId !== next.user._id) throw new Error('An unresolved action belongs to another rider. Sign in with the original rider account.');
      await vault.write(SESSION, next); putSession(next);
    } finally { lock.current = false; setBusy(false); }
  };
  const signOut = async () => {
    if (lock.current || pendingRef.current) throw new Error('Resolve the saved action before signing out.');
    if (DEMO) return;
    await vault.remove(SESSION); putSession(null); setError('');
  };
  const execute = async (saved: Pending, current: Session) => {
    try {
      await settleAction(vault, putPending, () => sendPending(saved, current));
      setVersion(v => v + 1); setError('');
    } catch (e) {
      setVersion(v => v + 1);
      if (e instanceof ApiError && e.status === 401) expire();
      throw e;
    }
  };
  const mutate = async (action: Action, payload: Pending['payload'], deliveryId?: string, orderNumber?: string) => {
    const current = sessionRef.current;
    if (DEMO || !current || current.expiresAt <= Date.now()) throw new Error('Sign in to the native rider app before acting.');
    if (AppState.currentState !== 'active') throw new Error('Return to the app and review the current details.');
    if (lock.current || pendingRef.current) throw new Error('Resolve the saved action before starting another.');
    lock.current = true; setBusy(true);
    try {
      const saved: Pending = { version: 1, userId: current.user._id, origin: API_URL, action, deliveryId, orderNumber, payload: { ...payload, idempotencyKey: Crypto.randomUUID() }, createdAt: new Date().toISOString() };
      await prepareAction(saved, vault, putPending, () => execute(saved, current));
    } finally { lock.current = false; setBusy(false); }
  };
  const retry = async () => {
    const saved = pendingRef.current, current = sessionRef.current;
    if (lock.current || !saved || !current || DEMO) return;
    if (AppState.currentState !== 'active' || current.expiresAt <= Date.now()) throw new Error('Sign in and return to the app before retrying.');
    lock.current = true; setBusy(true);
    try { await execute(saved, current); } finally { lock.current = false; setBusy(false); }
  };
  return <Context.Provider value={{ ready, session, pending, busy, error, version, bootstrap, signIn, signOut, expire, mutate, retry }}>{children}</Context.Provider>;
}
export function useRider() { const state = useContext(Context); if (!state) throw new Error('RiderProvider missing'); return state; }
