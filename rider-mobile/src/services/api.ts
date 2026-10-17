import Constants from 'expo-constants';
import type { Delivery, Filters, Pending, Portal, Rider, Session } from '../domain/types';
export const API_URL = (Constants.expoConfig?.extra?.apiUrl || 'https://duneandgrills-testing-six.vercel.app/api').replace(/\/$/, '') as string;
export const DEMO = Constants.expoConfig?.extra?.readOnlyDemo === true && Constants.expoConfig?.extra?.appEnvironment === 'development';
export class ApiError extends Error { constructor(message: string, public status = 0) { super(message); } }
export async function request<T>(path: string, token?: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 20_000);
  try {
    const response = await fetch(API_URL + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) throw new ApiError(data?.message || 'The server could not confirm this request.', response.status);
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Connection unavailable. Reconnect and refresh; no actions are queued.');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export async function login(email: string, password: string): Promise<Session> {
  const data = await request<{ user: Rider; token: string; expiresAt: number }>('/auth/mobile/rider/login', undefined, { email: email.trim(), password });
  if (data.user?.role !== 'rider' || !data.user._id || !data.token || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now()) throw new ApiError('A valid active rider account is required.');
  return { ...data, origin: API_URL };
}
export async function portal(token: string, userId: string, filters: Filters, signal?: AbortSignal) {
  const query = new URLSearchParams({ status: filters.status || 'all', history: String(!!filters.history), page: String(filters.page || 1), limit: '20', search: filters.search || '', ...(filters.history ? { datePeriod: filters.datePeriod || 'all', cashStatus: filters.cashStatus || 'all', ...(filters.datePeriod === 'custom' ? { from: filters.from || '', to: filters.to || '' } : {}) } : {}) });
  const data = await request<Portal>(`/rider/portal?${query}`, token, undefined, signal);
  if (data.profile?.id !== userId || data.profile.role !== 'rider' || !['disabled', 'operational'].includes(data.mode) || data.operationalEnabled !== (data.mode === 'operational') || !Array.isArray(data.deliveries) || (data.mode === 'disabled' && data.deliveries.length) || [...data.deliveries, ...(data.pendingCash?.deliveries || [])].some(row => row.synthetic || row.riderId !== userId)) throw new ApiError('Unexpected rider response. Sign in to your private workspace again.');
  return data;
}
export async function detail(token: string, userId: string, id: string, signal?: AbortSignal) {
  const result = await request<{ data: Delivery; mode: string; operationalEnabled: boolean }>(`/rider/workflow/deliveries/${encodeURIComponent(id)}`, token, undefined, signal);
  if (result.mode !== 'operational' || !result.operationalEnabled || result.data?.riderId !== userId || result.data.id !== id || result.data.synthetic) throw new ApiError('This delivery is unavailable for your account.');
  return result.data;
}
export async function sendPending(pending: Pending, session: Session) {
  if (pending.origin !== API_URL || session.origin !== API_URL || pending.userId !== session.user._id) throw new ApiError('Sign in with the original rider account to resolve this action.');
  return request<{ success: boolean }>(pending.action === 'availability' ? '/rider/workflow/availability' : `/rider/workflow/deliveries/${encodeURIComponent(pending.deliveryId!)}/${pending.action}`, session.token, pending.payload);
}
