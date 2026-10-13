import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { invalidSession, ApiError } from '../services/api-client';
import { ResourceController, type RefreshReason } from '../services/resource-controller';
import { messageOf } from '../services/customer-message';
type Scope = string | object;
export function useResource<T>(load: (signal: AbortSignal, reason: RefreshReason) => Promise<T>, scope: Scope, poll?: (value: T) => boolean, interval = 120000, pollInitial = true) {
  const [data, setData] = useState<{ scope: Scope; value: T } | null>(null);
  const [error, setError] = useState<{ scope: Scope; value: string; status?: number } | null>(null); const [loading, setLoading] = useState(false);
  const loader = useRef(load); const polling = useRef(poll); const controller = useRef<ResourceController<T> | null>(null);
  useLayoutEffect(() => { loader.current = load; polling.current = poll; }, [load, poll]);
  useFocusEffect(useCallback(() => {
    const owned = new ResourceController<T>((signal, reason) => loader.current(signal, reason), value => { setData({ scope, value }); setError(null); },
      error => { setError({ scope, value: messageOf(error), status: error instanceof ApiError ? error.status : undefined }); if (invalidSession(error) || (error instanceof ApiError && error.status === 403)) setData(null); },
      setLoading, () => polling.current, interval, undefined, pollInitial);
    controller.current = owned;
    if (!AppState.currentState || AppState.currentState === 'active') owned.activate();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') owned.activate(); else owned.deactivate(); });
    return () => { subscription.remove(); owned.deactivate(); if (controller.current === owned) controller.current = null; };
  }, [scope, interval, pollInitial]));
  const refresh = useCallback(async () => { await controller.current?.refresh(); }, []);
  return { data: data?.scope === scope ? data.value : null, loading, error: error?.scope === scope ? error.value : '', errorStatus: error?.scope === scope ? error.status : undefined, refresh };
}
