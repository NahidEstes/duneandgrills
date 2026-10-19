import type { RemoteNote, Session } from '../domain/notebook';
// Expo inlines this public setting. There is deliberately no inherited or
// default restaurant server: an unconfigured notebook stays device-only.
export const API_URL: string = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(message: string, public status = 0, public serverNote?: RemoteNote) { super(message); }
}
export async function request<T>(path: string, token?: string, body?: unknown, method = 'GET'): Promise<T> {
  if (!API_URL) throw new ApiError('Cloud sync is not configured. Your notes are saved on this device.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(API_URL + '/notebook' + path, { method, credentials: 'omit', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) throw new ApiError(data?.message || 'Sync is unavailable. Your notes remain on this device.', response.status, data?.serverNote);
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Offline or server unavailable. Your notes are saved on this device.');
  } finally { clearTimeout(timer); }
}
export async function login(email: string, password: string): Promise<Session> {
  const result = await request<Omit<Session, 'origin'>>('/login', undefined, { email: email.trim(), password }, 'POST');
  if (!result.token || !result.user?.id || !['admin', 'manager', 'cashier', 'kitchen', 'inventory', 'storekeeper', 'accountant'].includes(result.user.role) || result.expiresAt <= Date.now()) throw new ApiError('A valid staff account is required.');
  return { ...result, origin: API_URL };
}
