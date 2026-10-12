import { useMemo } from 'react';
import { useApp } from '../state/AppProvider';
import { API_URL, apiFor } from '../services/api';
import { ActiveOrderReader, guestCandidates } from '../services/active-order-reader';
import { useResource } from './useResource';
import type { Order } from '../domain/types';

export function useActiveOrders(enabled = true) {
  const { actor, session, sessionValidated, request, tracking } = useApp();
  const guest = actor === 'guest' && !session;
  const saved = useMemo(() => guest ? guestCandidates(tracking) : [], [guest, tracking]);
  const reader = useMemo(() => {
    if (!enabled || (!guest && (!session || !sessionValidated || session.user._id !== actor))) return null;
    return new ActiveOrderReader({
      history: async signal => (await request<{ data: Order[] }>('/orders/my', { signal })).data,
      order: async (id, signal) => {
        if (!guest) return (await request<{ data: Order }>(`/orders/${encodeURIComponent(id)}`, { signal })).data;
        const credential = saved.find(t => t.orderNumber === id)!;
        return (await apiFor(credential.baseUrl || API_URL)<{ data: Order }>(`/orders/track/${encodeURIComponent(id)}`, { signal, headers: { 'X-Order-Tracking-Token': credential.token } })).data;
      },
    }, guest ? saved.map(t => t.orderNumber) : undefined);
  }, [enabled, actor, session, sessionValidated, request, guest, saved]);
  // Reader identity isolates account/credential changes without placing tokens
  // in route parameters, scope strings, storage or diagnostic output.
  const scope = reader || `active-disabled:${actor}`;
  const resource = useResource((signal, reason) => reader ? reader.load(signal, reason) : Promise.resolve({ orders: [], outdated: false }), scope,
    snapshot => snapshot.orders.length > 0, guest ? 120000 : 30000, false);
  return { ...resource, orders: resource.data?.orders || [], outdated: !!resource.error || !!resource.data?.outdated, guest };
}
