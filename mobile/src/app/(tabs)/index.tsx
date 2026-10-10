import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { loadCatalog } from '../../services/api';
import { useResource } from '../../hooks/useResource';
import { money } from '../../domain/cart';
import { Chip, Field, FoodImage, Loading, Notice, Screen, styles } from '../../components/ui';
export default function Menu() {
  const { data, error, loading, refresh } = useResource(loadCatalog, 'catalog');
  const [query, setQuery] = useState(''); const [category, setCategory] = useState('All');
  const categories = ['All', ...new Set((data || []).map(p => p.category))];
  const filtered = (data || []).filter(p => (category === 'All' || p.category === category) && `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()));
  return <Screen refreshing={loading} onRefresh={() => void refresh()}>
    <View style={[styles.row, { flexWrap: 'nowrap' }]}><Image source={require('../../../assets/images/brand.png')} style={{ width: 66, height: 66, borderRadius: 16 }} /><View style={{ flex: 1 }}><Text style={styles.muted}>FRESH FROM THE GRILL</Text><Text style={styles.title}>Good food. Great days.</Text></View></View>
    <Text style={styles.muted}>Your favorites, made your way. Delivery or pickup.</Text>
    <Field label="Search the menu" value={query} onChangeText={setQuery} placeholder="Dishes, drinks, combos…" />
    <View style={styles.row}>{categories.map(c => <Chip key={c} label={c} selected={c === category} onPress={() => setCategory(c)} />)}</View>
    <Notice message={error} retry={() => void refresh()} />{loading && !data && <Loading />}
    {data && !filtered.length && <Text style={styles.text}>No dishes match your search.</Text>}
    {filtered.map(p => <Pressable accessibilityRole="button" accessibilityLabel={`View ${p.name}`} key={`${p.productType}:${p._id}`} onPress={() => router.push({ pathname: '/item/[id]', params: { id: p._id, type: p.productType } })} style={styles.card}>
      <FoodImage uri={p.image} /><View style={styles.between}><Text style={[styles.heading, { flex: 1 }]}>{p.name}</Text><Text style={styles.heading}>{money(p.price)}</Text></View>
      <Text style={styles.muted} numberOfLines={2}>{p.description}</Text><Text style={styles.muted}>{p.isAvailable ? 'View & customize  →' : 'Currently unavailable'}</Text>
    </Pressable>)}
  </Screen>;
}
