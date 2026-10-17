import { useLanguage } from '../i18n/LocaleProvider';
import { View } from 'react-native';
import { Pressable, Text } from '../i18n/native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Button, FoodImage, styles } from './ui';
import { palette } from '../constants/design';
import type { Offer, Product } from '../domain/types';
import { comboAvailable, comboSavings, hasCoupon, offerBadge, offerCombo, offerDate, offerDestination, offerTerms, priceDisclosure } from '../domain/offers';
import { money } from '../domain/cart';
import { openMenu } from './commerce';
import { Tag, ChevronRight } from './icons';

export async function browseOffer(offer: Offer) {
  const target = offerDestination(offer);
  if (target.kind === 'combo') router.push({ pathname: '/combo/[id]', params: { id: target.id, offer: offer._id, quantity: String(offer.orderProduct?.quantity || 1) } });
  else if (target.kind === 'item') router.push({ pathname: '/item/[id]', params: { id: target.id, type: 'menuItem' } });
  else if (target.kind === 'offers') router.navigate('/(tabs)/offers');
  else if (target.kind === 'external') await Linking.openURL(target.url);
  else openMenu(target.category);
}
export function ComboPrice({ product }: { product: Product }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const saving = comboSavings(product);
  return <View style={styles.row}>{saving && <Text style={[styles.heading, { color: palette.muted, textDecorationLine: 'line-through' }]}>{money(saving.original)}</Text>}<Text style={[styles.title, { fontSize: 26, color: palette.orange }]}>{money(product.price)}</Text>{saving && <Text style={[styles.muted, { color: palette.orange }]}>Save {money(saving.saved)}</Text>}</View>;
}
export function OfferCard({ offer, onBrowse, disabled = false, details = true }: { offer: Offer; onBrowse: (offer: Offer) => void; disabled?: boolean; details?: boolean }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const combo = offerCombo(offer); const unavailable = !!combo && !comboAvailable(combo); const product = offer.orderProduct?.product;
  if (hasCoupon(offer) && !combo && !product) return <View style={styles.card}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Tag size={30} color={palette.orange} /><View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={[styles.heading, { fontSize: 23 }]}>{offer.title}</Text><Text style={styles.muted}>{offer.subtitle || offer.description}</Text></View></View>
    {!!offerTerms(offer) && <Text style={styles.muted}>{offerTerms(offer)}</Text>}
    <View style={{ borderTopWidth: 1, borderTopColor: palette.border, borderStyle: 'dashed', paddingTop: 14, gap: 12 }}>
      <Text translate={false} selectable style={[styles.heading, { letterSpacing: 3, fontSize: 23 }]}>{offer.promoCode}</Text>
      <Button title="Use coupon" label={`Use offer, ${offer.title}`} secondary disabled={disabled} onPress={() => router.push({ pathname: '/(tabs)/cart', params: { offer: offer._id } })} />
    </View>
    <Text style={[styles.muted, { fontSize: 12 }]}>Valid until {offerDate(offer.expiresAt)} (Riyadh)</Text>
    {details && <Pressable accessibilityRole="button" accessibilityLabel={`Offer details, ${offer.title}`} onPress={() => router.push({ pathname: '/offer/[id]', params: { id: offer._id } })} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={[styles.muted, { color: palette.orange }]}>Offer details</Text><ChevronRight size={18} color={palette.orange} /></Pressable>}
  </View>;
  return <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
    <View><FoodImage uri={offer.image || product?.image || ''} style={{ aspectRatio: 1.9, height: undefined, borderRadius: 0 }} /><View style={{ position: 'absolute', top: 12, left: 12, right: 12, alignItems: 'flex-start' }}><Text style={[styles.buttonText, { backgroundColor: palette.orange, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 }]}>{offerBadge(offer)}</Text></View></View>
    <View style={{ padding: 16, gap: 8 }}><Text style={[styles.heading, { fontSize: 24 }]}>{offer.title}</Text><Text style={styles.muted}>{offer.subtitle || offer.description}</Text>
      {product && <ComboPrice product={product} />}{!!priceDisclosure(offer, product) && <Text style={styles.muted}>{priceDisclosure(offer, product)}</Text>}
      {!!offerTerms(offer) && <Text style={styles.muted}>{offerTerms(offer)}</Text>}<Text style={styles.muted}>Valid until {offerDate(offer.expiresAt)} (Riyadh)</Text>
      {combo && <Button title={unavailable ? 'Combo unavailable' : 'View combo →'} label={`View combo, ${offer.title}`} disabled={unavailable} onPress={() => onBrowse(offer)} />}
      {hasCoupon(offer) ? <View style={[styles.card, { borderStyle: 'dashed', padding: 12 }]}><Text style={[styles.heading, { letterSpacing: 1 }]}>{offer.promoCode}</Text><Button title="Use offer →" label={`Use offer, ${offer.title}`} secondary disabled={disabled} onPress={() => router.push({ pathname: '/(tabs)/cart', params: { offer: offer._id } })} /></View> : !combo && <Button title="View offer →" label={`View offer, ${offer.title}`} onPress={() => onBrowse(offer)} />}
      {details && <Pressable accessibilityRole="button" accessibilityLabel={`Offer details, ${offer.title}`} onPress={() => router.push({ pathname: '/offer/[id]', params: { id: offer._id } })} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={[styles.muted, { color: palette.orange }]}>Offer details</Text><ChevronRight size={18} color={palette.orange} /></Pressable>}
    </View>
  </View>;
}
