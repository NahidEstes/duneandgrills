import { Text } from 'react-native';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { loadOffer } from '../../services/api';
import { useResource } from '../../hooks/useResource';
import { useOfferTime } from '../../hooks/useOfferTime';
import { activeOffer } from '../../domain/offers';
import { validPublicId } from '../../domain/public-links';
import { OfferCard, browseOffer } from '../../components/offers';
import { ShareButton } from '../../components/share';
import { useApp } from '../../state/AppProvider';
import { Button, Loading, Notice, Screen, messageOf, styles } from '../../components/ui';
export default function OfferDetails() {
  const app = useApp();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [error, setError] = useState('');
  const resource = useResource(signal => validPublicId(id) ? loadOffer(id, signal) : Promise.reject(new Error('This offer link is invalid.')), `public-offer:${id}`);
  const now = useOfferTime(resource.data ? [resource.data] : null); const offer = resource.data; const available = !!offer && activeOffer(offer, now);
  return <Screen refreshing={resource.loading} onRefresh={() => void resource.refresh()}><Text style={styles.title}>Offer details</Text><Notice message={resource.error} retry={() => void resource.refresh()} /><Notice message={error} />
    {resource.loading && !offer && <Loading />}{available ? <><ShareButton kind="offer" id={offer._id} title={offer.title} /><OfferCard offer={offer} details={false} disabled={app.busy || !!app.pending} onBrowse={item => { setError(''); void browseOffer(item).catch(e => setError(messageOf(e))); }} /></> : !resource.loading && <><Text style={styles.text}>This offer is expired or unavailable. Explore the current menu and offers.</Text><Button title="Today’s offers" onPress={() => router.replace('/(tabs)/offers')} /></>}
  </Screen>;
}
