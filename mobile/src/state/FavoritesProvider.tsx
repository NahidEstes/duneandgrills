import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useApp } from './AppProvider';
import type { Product } from '../domain/types';
import { messageOf } from '../services/customer-message';
type State = { items: Product[]; loading: boolean; error: string; busy: boolean; refresh: () => Promise<void>; toggle: (product: Product) => Promise<void> };
const Context = createContext<State | null>(null);
export function FavoritesProvider({ children }: React.PropsWithChildren) {
  const { actor, session, sessionValidated, request } = useApp();
  const scope = useMemo(() => ({ actor, session }), [actor, session]); const current = useRef(scope);
  const [state, setState] = useState<{ scope: typeof scope; items: Product[]; loading: boolean; error: string; busy: boolean }>({ scope, items: [], loading: false, error: '', busy: false });
  const flight = useRef<AbortController | null>(null); const gate = useRef(false); const generation = useRef(0);
  useLayoutEffect(() => { current.current = scope; generation.current++; flight.current?.abort(); gate.current = false; }, [scope]);
  const authenticated = !!session && sessionValidated && session.user._id === actor;
  const update = useCallback((value: Partial<State>) => { if (current.current === scope) setState(s => ({ scope, items: [], loading: false, error: '', busy: false, ...(s.scope === scope ? s : {}), ...value })); }, [scope]);
  const refresh = useCallback(async () => {
    if (!authenticated || current.current !== scope) return;
    flight.current?.abort(); const controller = new AbortController(); flight.current = controller; const revision = ++generation.current; update({ loading: true, error: '' });
    try {
      const result = await request<{ data: Product[] }>('/profile/favorites', { signal: controller.signal });
      if (!controller.signal.aborted && current.current === scope && revision === generation.current) update({ items: result.data.filter(p => p.productType === 'menuItem'), loading: false });
    } catch (error) { if (!controller.signal.aborted && current.current === scope && revision === generation.current) update({ loading: false, error: messageOf(error) }); }
  }, [authenticated, scope, request, update]);
  useEffect(() => { void refresh(); return () => { flight.current?.abort(); }; }, [refresh]);
  const items = state.scope === scope && authenticated ? state.items : [];
  const toggle = async (product: Product) => {
    if (!authenticated || gate.current || current.current !== scope || product.productType !== 'menuItem') return;
    const saved = items.some(p => p._id === product._id); gate.current = true; update({ busy: true, error: '' });
    try {
      await request(`/profile/favorites/${encodeURIComponent(product._id)}`, { method: saved ? 'DELETE' : 'POST' });
      if (current.current !== scope) return;
      update({ items: saved ? items.filter(p => p._id !== product._id) : [...items, product] }); await refresh();
    } catch (error) { update({ error: messageOf(error) }); }
    finally { if (current.current === scope) { gate.current = false; update({ busy: false }); } }
  };
  return <Context.Provider value={{ items, loading: state.scope === scope && state.loading, error: state.scope === scope ? state.error : '', busy: state.scope === scope && state.busy, refresh, toggle }}>{children}</Context.Provider>;
}
export function useFavorites() { const value = useContext(Context); if (!value) throw new Error('Missing FavoritesProvider'); return value; }
