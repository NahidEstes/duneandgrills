import { createApi } from './api-client';
import type { Product } from '../domain/types';
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://duneandgrills-testing-six.vercel.app/api';
export const api = createApi(API_URL);
export const imageUrl = (value: string) => /^https?:\/\//.test(value) ? value : value ? new URL(value, API_URL.replace(/\/api\/?$/, '/')).toString() : undefined;
export async function loadCatalog(signal?: AbortSignal): Promise<Product[]> {
  const [menu, combos] = await Promise.all([
    api<{ data: Omit<Product, 'productType'>[] }>('/menu', { signal }),
    api<{ data: Omit<Product, 'productType'>[] }>('/combos', { signal }),
  ]);
  return [...menu.data.map(p => ({ ...p, productType: 'menuItem' as const })), ...combos.data.map(p => ({ ...p, productType: 'combo' as const }))];
}
