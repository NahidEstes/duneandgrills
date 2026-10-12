import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useFavorites } from '../state/FavoritesProvider';
import { useApp } from '../state/AppProvider';
import { ProductCard, useProductAdder } from '../components/commerce';
import { Button, ListScreen, Loading, Notice, Screen, styles } from '../components/ui';
export default function Favorites() {
  const app = useApp(); const favorites = useFavorites(); const { refresh } = favorites; const adder = useProductAdder();
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  if (!app.session) return <Screen><Text style={styles.title}>Favourite foods</Text><Text style={styles.text}>Sign in to see your saved foods.</Text><Button title="Sign in" onPress={() => router.push('/auth')} /></Screen>;
  return <ListScreen data={favorites.items} renderItem={({ item }) => <ProductCard product={item} add={p => void adder.add(p)} disabled={adder.disabled} />} keyExtractor={p => p._id} refreshing={favorites.loading} onRefresh={() => void favorites.refresh()}>
    <Text accessibilityRole="header" style={styles.title}>Favourite foods</Text><Text style={styles.muted}>Current menu prices. Unavailable favourites may be hidden by the restaurant; they remain saved in your account.</Text>
    <Notice message={favorites.error} retry={() => void favorites.refresh()} /><Notice message={adder.error} />
    {favorites.loading && !favorites.items.length && <Loading />}{!favorites.loading && !favorites.error && !favorites.items.length && <View style={styles.card}><Text style={styles.heading}>No available favourite foods</Text><Text style={styles.muted}>Save foods with the heart in Home or Menu.</Text><Button title="Explore menu" onPress={() => router.navigate('/(tabs)')} /></View>}
  </ListScreen>;
}
