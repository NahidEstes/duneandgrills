import { useLanguage } from '../../i18n/LocaleProvider';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Text } from '../../i18n/native';
import { useLocalSearchParams } from 'expo-router';
import { loadCatalog, loadRestaurant } from '../../services/api';
import { useResource } from '../../hooks/useResource';
import { useFavorites } from '../../state/FavoritesProvider';
import { CartBar, CategoryChips, ProductCard, useProductAdder } from '../../components/commerce';
import { ListScreen, Loading, Notice, SearchField, styles } from '../../components/ui';
import { BrandHeader } from '../../components/storefront';
export default function Menu() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const params = useLocalSearchParams<{ q?: string; category?: string; filter?: string }>();
  return <MenuContents key={JSON.stringify([params.q, params.category, params.filter])} query={params.q || ''} category={params.category || 'All'} />;
}
function MenuContents({ query: initialQuery, category: initialCategory }: { query: string; category: string }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const { data, error, loading, refresh } = useResource(loadCatalog, 'catalog');
  const favorites = useFavorites();
  const restaurant = useResource(loadRestaurant, 'restaurant'); const adder = useProductAdder();
  const [query, setQuery] = useState(initialQuery); const [category, setCategory] = useState(initialCategory);
  const { fontScale } = useWindowDimensions(); const columns = fontScale > 1.35 ? 1 : 2;
  const categories = ['All', ...new Set((data || []).map(product => product.category).filter(Boolean))];
  const visible = (data || []).filter(product => (category === 'All' || product.category === category) && `${product.name} ${product.description}`.toLowerCase().includes(query.toLowerCase()));
  const subtitle = [restaurant.data?.receipt?.restaurantName || 'Dune & Grills', restaurant.data?.location?.city].filter(Boolean).join('  ·  ');
  return <ListScreen columns={columns} data={visible} keyExtractor={product => `${product.productType}:${product._id}`} refreshing={loading} onRefresh={() => { void refresh(); void restaurant.refresh(); }} footer={<CartBar />} renderItem={({ item }) => <View style={{ width: columns === 2 ? '48%' : '100%' }}><ProductCard product={item} grid add={product => void adder.add(product)} disabled={adder.disabled} /></View>}>
    <BrandHeader />
    <View style={{ gap: 4 }}><Text accessibilityRole="header" style={styles.title}>Explore the menu</Text><Text style={styles.muted}>{subtitle}</Text></View>
    <SearchField label="Search the menu" placeholder="Search for dishes…" value={query} onChangeText={setQuery} />
    <CategoryChips categories={categories} selected={category} change={setCategory} />
    <Notice message={error} retry={() => void refresh()} /><Notice message={adder.error} />
    <Notice message={favorites.error} retry={() => void favorites.refresh()} />
    {loading && !data && <Loading />}{data && !visible.length && <View style={styles.card}><Text style={styles.text}>No dishes match your search.</Text></View>}
  </ListScreen>;
}
