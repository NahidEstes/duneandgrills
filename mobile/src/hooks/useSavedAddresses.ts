import { useApp } from '../state/AppProvider';
import { useResource } from './useResource';
import type { Address } from '../domain/types';

// Both the manager and checkout read the same account-scoped collection.
export function useSavedAddresses() {
  const app = useApp();
  return useResource(async signal => app.session ? (await app.request<{ data: Address[] }>('/profile/addresses', { signal })).data : [], app.session?.user._id || 'guest');
}
