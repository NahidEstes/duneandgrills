import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { ApiError } from '../services/api-client';
import { messageOf } from '../components/ui';
// Non-overlapping GET polling stops on blur/background and backs off on errors.
// Guest tracking's 30/15min budget requires slower polling than a staff queue.
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, scope: string, poll?: (value: T) => boolean, interval = 120000) {
  const [data, setData] = useState<{ scope: string; value: T } | null>(null); const [error, setError] = useState<{ scope: string; value: string } | null>(null); const [loading, setLoading] = useState(false);
  const loader = useRef(load); const polling = useRef(poll);
  useLayoutEffect(() => { loader.current = load; polling.current = poll; }, [load, poll]);
  const forbidden = useRef(false);
  const dataRef = useRef<T | null>(null); const control = useRef<AbortController | null>(null); const failures = useRef(0); const nextAllowed = useRef(0);
  const refresh = useCallback(async () => {
    if (Date.now() < nextAllowed.current || control.current) return;
    const controller = new AbortController(); control.current = controller; setLoading(true);
    try { const value = await loader.current(controller.signal); if (!controller.signal.aborted) { dataRef.current = value; setData({ scope, value }); setError(null); failures.current = 0; forbidden.current = false; } }
    catch (e) { if (!controller.signal.aborted) {
      failures.current += 1; setError({ scope, value: messageOf(e) });
      if (e instanceof ApiError && e.status === 429) nextAllowed.current = Date.now() + (e.retryAfter || 120) * 1000;
      if (e instanceof ApiError && [401, 403].includes(e.status)) { dataRef.current = null; setData(null); forbidden.current = true; }
    } } finally { if (control.current === controller) { control.current = null; setLoading(false); } }
  }, [scope]);
  useLayoutEffect(() => { control.current?.abort(); control.current = null; dataRef.current = null; nextAllowed.current = 0; failures.current = 0; forbidden.current = false; }, [scope]);
  useFocusEffect(useCallback(() => {
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined;
    const cycle = async () => { if (!active || (AppState.currentState && AppState.currentState !== 'active')) return; await refresh(); if (active && !forbidden.current && polling.current && (!dataRef.current || polling.current(dataRef.current))) timer = setTimeout(() => { void cycle(); }, Math.max(interval * Math.min(4, 2 ** failures.current), nextAllowed.current - Date.now())); };
    void cycle();
    const subscription = AppState.addEventListener('change', state => { clearTimeout(timer); if (state === 'active') void cycle(); else { control.current?.abort(); control.current = null; setLoading(false); } });
    return () => { active = false; clearTimeout(timer); subscription.remove(); control.current?.abort(); control.current = null; };
  }, [refresh, interval]));
  return { data: data?.scope === scope ? data.value : null, loading, error: error?.scope === scope ? error.value : '', refresh };
}
