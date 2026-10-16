import { useLanguage } from '../i18n/LocaleProvider';
import { Notice } from './ui';
import type { DeliveryDetails } from '../domain/types';
type Coordinate = NonNullable<DeliveryDetails['coordinates']>;
export default function DeliveryMap(_props: { value?: Coordinate; center?: Coordinate; change: (value: Coordinate) => void }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  return <Notice message="Interactive maps are available in the native app. Enter the address and coordinates manually here." />;
}
