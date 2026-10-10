import { ApiError, invalidSession } from './api-client';
import type { Session, User } from '../domain/types';
export async function validateSessionData(saved: Session, check: () => Promise<User>) {
  try {
    const user = await check();
    if (user.role !== 'customer' || user._id !== saved.user._id) throw new ApiError('Customer identity mismatch', 401, 'http');
    return { session: { ...saved, user }, validated: true, error: '' };
  } catch (e) {
    if (invalidSession(e)) return { session: null, validated: false, error: 'Your session expired. Sign in again. Any unresolved order remains saved for its original account.' };
    return { session: saved, validated: false, error: e instanceof Error ? e.message : 'Session verification unavailable' };
  }
}
