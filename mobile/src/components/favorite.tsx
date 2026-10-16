import { useLanguage } from '../i18n/LocaleProvider';
import { Pressable } from '../i18n/native';
import { router } from 'expo-router';
import { useApp } from '../state/AppProvider';
import { useFavorites } from '../state/FavoritesProvider';
import type { Product } from '../domain/types';
import { Heart } from './icons';
import { palette } from '../constants/design';
export function FavoriteButton({ product }: { product: Product }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const app = useApp(); const favorites = useFavorites(); if (product.productType !== 'menuItem') return null;
  const selected = favorites.items.some(p => p._id === product._id); const disabled = favorites.busy || favorites.loading || (!selected && !product.isAvailable);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${selected ? 'Remove from' : 'Save to'} favourites, ${product.name}`} accessibilityState={{ selected, disabled }} disabled={disabled}
    onPress={() => { if (!app.session || !app.sessionValidated) router.push({ pathname: '/auth', params: { favorite: product._id } }); else void favorites.toggle(product); }}
    style={({ pressed }) => ({ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: palette.surface, opacity: disabled ? 0.45 : pressed ? 0.6 : 1 })}>
    <Heart size={23} color={selected ? palette.orange : palette.text} fill={selected ? palette.orange : 'transparent'} />
  </Pressable>;
}
