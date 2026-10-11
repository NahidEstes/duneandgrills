import type { Customer, Pending, Session, Tracking } from './types';
export type CheckoutDraft = { customer: Customer | null; type: 'delivery' | 'pickup'; notes: string; coupon: string; couponOfferId?: string };
export const emptyCheckoutDraft = (): CheckoutDraft => ({ customer: null, type: 'delivery', notes: '', coupon: '' });
// The durable owner survives credential expiry; an account cart never becomes a guest cart on restart.
export const OWNER_KEY = 'dg.cart.owner.v1';
export const cartKey = (actor: string) => `dg.cart.v1.${actor}`;
export function restoredActor(pending: Pending | null, session: Session | null, savedOwner: string | null) {
  if (pending && session && pending.actor !== session.user._id) throw new Error('Saved order belongs to another account. Sign in to its original account.');
  return pending?.actor || session?.user._id || savedOwner || 'guest';
}
export const guestTrackingOnly = (tracking: Tracking[]) => tracking.filter(t => t.actor === 'guest');
