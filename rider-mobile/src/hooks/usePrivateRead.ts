import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useRider } from '../state/RiderProvider';
import { ApiError } from '../services/api';
export function usePrivateRead<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const { session, version, expire } = useRider();
  const scope = `${session?.user._id}:${session?.token}:${key}`;
  const [state, setState] = useState<{ scope: string; data?: T; error: string; loading: boolean; at?: string }>({ scope, loading: true, error: '' });
  const [focused, setFocused] = useState(false), [active, setActive] = useState(AppState.currentState !== 'background');
  const loader = useRef(load), sequence = useRef(0), controller = useRef<AbortController | null>(null);
  loader.current = load;
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => { const sub = AppState.addEventListener('change', s => setActive(s === 'active')); return () => sub.remove(); }, []);
  const refresh = useCallback(async () => {
    if (!session || !active || !focused) return;
    const seq = ++sequence.current;
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setState(s => ({ scope, data: s.scope === scope ? s.data : undefined, at: s.scope === scope ? s.at : undefined, loading: true, error: '' }));
    try {
      const data = await loader.current(current.signal);
      if (seq === sequence.current && !current.signal.aborted) setState({ scope, data, loading: false, error: '', at: new Date().toISOString() });
    } catch (e) {
      if (seq !== sequence.current || current.signal.aborted) return;
      if (e instanceof ApiError && e.status === 401) { expire(); return; }
      setState(s => ({ ...s, loading: false, data: e instanceof ApiError && [403, 404].includes(e.status) ? undefined : s.data, error: e instanceof Error ? e.message : 'Unable to refresh.' }));
    }
  }, [session, scope, active, focused, expire]);
  useEffect(() => {
    if (!focused || !active) return;
    void refresh(); const timer = setInterval(() => void refresh(), 30000);
    return () => { clearInterval(timer); controller.current?.abort(); };
  }, [refresh, version, focused, active]);
  return { ...(state.scope === scope ? state : { data: undefined, loading: true, error: '', at: undefined }), refresh, active };
}
