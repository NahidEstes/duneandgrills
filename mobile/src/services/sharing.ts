import { Share } from 'react-native';
import { shareContent, TEST_WEBSITE, type PublicKind } from '../domain/public-links';
export const WEBSITE_URL = process.env.EXPO_PUBLIC_WEBSITE_URL || TEST_WEBSITE;
export async function sharePublic(kind: PublicKind, id: string, title: string, description?: string) {
  const result = await Share.share(shareContent(WEBSITE_URL, kind, id, title, description));
  // Android sharedAction means the sheet was opened, not delivery confirmation.
  return result.action === Share.dismissedAction ? 'cancelled' : 'opened';
}
