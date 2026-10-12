export function sharedContentPath(kind, id) {
  if (!['item', 'combo', 'offer'].includes(kind) || typeof id !== 'string' || !/^[A-Za-z0-9-]{1,120}$/.test(id)) return null;
  return `/api/${kind === 'item' ? 'menu' : kind === 'combo' ? 'combos' : 'offers'}/${id}`;
}
export function publicContentAvailable(kind, data, now = Date.now()) {
  if (!data || !data._id) return false;
  if (kind === 'offer') return data.isActive === true && Date.parse(data.startDate) <= now && Date.parse(data.expiresAt) > now && !(data.usageLimit && data.usageCount >= data.usageLimit);
  if (!data.isAvailable) return false;
  return kind !== 'combo' || (data.status === 'published' && Array.isArray(data.items) && data.items.length > 0 && data.items.every(i => i.menuItem?.isAvailable));
}
