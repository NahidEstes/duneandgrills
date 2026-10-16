import { useApp } from '../state/AppProvider';
import { useSavedAddresses } from './useSavedAddresses';
import type { Customer } from '../domain/types';

export function useDeliveryAddress() {
  const app = useApp();
  const addresses = useSavedAddresses();
  const defaultAddress = addresses.data?.find(a => a.isDefault);
  const customer: Customer = app.checkoutDraft.customer || { name: app.session?.user.name || '', phone: defaultAddress?.phone || app.session?.user.phone || '', email: app.session?.user.email || '', address: defaultAddress?.fullAddress || '', deliveryDetails: defaultAddress?.deliveryDetails };
  return { addresses, customer };
}
