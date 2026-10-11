import { OWNER_KEY, cartKey, guestTrackingOnly } from '../domain/customer-state';
import type { Pending, Session, Tracking } from '../domain/types';
import type { Vault } from './order-request';
export type CartStore = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void>; removeItem: (key: string) => Promise<void> };
export async function expireCredential(vault: Vault, carts: CartStore, actor: string) {
  await carts.setItem(OWNER_KEY, actor);
  await vault.remove('session');
}
export async function storeCustomer(vault: Vault, carts: CartStore, actor: string, session: Session, tracking: Tracking[]) {
  const pending = await vault.read<Pending>('pending');
  if (pending && pending.actor !== session.user._id) throw new Error('Resolve the saved order with its original account before switching accounts.');
  const changed = actor !== session.user._id;
  const retained = changed ? guestTrackingOnly(tracking) : tracking;
  if (changed && !pending) {
    await carts.removeItem(cartKey(actor)); await carts.removeItem(cartKey(session.user._id));
    await vault.write('tracking', retained);
  }
  await carts.setItem(OWNER_KEY, session.user._id);
  // Persist the credential last. An incomplete transition cannot expose a new identity.
  await vault.write('session', session);
  return { changed, tracking: retained };
}
export async function forgetCustomer(vault: Vault, carts: CartStore, actor: string, tracking: Tracking[]) {
  if (await vault.read('pending')) throw new Error('Resolve the saved order before logging out.');
  await vault.remove('session'); await carts.removeItem(cartKey(actor));
  const retained = guestTrackingOnly(tracking);
  await vault.write('tracking', retained); await carts.setItem(OWNER_KEY, 'guest');
  return retained;
}
