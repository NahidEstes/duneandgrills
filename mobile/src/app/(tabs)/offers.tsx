import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../../state/AppProvider';
import { useResource } from '../../hooks/useResource';
import { useOfferTime } from '../../hooks/useOfferTime';
import { loadOffers } from '../../services/api';
import { activeOffer, offerMatches } from '../../domain/offers';
import { ArrowLeft } from '../../components/icons';
import { ProfileBrand } from '../../components/profile-ui';
import { CategoryChips } from '../../components/commerce';
import { OfferCard, browseOffer } from '../../components/offers';
import { Button, IconButton, ListScreen, Loading, Notice, messageOf, styles } from '../../components/ui';

export default function Offers() {
  const app = useApp(); const resource = useResource(loadOffers, 'offers', () => true, 60000); const now = useOfferTime(resource.data);
  const [filter, setFilter] = useState('All offers'); const [error, setError] = useState('');
  const visible = (resource.data || []).filter(offer => activeOffer(offer, now) && offerMatches(offer, filter));
  const browse = (offer: (typeof visible)[number]) => { setError(''); void browseOffer(offer).catch(e => setError(messageOf(e))); };
  return <ListScreen data={visible} keyExtractor={offer => offer._id} refreshing={resource.loading} onRefresh={() => void resource.refresh()} footer={<Text style={[styles.muted, { textAlign: 'center', padding: 12 }]}>Discounts are confirmed at checkout.</Text>} renderItem={({ item }) => <OfferCard offer={item} onBrowse={browse} disabled={!!app.pending || app.busy} />}>
    <View style={styles.row}><IconButton icon={ArrowLeft} label="Back to Home" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/home')} /><ProfileBrand /></View>
    <View style={{ gap: 4 }}><Text accessibilityRole="header" style={styles.title}>Today’s offers</Text><Text style={styles.text}>Your favourites. Better deals.</Text></View>
    <CategoryChips categories={['All offers', 'Combo deals', 'Coupons']} selected={filter} change={setFilter} />
    <Notice message={resource.error} retry={() => void resource.refresh()} /><Notice message={error} />{resource.loading && !resource.data && <Loading />}
    {resource.data && !visible.length && <View style={styles.card}><Text style={styles.heading}>No current offers</Text><Text style={styles.muted}>Check back for more deals, or explore the menu.</Text><Button title="Explore menu" secondary onPress={() => router.navigate('/(tabs)')} /></View>}
  </ListScreen>;
}
