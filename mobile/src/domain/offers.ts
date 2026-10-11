import type { Combo, Offer, Product } from './types';
import { money } from './cart';

export function activeOffer(offer: Offer, now = Date.now()) {
  return offer.isActive === true && Date.parse(offer.startDate) <= now && Date.parse(offer.expiresAt) > now &&
    (offer.usageLimit == null || offer.usageCount < offer.usageLimit);
}
export const hasCoupon = (offer: Offer) => !!offer.promoCode?.trim() && Number.isFinite(offer.discountValue) && offer.discountValue > 0;
export const needsMember = (offer: Offer) => hasCoupon(offer) && (offer.membersOnly || (!!offer.minimumTier && offer.minimumTier !== 'Bronze'));
export const offerCombo = (offer: Offer) => offer.orderProductType === 'combo' && offer.orderProduct?.productType === 'combo' ? offer.orderProduct.product as Combo : null;
export function offerMatches(offer: Offer, filter: string) { return filter === 'Combo deals' ? !!offerCombo(offer) : filter === 'Coupons' ? hasCoupon(offer) : true; }
export function comboAvailable(combo: Combo) {
  return combo.productType === 'combo' && combo.isAvailable === true && combo.status === 'published' && Number.isFinite(combo.comboPrice) && combo.comboPrice > 0 &&
    Array.isArray(combo.items) && combo.items.length > 0 && combo.items.every(item => !!item.menuItem && item.menuItem.isAvailable !== false && Number.isInteger(item.quantity) && item.quantity > 0);
}
export function comboSavings(product: Product) {
  const original = product.regularPrice;
  return product.productType === 'combo' && Number.isFinite(original) && original! > product.price ? { original: original!, saved: Number((original! - product.price).toFixed(2)) } : null;
}
export function offerBadge(offer: Offer) {
  return hasCoupon(offer) ? offer.discountType === 'percentage' && offer.discountValue <= 100 ? `${offer.discountValue}% off with code` : `Up to ${money(Math.min(offer.discountValue, offer.maximumDiscount ?? offer.discountValue))} off with code` : offerCombo(offer) ? 'Combo deal' : 'Offer';
}
export function offerDate(date: string) { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date)); }
export function offerTerms(offer: Offer) {
  const terms: string[] = [];
  if (hasCoupon(offer)) {
    if (offer.minimumOrderAmount > 0) terms.push(`Minimum order ${money(offer.minimumOrderAmount)}`);
    if (offer.maximumDiscount != null) terms.push(`Maximum discount ${money(offer.maximumDiscount)}`);
    terms.push(offer.couponScope === 'category' ? `${offer.applicableCategory} items only` : offer.couponScope === 'product' ? `${offer.orderProduct?.product.name || 'Selected product'} only` : 'Eligible order items');
    if (needsMember(offer)) terms.push(offer.minimumTier && offer.minimumTier !== 'Bronze' ? `${offer.minimumTier} members or higher · sign in required` : 'Members only · sign in required');
  }
  return terms.join(' · ');
}
export type OfferDestination = { kind: 'combo'; id: string } | { kind: 'item'; id: string } | { kind: 'menu'; category: string } | { kind: 'offers' } | { kind: 'external'; url: string };
export function offerDestination(offer: Offer): OfferDestination {
  const product = offer.orderProduct;
  if (offer.couponScope === 'category' && offer.applicableCategory) return { kind: 'menu', category: offer.applicableCategory };
  if (product?.product._id) return { kind: product.productType === 'combo' ? 'combo' : 'item', id: product.product._id };
  if (/[\r\n]/.test(offer.ctaLink || '')) return { kind: 'menu', category: 'All' };
  const link = offer.ctaLink?.trim() || '/menu';
  if (link === '/offers') return { kind: 'offers' };
  if (link === '#menu' || link === '/#menu' || link === '/menu') return { kind: 'menu', category: 'All' };
  const combo = /^\/combos\/([A-Za-z0-9-]+)$/.exec(link); if (combo) return { kind: 'combo', id: combo[1] };
  if (/^https?:\/\//i.test(link)) try {
    const url = new URL(link); if (!url.username && !url.password && !/[\r\n]/.test(link)) return { kind: 'external', url: url.href };
  } catch { /* Unsupported CTA falls back to the catalog. */ }
  return { kind: 'menu', category: 'All' };
}
// Offer.offerPrice is editorial metadata, not a source of cart pricing.
export function priceDisclosure(offer: Offer, product?: Product) {
  if (!product) return '';
  if (hasCoupon(offer)) return 'Price before coupon. Discount depends on your eligible cart and is confirmed at checkout.';
  return offer.offerPrice != null && offer.offerPrice !== product.price ? 'The advertised price is not available through checkout. The current catalog price is shown.' : '';
}
