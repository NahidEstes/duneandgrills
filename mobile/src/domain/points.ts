// GET /rewards/me: only the customer-facing read model is retained.
// The existing backend returns at most the latest 100 ledger records.
export const POINTS_HISTORY_LIMIT = 100;
export type PointsActivity = { key: string; type: string; points: number; createdAt: string; orderNumber: string; orderId?: string };
export type PointsAccount = { pointsBalance: number; pointsDebt: number; pointsPerSAR?: number; policy: { earnAfter?: string; pointsExpire?: boolean }; history: PointsActivity[] };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const pointsNumber = (value: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 20 }).format(value);
export const signedPoints = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${pointsNumber(Math.abs(value))} points`;
export function pointsDate(value: string) {
  const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date) : 'Date unavailable';
}
export function activityTitle(activity: PointsActivity) {
  if (activity.type === 'REVERSAL') return activity.points > 0 ? 'Points returned' : activity.points < 0 ? 'Points adjusted after a refund' : 'Points adjustment';
  return activity.type === 'EARN' ? 'Points earned' : activity.type === 'REDEEM' ? 'Reward redeemed' : 'Points adjustment';
}
export function earningRules(account: PointsAccount) {
  const rate = account.pointsPerSAR; const rules: string[] = [];
  if (rate === 0) rules.push('Points earning is currently unavailable.');
  else if (account.policy.earnAfter === 'completed_and_paid') rules.push(rate === undefined ? 'Points are earned after your order is completed and paid. The current earning rate is unavailable.' : `Earn ${pointsNumber(rate)} points per eligible SAR 1 after your order is completed and paid.`);
  else rules.push('Current earning rules are unavailable. Please contact the restaurant.');
  // This eligible-amount rule is verified in the existing backend payment service.
  rules.push('Eligible spending excludes delivery fees and takes discounts into account.');
  if (account.policy.pointsExpire === false) rules.push('Accumulated points do not expire.');
  else if (account.policy.pointsExpire === true) rules.push('Points may expire under the restaurant’s current policy.');
  return rules;
}
export function readPointsAccount(value: unknown): PointsAccount {
  const data = record(value); const policy = record(data.policy);
  if (!nonnegative(data.pointsBalance) || !nonnegative(data.pointsDebt) || !Array.isArray(data.history)) throw new Error('Points data could not be read. Please retry.');
  const history = data.history.flatMap((value, index) => {
    const entry = record(value); const order = record(entry.order);
    if (typeof entry.points !== 'number' || !Number.isFinite(entry.points)) return [];
    const createdAt = typeof entry.createdAt === 'string' ? entry.createdAt : '';
    return [{ key: `${index}:${createdAt}`, type: typeof entry.type === 'string' ? entry.type : '', points: entry.points, createdAt,
      orderNumber: typeof order.orderNumber === 'string' ? order.orderNumber.slice(0, 100) : '',
      orderId: typeof order._id === 'string' && /^[a-f\d]{24}$/i.test(order._id) ? order._id : undefined }];
  }).sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)).slice(0, POINTS_HISTORY_LIMIT);
  return { pointsBalance: data.pointsBalance, pointsDebt: data.pointsDebt, pointsPerSAR: nonnegative(data.pointsPerSAR) ? data.pointsPerSAR : undefined,
    policy: { earnAfter: typeof policy.earnAfter === 'string' ? policy.earnAfter : undefined, pointsExpire: typeof policy.pointsExpire === 'boolean' ? policy.pointsExpire : undefined }, history };
}
export const morePointsActivity = (count: number, available: number) => Math.min(count + 10, available);
