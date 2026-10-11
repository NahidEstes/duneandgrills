import { useApp } from '../state/AppProvider';
import { useResource } from './useResource';
import type { Address, Customer } from '../domain/types';

export function useDeliveryAddress() {
  const app = useApp();
  const addresses = useResource(async signal => app.session ? (await app.request<{ data: Address[] }>('/profile/addresses', { signal })).data : [], app.actor);
  const defaultAddress = addresses.data?.find(a => a.isDefault);
  const customer: Customer = app.checkoutDraft.customer || { name: app.session?.user.name || '', phone: defaultAddress?.phone || app.session?.user.phone || '', email: app.session?.user.email || '', address: defaultAddress?.fullAddress || '' };
  return { addresses, customer };
}
