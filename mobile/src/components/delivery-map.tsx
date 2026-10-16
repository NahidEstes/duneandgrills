import { useLanguage } from '../i18n/LocaleProvider';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Notice } from './ui';
import type { DeliveryDetails } from '../domain/types';
import { t } from '../i18n/core';
type Coordinate = NonNullable<DeliveryDetails['coordinates']>;
export default function DeliveryMap({ value, center, change }: { value?: Coordinate; center?: Coordinate; change: (value: Coordinate) => void }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const [ready, setReady] = useState(false); const [failed, setFailed] = useState(false);
  const map = useRef<MapView>(null); const latitude = value?.latitude; const longitude = value?.longitude;
  useEffect(() => { if (ready && latitude != null && longitude != null) map.current?.animateToRegion({ latitude, longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 300); }, [ready, latitude, longitude]);
  useEffect(() => { const timer = setTimeout(() => { if (!ready) setFailed(true); }, 12000); return () => clearTimeout(timer); }, [ready]);
  if (Platform.OS === 'android' && !process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY) return <Notice message="Map is not configured. Enter the address and coordinates manually, or choose pickup." />;
  const initial = value || center;
  return <View style={{ gap: 8 }}>
    {failed && <Notice message="Map could not load. Your address is saved in this form. Enter coordinates manually or try again later." />}
    <MapView ref={map} key={initial ? 'centered' : 'world'} style={{ height: 230, width: '100%', borderRadius: 16 }} initialRegion={{ latitude: initial?.latitude ?? 0, longitude: initial?.longitude ?? 0, latitudeDelta: initial ? 0.03 : 120, longitudeDelta: initial ? 0.03 : 120 }} onMapReady={() => { setReady(true); setFailed(false); }} onPress={event => change(event.nativeEvent.coordinate)} accessibilityLabel={t('Tap map to select delivery pin')}>
      {value && <Marker coordinate={value} draggable onDragEnd={event => change(event.nativeEvent.coordinate)} />}
    </MapView>
  </View>;
}
