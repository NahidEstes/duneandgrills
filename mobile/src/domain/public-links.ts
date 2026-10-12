export const TEST_WEBSITE = 'https://duneandgrills-testing-six.vercel.app';
export const validPublicId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9-]{1,120}$/.test(value);
export type PublicKind = 'item' | 'combo' | 'offer';
export function websiteOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Configure a public HTTPS website origin without credentials, path, query or fragment.');
  return url.origin;
}
export function publicLink(base: string, kind: PublicKind, id: string) {
  if (!validPublicId(id) || !['item', 'combo', 'offer'].includes(kind)) throw new Error('This item cannot be shared.');
  return `${websiteOrigin(base)}/${kind}/${id}`;
}
export function publicIntent(path: string, base: string) {
  try {
    let route: string;
    if (/^https?:/i.test(path)) {
      const url = new URL(path); if (url.origin !== websiteOrigin(base) || url.username || url.password) return '/link-unavailable'; route = url.pathname;
    } else if (/^duneandgrills:/i.test(path)) {
      const url = new URL(path); route = `/${url.hostname}${url.pathname}`;
    } else if (path.startsWith('/') && !path.startsWith('//')) route = path.split(/[?#]/)[0];
    else return '/link-unavailable';
    const match = /^\/(item|combo|offer)\/([^/]+)\/?$/.exec(route);
    if (match) return validPublicId(match[2]) ? `/${match[1]}/${match[2]}` : '/link-unavailable';
    // Preserve existing custom-scheme navigation to app-owned routes.
    if (!/^https?:/i.test(path) && !/^\/(item|combo|offer)(\/|$)/.test(route)) return route;
    return '/link-unavailable';
  } catch { return '/link-unavailable'; }
}
export function shareContent(base: string, kind: PublicKind, id: string, title: string, description = '') {
  const url = publicLink(base, kind, id); const clean = (text: string) => text.replace(/[\r\n\t]+/g, ' ').trim();
  // Offer editorial/discount text is excluded; eligibility is determined at checkout.
  const summary = kind === 'offer' ? '' : clean(description).slice(0, 180);
  return { title: clean(title), message: `${clean(title)}${summary ? '\n' + summary : ''}\n${url}` };
}
