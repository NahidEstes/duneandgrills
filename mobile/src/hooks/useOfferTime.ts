import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { Offer } from '../domain/types';

export function useOfferTime(offers: Offer[] | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const boundaries = (offers || []).flatMap(offer => [Date.parse(offer.startDate), Date.parse(offer.expiresAt)]).filter(date => date > now);
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1, Math.min(30000, ...boundaries.map(date => date - Date.now() + 1))));
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') setNow(Date.now()); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [offers, now]);
  return now;
}
