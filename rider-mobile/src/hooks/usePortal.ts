import { useRider } from '../state/RiderProvider';
import { DEMO, portal } from '../services/api';
import { demoPortal } from '../services/demo';
import type { Filters } from '../domain/types';
import { usePrivateRead } from './usePrivateRead';
export function usePortal(filters: Filters = {}) {
  const { session } = useRider();
  return usePrivateRead('portal:' + JSON.stringify(filters), signal => DEMO ? Promise.resolve(demoPortal(filters)) : portal(session!.token, session!.user._id, filters, signal));
}
