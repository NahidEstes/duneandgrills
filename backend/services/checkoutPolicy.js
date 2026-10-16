import { OrderEngineError } from '../config/orderContract.js';

// New money/service policies have no enabled defaults. Existing immediate,
// text-address orders continue to use the existing restaurant pricing.
export const checkoutDefaults = () => ({
  points: { enabled: false, pointsPerSAR: null, minimumPoints: null, maximumDiscountSAR: null, stackWithCoupons: false, refundPolicy: null },
  delivery: { enabled: false, latitude: null, longitude: null, radiusKm: null, feeSAR: null },
  scheduling: { enabled: false, openingHoursConfirmed: false, slotMinutes: null, capacity: null, cutoffMinutes: null, horizonDays: null },
});
const fail = (message, status = 400) => { throw new OrderEngineError(message, status); };
export const normalizeCheckoutPolicy = (input = {}, current = checkoutDefaults()) => {
  const result = {};
  for (const group of Object.keys(checkoutDefaults())) {
    const values = { ...checkoutDefaults()[group], ...current[group], ...input[group] };
    result[group] = Object.fromEntries(Object.keys(checkoutDefaults()[group]).map(key => [key, values[key]]));
    for (const key of ['enabled', ...(group === 'points' ? ['stackWithCoupons'] : group === 'scheduling' ? ['openingHoursConfirmed'] : [])]) {
      if (typeof values[key] !== 'boolean') fail(`${group}.${key} must be true or false`);
    }
  }
  const ranges = {
    points: { pointsPerSAR: [1, 1000000], minimumPoints: [1, 100000000], maximumDiscountSAR: [0.01, 100000] },
    delivery: { latitude: [-90, 90], longitude: [-180, 180], radiusKm: [0.01, 500], feeSAR: [0, 10000] },
    scheduling: { slotMinutes: [5, 240], capacity: [1, 10000], cutoffMinutes: [0, 10080], horizonDays: [1, 30] },
  };
  for (const [group, fields] of Object.entries(ranges)) for (const [key, [min, max]] of Object.entries(fields)) {
    const value = result[group][key];
    if (value == null && !result[group].enabled) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || ((group === 'scheduling' || key === 'minimumPoints' || key === 'pointsPerSAR') && !Number.isInteger(value))) fail(`Configure ${group}.${key} between ${min} and ${max}`);
    if (['maximumDiscountSAR', 'feeSAR'].includes(key) && Math.abs(value * 100 - Math.round(value * 100)) > 0.0000001) fail(`${group}.${key} must use at most two decimal places`);
  }
  if (result.points.enabled && result.points.refundPolicy !== 'proportional') fail('Confirm proportional points restoration on refunds before enabling redemption');
  if (result.scheduling.enabled && !result.scheduling.openingHoursConfirmed) fail('Confirm restaurant opening hours before enabling scheduling');
  return result;
};
export const normalizeDeliveryDetails = (value) => {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) fail('Invalid delivery details');
  const details = {};
  for (const key of ['building', 'apartment', 'landmark', 'instructions']) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > 240)) fail('Invalid delivery details');
    details[key] = (value[key] || '').trim();
  }
  if (value.coordinates != null) {
    const { latitude, longitude } = value.coordinates;
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) fail('Invalid delivery coordinates');
    details.coordinates = { latitude, longitude };
  }
  return details;
};
export const deliveryQuote = (settings, type, details) => {
  if (type !== 'delivery') return { fee: 0, mode: 'pickup' };
  const policy = settings.checkout?.delivery;
  if (!policy?.enabled) {
    if (details?.coordinates) fail('Map delivery availability is not configured. Choose pickup or use a manual address', 409);
    return { fee: settings.orders.deliveryFee, mode: 'legacy' };
  }
  if (!details?.coordinates) fail('Select a delivery pin to check service availability', 409);
  const radians = n => n * Math.PI / 180;
  const a = details.coordinates;
  const h = Math.sin(radians(a.latitude - policy.latitude) / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(policy.latitude)) * Math.sin(radians(a.longitude - policy.longitude) / 2) ** 2;
  const km = 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  if (km > policy.radiusKm) fail('This address is outside the delivery area. Choose pickup', 409);
  return { fee: policy.feeSAR, mode: 'area', distanceKm: Number(km.toFixed(3)) };
};
export const pointsQuote = (policy, points, subtotal, hasCoupon) => {
  if (points === undefined || points === 0) return { points: 0, discount: 0 };
  if (!Number.isSafeInteger(points) || points < 1) fail('Enter a whole number of points');
  if (!policy?.enabled) fail('Points redemption is not configured', 409);
  if (hasCoupon && !policy.stackWithCoupons) fail('Points cannot be combined with this coupon', 409);
  if (points < policy.minimumPoints) fail('Points are below the minimum redemption', 409);
  const halala = Math.floor(points * 100 / policy.pointsPerSAR);
  if (halala < 1 || halala > Math.round(subtotal * 100) || halala > Math.round(policy.maximumDiscountSAR * 100)) fail('Points exceed the allowed discount. Review your points selection', 409);
  return { points, discount: halala / 100 };
};

const dayMS = 86400000;
const riyadhDay = date => Math.floor((date.getTime() + 10800000) / dayMS) * dayMS - 10800000;
const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const availableSlotTimes = (settings, now = new Date()) => {
  const policy = settings.checkout?.scheduling;
  if (!policy?.enabled) return [];
  const earliest = now.getTime() + Math.max(policy.cutoffMinutes, settings.preparation.defaultMinutes) * 60000;
  const latest = now.getTime() + policy.horizonDays * dayMS;
  const values = new Set();
  // Include yesterday's overnight period, with the day-of-week of its opening.
  for (let day = riyadhDay(now) - dayMS; day <= latest; day += dayMS) {
    const entry = settings.openingHours.find(row => row.day === weekdays[new Date(day + 10800000).getUTCDay()]);
    if (!entry?.isOpen) continue;
    for (const period of entry.periods) {
      const open = day + minutes(period.open) * 60000;
      const close = day + (minutes(period.close) + (period.close <= period.open ? 1440 : 0)) * 60000;
      for (let slot = open + settings.preparation.defaultMinutes * 60000; slot <= close; slot += policy.slotMinutes * 60000) if (slot >= earliest && slot <= latest) values.add(new Date(slot).toISOString());
    }
  }
  return [...values].sort();
};
export const scheduleQuote = (settings, scheduledAt, now = new Date()) => {
  if (!scheduledAt) return {};
  if (typeof scheduledAt !== 'string' || !settings.checkout?.scheduling?.enabled || !availableSlotTimes(settings, now).includes(scheduledAt)) fail('Scheduled slot is unavailable. Select another time', 409);
  return { scheduledAt: new Date(scheduledAt), kitchenReleaseAt: new Date(new Date(scheduledAt).getTime() - settings.preparation.defaultMinutes * 60000) };
};
