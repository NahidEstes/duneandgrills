import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { API_URL, api } from '../services/api';
import { ApiError, createApi, invalidSession, type RequestOptions } from '../services/api-client';
import { vault } from '../services/storage';
import { OrderRequests, trackingFor } from '../services/order-request';
import { validateSessionData } from '../services/session';
import { addLine } from '../domain/cart';
import type { CartLine, OrderPayload, OrderResult, Pending, Session, Tracking, User } from '../domain/types';

type State = {
  ready: boolean; error: string; session: Session | null; sessionValidated: boolean;
  cart: CartLine[]; pending: Pending | null; tracking: Tracking[]; busy: boolean;
  request: <T>(path: string, options?: RequestOptions) => Promise<T>;
  authenticate: (mode: 'login' | 'register', fields: Record<string, string>) => Promise<void>;
  validateSession: () => Promise<void>; logout: () => Promise<void>; updateUser: (user: User) => Promise<void>;
  setCart: (cart: CartLine[]) => Promise<void>; add: (line: CartLine) => Promise<void>;
  submit: (payload: OrderPayload) => Promise<OrderResult>; recover: (cancel: boolean) => Promise<OrderResult>;
  bootstrap: () => Promise<void>;
};
const Context = createContext<State | null>(null);
const cartKey = (actor: string) => `dg.cart.v1.${actor}`;
export function AppProvider({ children }: React.PropsWithChildren) {
  const [ready, setReady] = useState(false); const [error, setError] = useState('');
  const [session, setSession] = useState<Session | null>(null); const [sessionValidated, setValidated] = useState(false);
  const [cart, setCartState] = useState<CartLine[]>([]); const [pending, setPending] = useState<Pending | null>(null);
  const [tracking, setTracking] = useState<Tracking[]>([]); const [busy, setBusy] = useState(false);
  const sessionRef = useRef(session); const cartRef = useRef(cart); const trackingRef = useRef(tracking);
  const actorRef = useRef('guest'); const transition = useRef(false);
  const managerRef = useRef<OrderRequests | null>(null);
  const replaceSession = useCallback((value: Session | null) => { sessionRef.current = value; setSession(value); }, []);
  const replaceCart = useCallback((value: CartLine[]) => { cartRef.current = value; setCartState(value); }, []);
  const validateSession = useCallback(async () => {
    const current = sessionRef.current; if (!current) return;
    try {
      const result = await validateSessionData(current, async () => (await api<{ user: User }>('/auth/me', { token: current.token })).user);
      if (sessionRef.current !== current || transition.current) return;
      transition.current = true;
      try {
        if (!result.session) await vault.remove('session');
        else if (result.validated) await vault.write('session', result.session);
        replaceSession(result.session); setValidated(result.validated); setError(result.error);
      } finally { transition.current = false; }
    } catch (e) {
      if (invalidSession(e)) {
        await vault.remove('session'); replaceSession(null); setValidated(false);
        setError('Your session expired. Sign in again. Any unresolved order remains saved for its original account.');
      } else { setValidated(false); setError(e instanceof Error ? e.message : 'Session verification unavailable'); }
    }
  }, [replaceSession]);
  const bootstrap = useCallback(async () => {
    try {
      const savedPending = await vault.read<Pending>('pending');
      const savedSession = await vault.read<Session>('session');
      const savedTracking = await vault.read<Tracking[]>('tracking') || [];
      if (savedPending && (savedPending.version !== 1 || !savedPending.actor || !savedPending.payload?.idempotencyKey || !savedPending.payload.customer || !Array.isArray(savedPending.payload.items) || !/^https?:\/\//.test(savedPending.baseUrl))) throw new Error('Saved order request is unreadable. Contact support before ordering.');
      if (savedSession && (!savedSession.token || !savedSession.user?._id || savedSession.user.role !== 'customer')) throw new Error('Saved session is unreadable. Contact support before ordering.');
      if (savedPending && savedSession && savedPending.actor !== savedSession.user._id) throw new Error('Saved request and account identities do not match. Contact support before ordering.');
      if (!Array.isArray(savedTracking)) throw new Error('Saved tracking is unreadable. Contact support before ordering.');
      const actor = savedPending?.actor || savedSession?.user._id || 'guest';
      const savedCart = await AsyncStorage.getItem(cartKey(actor));
      const parsed: CartLine[] = savedCart ? JSON.parse(savedCart) : [];
      if (!Array.isArray(parsed) || parsed.some(c => !c.product || !c.selection || !Number.isInteger(c.quantity) || c.quantity < 1 || c.quantity > 99)) throw new Error('Saved cart is unreadable. Recovery is required before ordering.');
      actorRef.current = actor; replaceSession(savedSession); replaceCart(parsed); setPending(savedPending);
      trackingRef.current = savedTracking; setTracking(savedTracking); setError(''); setReady(true);
      await validateSession();
    } catch (e) { setError(e instanceof Error ? e.message : 'Cannot restore saved data'); }
  }, [replaceCart, replaceSession, validateSession]);
  useEffect(() => { void Promise.resolve().then(bootstrap); }, [bootstrap]);
  const setCart = useCallback(async (value: CartLine[]) => {
    if (!ready || transition.current || managerRef.current?.busy) throw new Error('Please wait for the current operation');
    transition.current = true;
    try {
      if (await vault.read('pending')) throw new Error('Resolve the saved order before changing your cart');
      await AsyncStorage.setItem(cartKey(actorRef.current), JSON.stringify(value)); replaceCart(value);
    } finally { transition.current = false; }
  }, [ready, replaceCart]);
  const add = useCallback(async (line: CartLine) => { await setCart(addLine(cartRef.current, line)); }, [setCart]);
  const request = useCallback(async <T,>(path: string, options: RequestOptions = {}) => {
    const current = sessionRef.current;
    try { return await api<T>(path, { ...options, token: current?.token }); }
    catch (e) {
      if (invalidSession(e) && current === sessionRef.current && !transition.current) {
        transition.current = true;
        try {
          await vault.remove('session'); replaceSession(null); setValidated(false);
          setError('Your session expired. Sign in again to continue.');
        } finally { transition.current = false; }
      }
      throw e;
    }
  }, [replaceSession]);
  const authenticate = useCallback(async (mode: 'login' | 'register', fields: Record<string, string>) => {
    if (!ready || transition.current || managerRef.current?.busy) throw new Error('Please wait for the current operation');
    transition.current = true;
    try {
      const unresolved = await vault.read<Pending>('pending');
      if (unresolved?.actor === 'guest') throw new Error('Resolve the guest order before signing in');
      if (unresolved && mode === 'register') throw new Error('Sign in to the account that placed the unresolved order');
      let result: Session;
      try { result = await api<Session>(`/auth/mobile/${mode}`, { method: 'POST', body: fields }); }
      catch (e) { if (e instanceof ApiError && e.status === 404) throw new Error('Mobile authentication is not deployed on this API. Deploy the backend additions or use your local backend.'); throw e; }
      if (!result.token || result.user.role !== 'customer') throw new Error('Deploy the mobile authentication backend before signing in');
      if (unresolved && unresolved.actor !== result.user._id) throw new Error('This request belongs to another account. Sign in to the original account.');
      await vault.write('session', result);
      if (!unresolved && actorRef.current !== result.user._id) {
        await AsyncStorage.removeItem(cartKey(actorRef.current));
        await AsyncStorage.removeItem(cartKey(result.user._id)); replaceCart([]);
      }
      actorRef.current = result.user._id; replaceSession(result); setValidated(true); setError('');
    } finally { transition.current = false; }
  }, [ready, replaceCart, replaceSession]);
  const logout = useCallback(async () => {
    if (!ready || transition.current || managerRef.current?.busy) throw new Error('Please wait for the current operation');
    transition.current = true;
    try {
      if (await vault.read('pending')) throw new Error('Resolve the saved order before logging out');
      // Mobile auth issues no cookies. Forgetting the bearer credential ends
      // this device's session; existing browser logout behavior is unchanged.
      await vault.remove('session'); await AsyncStorage.removeItem(cartKey(actorRef.current));
      actorRef.current = 'guest'; replaceSession(null); replaceCart([]); setValidated(false); setError('');
    } finally { transition.current = false; }
  }, [ready, replaceCart, replaceSession]);
  const updateUser = useCallback(async (user: User) => {
    const current = sessionRef.current; if (!current || user._id !== current.user._id) return;
    if (transition.current) throw new Error('Please wait for the current account operation, then refresh your profile');
    transition.current = true;
    try { const next = { ...current, user }; await vault.write('session', next); replaceSession(next); }
    finally { transition.current = false; }
  }, [replaceSession]);
  useEffect(() => { managerRef.current = new OrderRequests(vault, Crypto.randomUUID,
    async (saved, cancel) => createApi(saved.baseUrl)<OrderResult>(cancel ? '/orders/requests/cancel' : '/orders', {
      method: 'POST', body: saved.payload, token: saved.token, headers: { 'Idempotency-Key': saved.payload.idempotencyKey! },
    }),
    async (result, saved) => {
      const confirmation = trackingFor(result, saved);
      const next = [confirmation, ...trackingRef.current.filter(t => t.orderNumber !== confirmation.orderNumber)].slice(0, 20);
      await vault.write('tracking', next); trackingRef.current = next; setTracking(next);
      await AsyncStorage.setItem(cartKey(saved.actor), '[]'); replaceCart([]);
    });
  }, [replaceCart]);
  const run = async (action: 'create' | 'retry' | 'reconcile', payload?: OrderPayload) => {
    if (!ready || transition.current || managerRef.current?.busy) throw new Error('Saved data is not ready or an operation is in progress');
    const actor = actorRef.current;
    if (actor !== 'guest' && (!sessionRef.current || sessionRef.current.user._id !== actor)) throw new Error('Sign in to the original account before resolving or placing an order');
    setBusy(true);
    try { return await managerRef.current!.run(action, actor, payload, sessionRef.current?.token || null, API_URL); }
    catch (e) { if (invalidSession(e)) await validateSession(); throw e; }
    finally {
      try { setPending(await managerRef.current!.read()); } catch (e) { setReady(false); setError(String(e)); }
      setBusy(false);
    }
  };
  return <Context.Provider value={{ ready, error, session, sessionValidated, cart, pending, tracking, busy, request,
    authenticate, validateSession, logout, updateUser, setCart, add,
    submit: p => run('create', p), recover: cancel => run(cancel ? 'reconcile' : 'retry'), bootstrap }}>{children}</Context.Provider>;
}
export function useApp() { const value = useContext(Context); if (!value) throw new Error('Missing AppProvider'); return value; }
