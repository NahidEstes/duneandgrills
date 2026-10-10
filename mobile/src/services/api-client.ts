export class ApiError extends Error {
  constructor(message: string, public status: number, public code: 'http' | 'network' | 'timeout' | 'cancelled' | 'response', public retryAfter?: number) { super(message); }
}
export type RequestOptions = { method?: string; body?: unknown; token?: string | null; signal?: AbortSignal; headers?: Record<string, string> };
export function createApi(baseUrl: string, fetcher: typeof fetch = fetch, timeout = 20000) {
  const base = baseUrl.replace(/\/$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('EXPO_PUBLIC_API_URL must be an HTTP(S) URL ending in /api');
  return async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const controller = new AbortController(); let timedOut = false;
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener('abort', abort);
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
    try {
      const response = await fetcher(base + path, { method: options.method || 'GET', credentials: 'omit', signal: controller.signal,
        headers: { Accept: 'application/json', ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), ...options.headers },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) });
      let value: T & { success?: boolean; message?: string };
      try { value = await response.json(); } catch { throw new ApiError('The server returned an unreadable response. Reconcile any pending order.', response.status, 'response'); }
      if (!response.ok || value.success === false) throw new ApiError(value.message || 'Request failed', response.status, 'http', Number(response.headers.get('retry-after')) || undefined);
      return value;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(timedOut ? 'Request timed out. Its outcome may be unknown.' : options.signal?.aborted ? 'Request cancelled' : 'Cannot reach the restaurant. Check your connection and retry.', 0, timedOut ? 'timeout' : options.signal?.aborted ? 'cancelled' : 'network');
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); }
  };
}
export const invalidSession = (error: unknown) => error instanceof ApiError && error.status === 401;
