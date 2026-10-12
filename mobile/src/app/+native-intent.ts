import { publicIntent, TEST_WEBSITE } from '../domain/public-links';
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return publicIntent(path, process.env.EXPO_PUBLIC_WEBSITE_URL || TEST_WEBSITE);
}
