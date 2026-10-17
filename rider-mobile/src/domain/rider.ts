import type { Action, CashState, Delivery, Pending } from './types';
export const cashLabels: Record<CashState, string> = {
  collection_pending: 'Needs report', awaiting_confirmation: 'Awaiting cashier', discrepancy: 'Discrepancy · Requires review',
  confirmed: 'Cashier confirmed', no_collection: 'No collection needed', unavailable: 'Requires review',
};
export const money = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `SAR ${value.toFixed(2)}` : 'Amount unavailable';
export const halala = (value: number | null | undefined) => Number.isSafeInteger(value) && value! >= 0 ? money(value! / 100) : 'Amount unavailable';
export const stamp = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) + ' · Riyadh' : 'Not recorded';
export function stage(row: Delivery) {
  if (row.deliveryStatus === 'issue') return { text: 'Delivery issue', tone: 'danger' as const };
  if (row.deliveryStatus === 'delivered') return { text: 'Completed', tone: 'success' as const };
  if (!row.canOperate) return { text: 'Requires review', tone: 'danger' as const };
  if (row.deliveryStatus === 'picked_up') return { text: 'On the way', tone: 'blue' as const };
  return row.restaurantStatus === 'ready' ? { text: 'Ready for pickup', tone: 'success' as const } : { text: 'Preparing', tone: 'amber' as const };
}
export function fingerprint(row: Delivery) {
  return JSON.stringify([row.id, row.riderId, row.revision, row.orderRevision, row.canOperate, row.restaurantStatus, row.deliveryStatus, row.paymentStatus, row.cashState, row.customerCollectionHalala, row.cashReport]);
}
export function cashError(amount: string, reason: string, balance: number | null) {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) return 'Enter a non-negative SAR amount with up to two decimals.';
  const value = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(balance) || balance! <= 0 || value > balance!) return 'Amount exceeds the current outstanding balance.';
  if (value < balance! && !reason.trim()) return 'Explain the lower or zero cash collection.';
  if (reason.trim().length > 500) return 'Keep the explanation within 500 characters.';
  return '';
}
export function actionError(row: Delivery, action: Action, userId: string, payload: Record<string, unknown> = {}) {
  if (row.riderId !== userId) return 'This delivery is not assigned to your account.';
  if (!row.canOperate) return row.eligibilityWarning || 'This delivery requires authorized review.';
  if (action === 'pickup') return row.deliveryStatus !== 'assigned' || row.restaurantStatus !== 'ready' ? 'Pickup is available only when the kitchen marks this assigned order Ready.' : '';
  if (action === 'deliver') return row.deliveryStatus !== 'picked_up' || row.restaurantStatus !== 'out-for-delivery' ? 'Only a picked-up order that is out for delivery can be completed.' : '';
  if (action === 'issue') return !['assigned', 'picked_up'].includes(row.deliveryStatus) ? 'Only an active delivery can report an issue.' : !String(payload.reason || '').trim() || String(payload.reason).trim().length > 500 ? 'Enter an issue reason, up to 500 characters.' : '';
  if (action === 'report_cash') return row.deliveryStatus !== 'delivered' || row.cashReport.status !== 'none' || row.cashState !== 'collection_pending' ? 'A cash report is available once after delivery, for a verified outstanding balance.' : cashError(String(payload.amount ?? ''), String(payload.reason ?? ''), row.customerCollectionHalala);
  return 'Action unavailable.';
}
export function phoneHref(value?: string) {
  if (!value || !/^[+\d][\d ()-]{6,24}$/.test(value)) return null;
  const number = value.replace(/[ ()-]/g, '');
  return /^\+?\d{7,15}$/.test(number) ? `tel:${number}` : null;
}
export function mapHref(row: Delivery) {
  if (row.deliveryStatus === 'delivered') return null;
  const c = row.customer?.deliveryDetails?.coordinates;
  const valid = c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && Math.abs(c.latitude) <= 90 && Math.abs(c.longitude) <= 180;
  const query = valid ? `${c.latitude},${c.longitude}` : row.customer?.address?.trim();
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}
export const definiteRejection = (status: number) => [400, 403, 404, 409, 422].includes(status);
export function validatePending(value: unknown, origin: string): Pending | null {
  if (value === null) return null;
  const p = value as Pending;
  if (p?.version !== 1 || p.origin !== origin || typeof p.userId !== 'string' || !['availability', 'pickup', 'deliver', 'issue', 'report_cash'].includes(p.action) || !p.payload || typeof p.payload.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{16,120}$/.test(p.payload.idempotencyKey) || !Number.isSafeInteger(p.payload.expectedRevision) || (p.action !== 'availability' && typeof p.deliveryId !== 'string')) throw new Error('Saved action is invalid or belongs to another server. Keep this app data and contact the restaurant.');
  return p;
}
