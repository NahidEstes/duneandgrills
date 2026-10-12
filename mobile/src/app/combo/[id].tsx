import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '../../state/AppProvider';
import { ShareButton } from '../../components/share';
import { useResource } from '../../hooks/useResource';
import { useAccountAction } from '../../hooks/useAccountAction';
import { useOfferTime } from '../../hooks/useOfferTime';
import { loadComboContext, type ComboContext } from '../../services/combo-context';
import { activeOffer, comboAvailable, needsMember, hasCoupon, offerBadge, offerCombo, offerDate, offerTerms, priceDisclosure } from '../../domain/offers';
import { emptySelection, lineFor, money } from '../../domain/cart';
import { ComboPrice } from '../../components/offers';
import { ShoppingBag } from '../../components/icons';
import { Button, FoodImage, Loading, Notice, Quantity, Screen, styles } from '../../components/ui';
import { palette } from '../../constants/design';

export default function ComboDetails() {
  const app = useApp(); const { id, offer } = useLocalSearchParams<{ id: string; offer?: string }>();
  return <ComboDetailsContent key={`${id}:${offer || ''}:${app.actor}`} />;
}
function ComboDetailsContent() {
  const { id, offer: offerId, quantity: initialQuantity } = useLocalSearchParams<{ id: string; offer?: string; quantity?: string }>();
  const app = useApp(); const action = useAccountAction();
  const resource = useResource(signal => loadComboContext(id, offerId, signal), `combo:${id}:${offerId || ''}`, () => true, 60000);
  const [fresh, setFresh] = useState<ComboContext | null>(null); const data = fresh || resource.data;
  const now = useOfferTime(data?.offer ? [data.offer] : null); const combo = data?.combo;
  // Match the actual referenced combo, never just a badge or URL query.
  const contextValid = !!data?.offer && activeOffer(data.offer, now) && offerCombo(data.offer)?._id === combo?._id;
  const offer = contextValid ? data!.offer : null;
  const initial = Number(initialQuantity); const [quantity, setQuantity] = useState(Number.isInteger(initial) && initial >= 1 && initial <= 99 ? initial : 1);
  const [acceptedPrice, setAcceptedPrice] = useState<number | null>(null); const [notice, setNotice] = useState(''); const [added, setAdded] = useState(false);
  const unavailableOffer = !!offerId && !!data && !contextValid;
  const available = !!combo && comboAvailable(combo); const memberLogin = !!offer && needsMember(offer) && !app.session;
  const mustAccept = unavailableOffer && acceptedPrice !== combo?.price;
  const disabled = action.busy || app.busy || !!app.pending || !available || !!resource.error || !data || memberLogin || mustAccept;
  const add = () => void action.run(async active => {
    if (disabled || !combo) return;
    setNotice(''); setAdded(false);
    const latest = await loadComboContext(id, offerId); if (!active()) return;
    if (!comboAvailable(latest.combo)) throw new Error('This combo or an included item is no longer available.');
    const valid = !!latest.offer && activeOffer(latest.offer) && offerCombo(latest.offer)?._id === latest.combo._id;
    setFresh(latest);
    if (latest.combo.price !== combo.price) { setAcceptedPrice(null); setNotice('The combo price changed. Review the current total before adding again.'); return; }
    if (offerId && !valid && acceptedPrice !== latest.combo.price) { setNotice('This offer is no longer available. Confirm the current catalog price before continuing.'); return; }
    if (valid && latest.offer && needsMember(latest.offer) && !app.session) throw new Error('Sign in to use this member offer.');
    await app.add(lineFor(latest.combo, emptySelection(), quantity), app.actor); if (!active()) return;
    if (valid && latest.offer && hasCoupon(latest.offer) && !app.pending) app.setCheckoutDraft(d => ({ ...d, coupon: latest.offer!.promoCode, couponOfferId: latest.offer!._id }));
    else if (!valid && app.checkoutDraft.couponOfferId === offerId && !app.pending) app.setCheckoutDraft(d => ({ ...d, coupon: '', couponOfferId: undefined }));
    setNotice(`${quantity} ${quantity === 1 ? 'combo' : 'combos'} added to your cart.`); setAdded(true);
  });
  const viewCart = () => router.push({ pathname: '/(tabs)/cart', params: offer && hasCoupon(offer) ? { offer: offer._id } : {} });
  const footer = combo ? <View style={{ borderTopWidth: 1, borderColor: palette.border, backgroundColor: palette.background, padding: 16, gap: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}><View style={{ flexGrow: 1 }}><Text style={styles.muted}>Total{offer && hasCoupon(offer) ? ' before coupon' : ''}</Text><Text style={styles.heading}>{money(combo.price * quantity)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Add to cart" accessibilityState={{ disabled }} disabled={disabled} onPress={add} style={({ pressed }) => [styles.button, { minWidth: 165, flexGrow: 1, flexDirection: 'row', gap: 10, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}><ShoppingBag size={23} color={palette.onOrange} accessible={false} /><Text style={styles.buttonText}>{action.busy ? 'Checking…' : 'Add to cart'}</Text></Pressable></View> : undefined;
  return <Screen footer={footer} refreshing={resource.loading} onRefresh={() => { setFresh(null); void resource.refresh(); }}>
    <Notice message={action.error || resource.error} retry={resource.error ? () => void resource.refresh() : undefined} />{resource.loading && !combo && <Loading />}
    {combo && <><View style={{ borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: palette.border }}><FoodImage uri={combo.image} style={{ aspectRatio: 1.9, height: undefined }} />{offer && <View style={{ position: 'absolute', top: 12, left: 12, right: 12, alignItems: 'flex-start' }}><Text style={[styles.buttonText, { backgroundColor: palette.orange, borderRadius: 10, padding: 10 }]}>{offerBadge(offer)}</Text></View>}</View>
      <View style={styles.between}><Text accessibilityRole="header" style={[styles.title, { flexShrink: 1 }]}>{combo.name}</Text><ShareButton kind="combo" id={combo._id} title={combo.name} description={combo.description} /></View><Text style={styles.text}>{combo.description}</Text><ComboPrice product={combo} />
      {offer && <><Text style={styles.muted}>Valid until {offerDate(offer.expiresAt)} (Riyadh)</Text>{!!offerTerms(offer) && <Text style={styles.muted}>{offerTerms(offer)}</Text>}{!!priceDisclosure(offer, combo) && <Text style={styles.muted}>{priceDisclosure(offer, combo)}</Text>}</>}
      {!available && <Notice message="This combo or an included item is currently unavailable." />}
      {unavailableOffer && available && <View style={styles.card}><Text style={styles.text}>This offer is no longer available. The combo is still available at its current catalog price.</Text>{mustAccept && <Button title={`Continue at current price · ${money(combo.price)}`} disabled={!!app.pending || action.busy} onPress={() => { setAcceptedPrice(combo.price); setNotice('Current catalog price selected. Add the combo when you are ready.'); }} />}</View>}
      {memberLogin && <Button title="Sign in to use this offer" disabled={!!app.pending || app.busy} onPress={() => router.push({ pathname: '/auth', params: { offer: offer!._id, combo: id, quantity: String(quantity) } })} />}
      <Text style={styles.heading}>What’s included</Text><View style={[styles.card, { gap: 0 }]}>{combo.items.map((item, index) => <View key={item.menuItem?._id || index} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderColor: palette.border }}><FoodImage uri={item.menuItem?.image || ''} style={{ width: 58, height: 58, borderRadius: 10 }} /><View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={[styles.text, { fontWeight: '700' }]}>{item.menuItem?.name || 'Unavailable item'}</Text>{!!item.menuItem?.description && <Text numberOfLines={2} style={styles.muted}>{item.menuItem.description}</Text>}</View><Text style={styles.text}>{item.quantity}×</Text></View>)}</View>
      <View style={styles.between}><Text style={styles.heading}>Quantity</Text><Quantity value={quantity} change={n => { setQuantity(n); setAdded(false); }} disabled={action.busy || !!app.pending} /></View>
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text>}{added && <Button title="View cart" onPress={viewCart} />}
      {app.pending && <><Notice message="Resolve your saved order before changing your cart or coupon." /><Button title="Resolve saved order" secondary onPress={() => router.push('/checkout')} /></>}
    </>}
  </Screen>;
}
