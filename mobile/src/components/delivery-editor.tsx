import { locateDelivery } from '../domain/location';
import { useLanguage } from '../i18n/LocaleProvider';
import { useEffect, useRef, useState } from 'react';
import { Text } from '../i18n/native';
import * as Location from 'expo-location';
import { Button, Field, Notice, styles } from './ui';
import DeliveryMap from './delivery-map';
import type { DeliveryDetails } from '../domain/types';
export function DeliveryEditor({ value = {}, center, change }: { value?: DeliveryDetails; center?: DeliveryDetails['coordinates']; change: (value: DeliveryDetails) => void }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const current = useRef(value); const active = useRef(true);
  useEffect(() => { current.current = value; }, [value]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [coordinateDraft, setCoordinateDraft] = useState<{ latitude: string; longitude: string } | null>(null);
  const locate = async () => {
    setBusy(true); setMessage('');
    const result = await locateDelivery({ permission: async () => (await Location.requestForegroundPermissionsAsync()).status, position: async () => (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })).coords });
    if (!active.current) return;
    if (result.coordinates) { change({ ...current.current, coordinates: result.coordinates }); setCoordinateDraft(null); }
    setMessage(result.message || ''); setBusy(false);
  };
  const coordinates = coordinateDraft || { latitude: value.coordinates?.latitude.toString() || '', longitude: value.coordinates?.longitude.toString() || '' };
  const coordinate = (key: 'latitude' | 'longitude', text: string) => {
    const next = { ...coordinates, [key]: text }; setCoordinateDraft(next);
    const latitude = Number(next.latitude); const longitude = Number(next.longitude);
    change({ ...value, coordinates: next.latitude.trim() && next.longitude.trim() && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : undefined });
  };
  return <>
    <Text style={styles.heading}>Delivery location</Text><Notice message={message} />
    <Button title={busy ? 'Locating…' : 'Use my location'} secondary disabled={busy} onPress={() => void locate()} />
    <DeliveryMap value={value.coordinates} center={center} change={coordinates => { setCoordinateDraft(null); change({ ...value, coordinates }); }} />
    <Field label="Latitude" keyboardType="numbers-and-punctuation" value={coordinates.latitude} onChangeText={text => coordinate('latitude', text)} />
    <Field label="Longitude" keyboardType="numbers-and-punctuation" value={coordinates.longitude} onChangeText={text => coordinate('longitude', text)} />
    <Button title="Clear delivery pin" secondary onPress={() => { setCoordinateDraft(null); change({ ...value, coordinates: undefined }); }} />
    {(['building', 'apartment', 'landmark', 'instructions'] as const).map(key => <Field key={key} label={{ building: 'Building', apartment: 'Apartment / floor', landmark: 'Landmark', instructions: 'Delivery instructions' }[key]} maxLength={240} value={value[key] || ''} onChangeText={text => change({ ...value, [key]: text })} />)}
  </>;
}
