import { useState } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { ShoppingBag } from '../../components/icons';
import { LinearGradient } from 'expo-linear-gradient';
import { loadCatalog, loadOrderConfig } from '../../services/api';
import { useResource } from '../../hooks/useResource';
import { useDeliveryAddress } from '../../hooks/useDeliveryAddress';
import { useApp } from '../../state/AppProvider';
import { palette } from '../../constants/design';
import { AddressCard, CategoryShortcuts, ProductCard, SectionLink, openMenu, useProductAdder } from '../../components/commerce';
import { Button, FoodImage, FulfillmentSelector, IconButton, Loading, Notice, Screen, SearchField, styles } from '../../components/ui';

export default function Home() {
  const app = useApp(); const catalog = useResource(loadCatalog, 'home-catalog'); const config = useResource(loadOrderConfig, 'home-config');
  const { customer } = useDeliveryAddress(); const adder = useProductAdder(); const [query, setQuery] = useState(''); const { fontScale } = useWindowDimensions();
  const available = (catalog.data || []).filter(product => product.isAvailable);
  const featured = available.filter(product => product.isFeatured).sort((a, b) => (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0));
  // No popularity metric is invented: unfeatured catalogs use their original order.
  const picks = (featured.length ? featured : available).slice(0, 4); const hero = picks[0];
  const categories = [...new Set(available.map(product => product.category).filter(Boolean))];
  return <Screen top refreshing={catalog.loading} onRefresh={() => { void catalog.refresh(); void config.refresh(); }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Image source={require('../../../assets/images/brand.png')} accessibilityLabel="Dune & Grills logo" style={{ width: 42, height: 42, borderRadius: 12 }} /><Text style={[styles.heading, { fontSize: 24, flex: 1 }]}>Dune & <Text style={{ color: palette.orange }}>Grills</Text></Text><IconButton icon={ShoppingBag} label={`Open cart, ${app.cart.reduce((n, line) => n + line.quantity, 0)} items`} onPress={() => router.push('/(tabs)/cart')} /></View>
    <FulfillmentSelector value={app.checkoutDraft.type} change={type => app.setCheckoutDraft(d => ({ ...d, type }))} disabled={!!app.pending} available={config.data?.orderTypes.map(type => type.value)} />
    {app.checkoutDraft.type === 'delivery' && <AddressCard compact address={customer.address} disabled={!!app.pending} />}
    <Text style={[styles.title, { marginTop: 6 }]}>What are you craving?</Text>
    <SearchField label="Search your favourites" placeholder="Search your favourites" value={query} onChangeText={setQuery} onSubmitEditing={() => openMenu('All', query.trim())} />
    {!!query.trim() && <Button title="Search menu" secondary onPress={() => openMenu('All', query.trim())} />}
    <Notice message={catalog.error} retry={() => void catalog.refresh()} /><Notice message={adder.error} />
    {catalog.loading && !catalog.data && <Loading />}
    {hero && <View style={[styles.card, { padding: 0, borderRadius: 24, overflow: 'hidden' }]}>
      {fontScale > 1.35 ? <FoodImage uri={hero.image} large style={{ height: 240, borderRadius: 0 }} /> : <><FoodImage uri={hero.image} style={[StyleSheet.absoluteFill, { height: '100%', borderRadius: 0 }]} /><LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.94)', 'rgba(0,0,0,0.52)', 'rgba(0,0,0,0.08)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} /></>}
      <View style={{ minHeight: 248, padding: 20, alignItems: 'flex-start', justifyContent: 'space-between', gap: 18 }}><Text style={[styles.muted, { color: palette.orange, fontWeight: '800', letterSpacing: 1 }]}>{hero.category.toUpperCase()}</Text><Text style={[styles.title, { fontSize: 32, maxWidth: fontScale > 1.35 ? '100%' : '72%' }]}>Your next{ '\n' }<Text style={{ color: palette.orange }}>favourite</Text> bite.</Text><Button title="Explore menu →" label="Explore menu" onPress={() => openMenu()} /></View>
    </View>}
    {!!categories.length && <CategoryShortcuts categories={categories} />}
    {!!picks.length && <><SectionLink title="Popular picks" onPress={() => openMenu()} />{!featured.length && <Text style={styles.muted}>Explore a selection from our menu.</Text>}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{picks.map(product => <View key={`${product.productType}:${product._id}`} style={{ width: fontScale > 1.35 ? '100%' : '46%', flexGrow: picks.length > 1 ? 1 : 0 }}><ProductCard product={product} grid add={p => void adder.add(p)} disabled={adder.disabled} /></View>)}</View></>}
    {catalog.data && !available.length && <View style={styles.card}><Text style={styles.heading}>The kitchen is getting ready</Text><Text style={styles.muted}>Check back for available dishes.</Text><Button title="Explore menu" onPress={() => openMenu()} /></View>}
  </Screen>;
}
