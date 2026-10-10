import type { OrderPayload, OrderResult, Pending, Tracking } from '../domain/types';
export type Vault = { read: <T>(key: string) => Promise<T | null>; write: (key: string, value: unknown) => Promise<void>; remove: (key: string) => Promise<void> };
const byteLength = (text: string) => {
  let count = 0;
  for (const character of text) { const code = character.codePointAt(0)!; count += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4; }
  return count;
};
export function trackingFor(result: OrderResult, saved: Pending): Tracking {
  const order = result.data;
  if (!order?.orderNumber || !result.trackingToken) throw new Error('Order confirmation lacks tracking credentials. Reconcile to recover them.');
  // Keep a bounded confirmation summary. Full items/notes are fetched privately
  // on opening; large historical images/add-ons cannot exhaust the secure vault.
  return { orderNumber: order.orderNumber, token: result.trackingToken, actor: saved.actor, baseUrl: saved.baseUrl,
    order: { _id: order._id, orderNumber: order.orderNumber, totalAmount: order.totalAmount, subtotal: order.subtotal,
      deliveryFee: order.deliveryFee, discountAmount: order.discountAmount, status: order.status, paymentStatus: order.paymentStatus,
      fulfillmentType: order.fulfillmentType, createdAt: order.createdAt, estimatedPreparationMinutes: order.estimatedPreparationMinutes, items: [] } };
}
// A single gate is shared by creation, retry, and reconciliation. Nothing is
// submitted until durable storage acknowledges the exact immutable request.
export class OrderRequests {
  busy = false;
  constructor(private vault: Vault, private keygen: () => string,
    private send: (pending: Pending, cancel: boolean) => Promise<OrderResult>,
    private confirm: (result: OrderResult, pending: Pending) => Promise<void>) {}
  read() { return this.vault.read<Pending>('pending'); }
  async run(action: 'create' | 'retry' | 'reconcile', actor: string, payload?: OrderPayload, token: string | null = null, baseUrl = '') {
    if (this.busy) throw new Error('An order request is already in progress');
    this.busy = true;
    try {
      let pending = await this.read();
      if (pending && pending.actor !== actor) throw new Error('Sign in to the original account to resolve this order');
      if (action === 'create') {
        if (pending) throw new Error('Resolve your previous request before submitting another order');
        if (!payload) throw new Error('Missing order');
        pending = JSON.parse(JSON.stringify({ version: 1, actor, token, baseUrl, payload: { ...payload, idempotencyKey: this.keygen() }, createdAt: new Date().toISOString() })) as Pending;
        if (byteLength(JSON.stringify(pending.payload)) > 90000) throw new Error('This order is too large. Reduce product selections or notes before submitting.');
        await this.vault.write('pending', pending);
      }
      if (!pending) throw new Error('No unresolved request exists');
      // Identity is fixed. A freshly validated token for that same actor may
      // replace an expired token for transport without changing the payload.
      const result = await this.send({ ...pending, token: actor === 'guest' ? null : token || pending.token }, action === 'reconcile');
      if (result.data) {
        await this.confirm(result, pending); // Tracking + cart saved before request deletion.
        await this.vault.remove('pending');
      } else if (action === 'reconcile' && result.cancelled === true) await this.vault.remove('pending');
      else throw new Error('Server outcome is unconfirmed. Keep this saved request and reconcile.');
      return result;
    } finally { this.busy = false; }
  }
}
