import { useLanguage } from '../../i18n/LocaleProvider';
import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '../../i18n/native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { loadCatalog, loadOrderConfig, loadOffers } from '../../services/api';
import { activeOffer } from '../../domain/offers';
import { useOfferTime } from '../../hooks/useOfferTime';
import { OfferCard, browseOffer } from '../../components/offers';
import { useResource } from '../../hooks/useResource';
import { useActiveOrders } from '../../hooks/useActiveOrders';
import { ActiveOrderCard } from '../../components/active-order';
import { useDeliveryAddress } from '../../hooks/useDeliveryAddress';
import { useApp } from '../../state/AppProvider';
import { useFavorites } from '../../state/FavoritesProvider';
import { palette } from '../../constants/design';
import { AddressCard, CategoryShortcuts, ProductCard, SectionLink, openMenu, useProductAdder } from '../../components/commerce';
import { Button, FoodImage, FulfillmentSelector, Loading, Notice, Screen, SearchField, messageOf, styles } from '../../components/ui';
import { BrandHeader } from '../../components/storefront';

export default function Home() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const app = useApp(); const catalog = useResource(loadCatalog, 'home-catalog'); const config = useResource(loadOrderConfig, 'home-config');
  const active = useActiveOrders();
  const favorites = useFavorites();
  const offers = useResource(loadOffers, 'home-offers', () => true, 60000); const now = useOfferTime(offers.data); const [offerError, setOfferError] = useState('');
  const currentOffers = (offers.data || []).filter(offer => activeOffer(offer, now)).slice(0, 2);
  const { customer } = useDeliveryAddress(); const adder = useProductAdder(); const [query, setQuery] = useState(''); const { fontScale } = useWindowDimensions();
  const available = (catalog.data || []).filter(product => product.isAvailable);
  const featured = available.filter(product => product.isFeatured).sort((a, b) => (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0));
  // No popularity metric is invented: unfeatured catalogs use their original order.
  const picks = (featured.length ? featured : available).slice(0, 4); const hero = picks[0];
  const categories = [...new Set(available.map(product => product.category).filter(Boolean))];
  return <Screen top refreshing={catalog.loading || active.loading} onRefresh={() => { void catalog.refresh(); void config.refresh(); void offers.refresh(); void active.refresh(); }}>
    <BrandHeader />
    <FulfillmentSelector value={app.checkoutDraft.type} change={type => app.setCheckoutDraft(d => ({ ...d, type }))} disabled={!!app.pending} available={config.data?.orderTypes.map(type => type.value)} />
    {app.checkoutDraft.type === 'delivery' && <AddressCard compact address={customer.address} disabled={!!app.pending} />}
    <ActiveOrderCard orders={active.orders} guest={active.guest} outdated={active.outdated} refreshing={active.loading} retry={() => void active.refresh()} />
    {app.pending && <Button title="Resolve unresolved order" secondary onPress={() => router.push('/checkout')} />}
    <Text accessibilityRole="header" style={[styles.title, { marginTop: 4, fontSize: 36, lineHeight: 41 }]}>Your next{'\n'}<Text style={{ color: palette.orange }}>favourite</Text> bite.</Text>
    <Text style={[styles.muted, { marginTop: -8 }]}>What are you craving?</Text>
    <SearchField label="Search your favourites" placeholder="Search your favourites" value={query} onChangeText={setQuery} onSubmitEditing={() => openMenu('All', query.trim())} />
    {!!query.trim() && <Button title="Search menu" secondary onPress={() => openMenu('All', query.trim())} />}
    <Notice message={catalog.error} retry={() => void catalog.refresh()} /><Notice message={adder.error} />
    <Notice message={favorites.error} retry={() => void favorites.refresh()} />
    {catalog.loading && !catalog.data && <Loading />}
    {hero && <View style={[styles.card, { padding: 0, borderRadius: 24, overflow: 'hidden' }]}>
      {fontScale > 1.35 ? <FoodImage uri={hero.image} large style={{ height: 240, borderRadius: 0 }} /> : <><FoodImage uri={hero.image} style={[StyleSheet.absoluteFill, { height: '100%', borderRadius: 0 }]} /><LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.94)', 'rgba(0,0,0,0.52)', 'rgba(0,0,0,0.08)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} /></>}
      <View style={{ minHeight: 220, padding: 20, alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}><Text style={[styles.muted, { color: palette.orange, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 }]}>{hero.category.toUpperCase()}</Text><Text style={[styles.title, { fontSize: 29, lineHeight: 34, maxWidth: fontScale > 1.35 ? '100%' : '75%' }]}>Fresh off{'\n'}the grill.</Text><Button title="Explore menu →" label="Explore menu" onPress={() => openMenu()} /></View>
    </View>}
    {!!categories.length && <CategoryShortcuts categories={categories} />}
    {(!!currentOffers.length || !!offers.error) && <><View style={styles.between}><Text style={styles.heading}>Today’s offers</Text><Button title="See all" secondary onPress={() => router.push('/(tabs)/offers')} /></View><Notice message={offers.error} retry={() => void offers.refresh()} /><Notice message={offerError} />{currentOffers.map(offer => <OfferCard key={offer._id} offer={offer} disabled={!!app.pending || app.busy} onBrowse={item => { setOfferError(''); void browseOffer(item).catch(e => setOfferError(messageOf(e))); }} />)}</>}
    {!!picks.length && <><SectionLink title="Popular picks" onPress={() => openMenu()} />{!featured.length && <Text style={styles.muted}>Explore a selection from our menu.</Text>}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{picks.map(product => <View key={`${product.productType}:${product._id}`} style={{ width: fontScale > 1.35 ? '100%' : '46%', flexGrow: picks.length > 1 ? 1 : 0 }}><ProductCard product={product} grid add={p => void adder.add(p)} disabled={adder.disabled} /></View>)}</View></>}
    {catalog.data && !available.length && <View style={styles.card}><Text style={styles.heading}>The kitchen is getting ready</Text><Text style={styles.muted}>Check back for available dishes.</Text><Button title="Explore menu" onPress={() => openMenu()} /></View>}
  </Screen>;
}
