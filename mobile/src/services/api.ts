import { createApi } from './api-client';
import type { Product, OrderConfig } from '../domain/types';
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://duneandgrills-testing-six.vercel.app/api';
export function apiFor(base: string) {
  if (process.env.EXPO_PUBLIC_APP_ENV && process.env.EXPO_PUBLIC_APP_ENV !== 'development' && !base.startsWith('https://')) throw new Error('This saved order requires its original app environment. Keep it saved and contact the restaurant for help.');
  return createApi(base);
}
export const api = apiFor(API_URL);
export type RestaurantInfo = { receipt?: { restaurantName?: string; phone?: string }; location?: { city?: string; address?: string; phone?: string; whatsapp?: string } };
export async function loadRestaurant(signal?: AbortSignal) { return (await api<{ data: RestaurantInfo }>('/settings/public', { signal })).data; }
export async function loadOrderConfig(signal?: AbortSignal) { return (await api<{ data: OrderConfig }>('/orders/config', { signal })).data; }
export const imageUrl = (value: string) => {
  if (!value) return undefined;
  try {
    const url = new URL(value, API_URL.replace(/\/api\/?$/, '/'));
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (process.env.EXPO_PUBLIC_APP_ENV && process.env.EXPO_PUBLIC_APP_ENV !== 'development' && url.protocol !== 'https:')) return undefined;
    return url.toString();
  } catch { return undefined; }
};
export async function loadCatalog(signal?: AbortSignal): Promise<Product[]> {
  const [menu, combos] = await Promise.all([
    api<{ data: Omit<Product, 'productType'>[] }>('/menu', { signal }),
    api<{ data: Omit<Product, 'productType'>[] }>('/combos', { signal }),
  ]);
  return [...menu.data.map(p => ({ ...p, productType: 'menuItem' as const })), ...combos.data.map(p => ({ ...p, productType: 'combo' as const }))];
}
