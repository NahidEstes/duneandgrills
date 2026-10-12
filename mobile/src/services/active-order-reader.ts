import type { Order, Tracking } from '../domain/types';
import { activeOrder, newestActiveOrders } from '../domain/orders';
import { ApiError } from './api-client';
import type { RefreshReason } from './resource-controller';

export type ActiveSnapshot = { orders: Order[]; outdated: boolean };
type Reads = { history: (signal: AbortSignal) => Promise<Order[]>; order: (id: string, signal: AbortSignal) => Promise<Order> };
// Saved summaries only discover credential candidates. Home never renders a
// guessed status from a pending submission or an unverified guest summary.
export const guestCandidates = (tracking: Tracking[]) => [...new Map(tracking.filter(t => t.actor === 'guest' && !!t.token?.trim() &&
  !!t.orderNumber && t.order?.orderNumber === t.orderNumber && activeOrder(t.order)).map(t => [t.orderNumber, t])).values()];

export class ActiveOrderReader {
  private known: Order[] = []; private initialized = false;
  constructor(private reads: Reads, private guestIds?: string[]) {}
  async load(signal: AbortSignal, reason: RefreshReason): Promise<ActiveSnapshot> {
    if (!this.guestIds && (!this.initialized || reason !== 'poll')) {
      const history = await this.reads.history(signal);
      if (!signal.aborted) { this.known = newestActiveOrders(history).filter(order => !!order._id); this.initialized = true; }
      return { orders: signal.aborted ? [] : this.known, outdated: false };
    }
    const ids = this.guestIds && (!this.initialized || reason !== 'poll') ? this.guestIds : this.known.map(order => this.guestIds ? order.orderNumber : order._id!);
    const results = await Promise.allSettled(ids.map(id => this.reads.order(id, signal)));
    if (signal.aborted) return { orders: [], outdated: false };
    const retained: Order[] = []; let failure: unknown; let definitive = false;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        definitive = true;
        if ((this.guestIds ? result.value.orderNumber : result.value._id) === ids[i] && activeOrder(result.value)) retained.push(result.value);
        continue;
      }
      const error = result.reason;
      // Inaccessible/revoked orders are removed, including old guest tokens.
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        if (!this.guestIds && error.status === 401) throw error;
        definitive = true;
        continue;
      }
      failure ||= error;
      const last = this.known.find(order => (this.guestIds ? order.orderNumber : order._id) === ids[i]); if (last) retained.push(last);
    }
    this.known = newestActiveOrders(retained); this.initialized = true;
    // Throw only when every read failed transiently. Definitive removals must
    // reach the UI even if another order is offline; otherwise use the existing
    // retry-after/backoff and cached status preservation in ResourceController.
    if (failure && !definitive) throw failure;
    return { orders: this.known, outdated: !!failure };
  }
}
