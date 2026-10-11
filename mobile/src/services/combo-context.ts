import { loadCombo, loadOffer } from './api';
import { ApiError } from './api-client';
import type { Combo, Offer } from '../domain/types';
export type ComboContext = { combo: Combo; offer: Offer | null; offerMissing: boolean };
export async function loadComboContext(id: string, offerId?: string, signal?: AbortSignal): Promise<ComboContext> {
  const [combo, offer] = await Promise.all([loadCombo(id, signal), offerId ? loadOffer(offerId, signal).catch(error => { if (error instanceof ApiError && error.status === 404) return null; throw error; }) : Promise.resolve(null)]);
  return { combo, offer, offerMissing: !!offerId && !offer };
}
