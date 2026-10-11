import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '../state/AppProvider';
import { useResource } from './useResource';
import { useAccountAction } from './useAccountAction';
import { useOfferTime } from './useOfferTime';
import { loadCatalog, loadOffer } from '../services/api';
import { activeOffer, hasCoupon, needsMember } from '../domain/offers';
import { orderItems, revalidateCart, subtotal } from '../domain/cart';

export function useCartCoupon() {
  const app = useApp(); const params = useLocalSearchParams<{ offer?: string }>();
  const incoming = typeof params.offer === 'string' ? params.offer : '';
  const id = incoming || app.checkoutDraft.couponOfferId || '';
  const resource = useResource(signal => id ? loadOffer(id, signal) : Promise.resolve(null), `cart-offer:${id}`, () => !!id, 60000);
  const now = useOfferTime(resource.data ? [resource.data] : null);
  const offer = resource.data && activeOffer(resource.data, now) && hasCoupon(resource.data) ? resource.data : null;
  const loginRequired = !app.session && (app.actor !== 'guest' || (!!offer && needsMember(offer)));
  const action = useAccountAction(); const [notice, setNotice] = useState('');
  const [quote, setQuote] = useState<{ fingerprint: string; discount: number } | null>(null);
  const fingerprint = JSON.stringify([app.actor, app.session?.user || null, app.sessionValidated, app.cart, app.checkoutDraft.coupon.trim(), app.checkoutDraft.couponOfferId]);
  const current = useRef(fingerprint); const consumed = useRef(''); const auto = useRef('');
  // Invalidate permanently: returning to an earlier cart/code must not revive
  // its old quote without another server validation.
  if (quote && quote.fingerprint !== fingerprint) setQuote(null);
  useLayoutEffect(() => { current.current = fingerprint; }, [fingerprint]);
  useEffect(() => {
    if (!incoming) { consumed.current = ''; return; }
    if (!offer || loginRequired || app.pending || app.busy || consumed.current === incoming) return;
    consumed.current = incoming; auto.current = incoming;
    app.setCheckoutDraft(d => ({ ...d, coupon: offer.promoCode, couponOfferId: offer._id }));
    router.setParams({ offer: undefined });
  }, [incoming, offer, loginRequired, app]);
  const apply = useCallback(() => action.run(async active => {
    if (!app.checkoutDraft.coupon.trim() || !app.cart.length || app.pending || app.busy || loginRequired) return;
    setQuote(null); setNotice('');
    const catalog = await loadCatalog(); if (!active() || current.current !== fingerprint) return;
    const checked = revalidateCart(app.cart, catalog);
    if (checked.errors.length) throw new Error(`${checked.errors.join('\n')}\nRemove or reselect these items before applying a coupon.`);
    if (checked.changes.length) { await app.setCart(checked.lines, app.actor); if (active()) setNotice('Prices updated. Review your cart and apply the coupon again.'); return; }
    const result = await app.request<{ data: { originalSubtotal: number; discountAmount: number } }>('/offers/validate-coupon', { method: 'POST', body: { code: app.checkoutDraft.coupon.trim(), items: orderItems(checked.lines) } });
    if (!active() || current.current !== fingerprint) return;
    const { originalSubtotal, discountAmount } = result.data;
    if (originalSubtotal !== subtotal(checked.lines)) throw new Error('The restaurant updated prices. Review your cart at checkout.');
    if (!Number.isFinite(discountAmount) || discountAmount <= 0 || discountAmount > originalSubtotal) throw new Error('This coupon cannot be applied to the current cart.');
    setQuote({ fingerprint, discount: discountAmount });
  }), [action, app, fingerprint, loginRequired]);
  useEffect(() => {
    if (!auto.current || app.checkoutDraft.couponOfferId !== auto.current || !app.cart.length || action.busy || app.busy || app.pending) return;
    auto.current = ''; void apply();
  }, [apply, app, action.busy]);
  const applied = quote?.fingerprint === fingerprint && (!id || (!!offer && !resource.error));
  const change = (coupon: string) => { if (!app.pending && !action.busy && !app.busy) { auto.current = ''; setQuote(null); setNotice(''); router.setParams({ offer: undefined }); app.setCheckoutDraft(d => ({ ...d, coupon, couponOfferId: undefined })); } };
  return { offer, loading: !!id && resource.loading, error: action.error || resource.error, notice, busy: action.busy, loginRequired,
    selected: !!id, unavailable: !!id && !!resource.data && !offer, applied, discount: applied ? quote!.discount : 0,
    apply, change, retry: action.error ? apply : resource.refresh,
    signIn: () => router.push({ pathname: '/auth', params: { offer: id } }) };
}
