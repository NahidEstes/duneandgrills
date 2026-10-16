import { useLanguage } from '../i18n/LocaleProvider';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../i18n/native';
import { router } from 'expo-router';
import { useApp } from '../state/AppProvider';
import { api, loadCatalog } from '../services/api';
import { useResource } from '../hooks/useResource';
import { checkoutError, money, orderItems, revalidateCart, subtotal } from '../domain/cart';
import type { Address, Customer, OrderConfig, OrderPayload, OrderResult } from '../domain/types';
import { Button, Chip, Field, FulfillmentSelector, Loading, Notice, Screen, messageOf, styles } from '../components/ui';
import { OrderSummary, PaymentCard } from '../components/commerce';
import { SchedulePicker } from '../components/schedule-picker';
import { DeliveryEditor } from '../components/delivery-editor';
import { useMyPoints } from '../hooks/useMyPoints';
import { catalogText, formatDate, t } from '../i18n/core';
type Review = { fingerprint?: string; payload: OrderPayload; subtotal: number; fee: number; discount: number; pointsDiscount: number; total: number };

export default function Checkout() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage(); const app = useApp(); return <CheckoutForm key={app.actor} />; }
function CheckoutForm() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const app = useApp(); const actor = app.actor;
  const config = useResource(async signal => (await api<{ data: OrderConfig }>('/orders/config', { signal })).data, 'checkout-config');
  const addresses = useResource(async signal => app.session ? (await app.request<{ data: Address[] }>('/profile/addresses', { signal })).data : [], actor);
  const { customer: customerDraft, type, notes, coupon } = app.checkoutDraft;
  const points = useMyPoints();
  const { pointsToRedeem = '', scheduledAt = '', scheduleLater = false } = app.checkoutDraft;
  const slots = useResource(async signal => (await api<{ data: { enabled: boolean; slots: string[] } }>('/orders/slots?type=' + type, { signal })).data, 'slots:' + type);
  const defaultAddress = addresses.data?.find(a => a.isDefault);
  const customer = customerDraft || { name: app.session?.user.name || '', phone: defaultAddress?.phone || app.session?.user.phone || '', email: app.session?.user.email || '', address: defaultAddress?.fullAddress || '', deliveryDetails: defaultAddress?.deliveryDetails };
  const setCustomer = (update: (c: Customer) => Customer) => app.setCheckoutDraft(d => ({ ...d, customer: update(d.customer || customer) }));
  const setType = (type: 'delivery' | 'pickup') => app.setCheckoutDraft(d => ({ ...d, type }));
  const setNotes = (notes: string) => app.setCheckoutDraft(d => ({ ...d, notes }));
  const setCoupon = (coupon: string) => app.setCheckoutDraft(d => ({ ...d, coupon, couponOfferId: undefined }));
  const [error, setError] = useState(''); const [working, setWorking] = useState(false); const [savedReview, setSavedReview] = useState<Review | null>(null); const gate = useRef(false);
  const fingerprint = JSON.stringify([customer, type, notes, coupon, pointsToRedeem, scheduledAt, scheduleLater, app.cart, actor, app.session?.user || null, app.sessionValidated]);
  const review = savedReview?.fingerprint === fingerprint ? savedReview : null;
  const setReview = (value: Review | null) => setSavedReview(value ? { ...value, fingerprint } : null);
  const showResult = (result: OrderResult) => {
    if (result.data) router.replace({ pathname: '/order/[id]', params: { id: result.data.orderNumber, guest: '1', confirmed: '1' } });
    else if (result.cancelled) { setReview(null); setError('This order attempt was cancelled. Your cart is saved; review it before placing a new order.'); }
  };
  const recovery = async (cancel: boolean) => {
    if (gate.current) return; gate.current = true; setWorking(true); setError('');
    try { showResult(await app.recover(cancel)); } catch (e) { setError(messageOf(e)); } finally { gate.current = false; setWorking(false); }
  };
  const prepare = async () => {
    if (gate.current) return; gate.current = true; setWorking(true); setError('');
    try {
      const [catalog, configResult] = await Promise.all([loadCatalog(), api<{ data: OrderConfig }>('/orders/config')]);
      const checked = revalidateCart(app.cart, catalog);
      if (checked.errors.length) throw new Error(`${checked.errors.join('\n')}\nReturn to your cart and remove or reselect these items.`);
      if (checked.changes.length) { await app.setCart(checked.lines, actor); throw new Error(`Prices updated:\n${checked.changes.join('\n')}\nReview the new summary before continuing.`); }
      const cleaned = { deliveryDetails: type === 'delivery' ? customer.deliveryDetails : undefined, name: customer.name.trim(), phone: customer.phone.trim(), email: customer.email.trim(), address: type === 'delivery' ? customer.address.trim() : '' };
      const validation = checkoutError(checked.lines, cleaned, type, configResult.data, notes);
      if (validation) throw new Error(validation);
      if (scheduleLater && !scheduledAt) throw new Error('Select a scheduled time');
      if (pointsToRedeem && (!/^\d+$/.test(pointsToRedeem) || !Number.isSafeInteger(Number(pointsToRedeem)))) throw new Error('Enter a whole number of points');
      const payload: OrderPayload = { fulfillmentType: type, paymentOption: 'cod', customer: cleaned, kitchenNotes: notes.trim(), couponCode: coupon.trim(), items: orderItems(checked.lines), ...(Number(pointsToRedeem) ? { pointsToRedeem: Number(pointsToRedeem) } : {}), ...(scheduleLater ? { scheduledAt } : {}) };
      const result = await app.request<{ data: Omit<Review, 'payload'> }>('/orders/quote', { method: 'POST', body: payload });
      if (![result.data.subtotal, result.data.discount, result.data.pointsDiscount, result.data.fee, result.data.total].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) throw new Error('The restaurant returned an incomplete response. Please retry or check your saved order.');
      setReview({ ...result.data, payload: { ...payload, reviewedTotal: result.data.total } });
    } catch (e) { setError(messageOf(e)); } finally { gate.current = false; setWorking(false); }
  };
  const submit = async () => {
    if (!review || gate.current) return; gate.current = true; setWorking(true); setError('');
    try { showResult(await app.submit(review.payload)); } catch (e) { setError(`${messageOf(e)}\nKeep the saved request. Retry it or reconcile before starting another order.`); }
    finally { gate.current = false; setWorking(false); }
  };
  if (app.pending) return <Screen><Text style={styles.title}>Resolve your saved order</Text>
    <Text style={styles.text}>We could not confirm the response. Your order may already be with the restaurant. Retry checks the same order. Check or cancel finds a confirmed order, or cancels the attempt safely.</Text>
    <Text style={styles.muted}>Saved {formatDate(app.pending.createdAt)} · {app.pending.payload.fulfillmentType}</Text>
    <Text style={styles.text}>{app.pending.payload.items.length} item selection(s) · {app.pending.payload.customer.name}</Text>
    {app.pending.payload.scheduledAt && <Text style={styles.text}>Scheduled for: {formatDate(app.pending.payload.scheduledAt)}</Text>}
    {!!app.pending.payload.pointsToRedeem && <Text style={styles.muted}>Points to redeem: {app.pending.payload.pointsToRedeem}</Text>}
    <Notice message={error || app.error} />
    {app.pending.actor !== 'guest' && !app.session && <Button title="Sign in to the original account" onPress={() => router.push('/auth')} />}
    <Button title={working ? 'Checking…' : 'Retry original order'} disabled={working || app.busy} onPress={() => void recovery(false)} />
    <Button title="Check or cancel saved order" secondary disabled={working || app.busy} onPress={() => void recovery(true)} />
  </Screen>;
  if (actor !== 'guest' && !app.session) return <Screen><Text style={styles.title}>Sign in to continue</Text><Text style={styles.text}>Your account cart is saved. Sign in again to use it, or clear it from Profile to start a guest order.</Text><Button title="Sign in" onPress={() => router.push('/auth')} /></Screen>;
  const fee = type === 'delivery' && config.data?.checkout?.delivery.enabled ? undefined : config.data?.orderTypes.find(o => o.value === type)?.deliveryFee;
  return <Screen><Text style={styles.title}>Almost at your table</Text>
    <Notice message={error || config.error} retry={config.error ? () => void config.refresh() : undefined} />
    {config.loading && !config.data && <Loading />}
    {config.data && <>
      {!config.data.websiteOrderingEnabled && <Notice message="Restaurant ordering is currently unavailable." />}
      <FulfillmentSelector value={type} change={setType} available={config.data.orderTypes.map(o => o.value)} />
      <Field label="Customer name" maxLength={100} value={customer.name} onChangeText={name => setCustomer(c => ({ ...c, name }))} autoComplete="name" />
      <Field label="Phone" maxLength={30} value={customer.phone} onChangeText={phone => setCustomer(c => ({ ...c, phone }))} keyboardType="phone-pad" />
      <Field label="Email (optional)" maxLength={160} value={customer.email} onChangeText={email => setCustomer(c => ({ ...c, email }))} keyboardType="email-address" autoCapitalize="none" />
      {type === 'delivery' && <>
        <Notice message={addresses.error} retry={() => void addresses.refresh()} />
        {!!addresses.data?.length && <><Text style={styles.heading}>Saved addresses</Text>{addresses.data.map(a => <Chip key={a._id} translate={false} label={`${a.label}${a.isDefault ? ' · ' + t('Default') : ''}`} selected={a.fullAddress === customer.address} onPress={() => setCustomer(c => ({ ...c, address: a.fullAddress, deliveryDetails: a.deliveryDetails, phone: a.phone || c.phone }))} />)}</>}
        <Field label="Delivery address" multiline maxLength={500} value={customer.address} onChangeText={address => setCustomer(c => ({ ...c, address }))} placeholder="Building, street, area and delivery instructions" />
        <DeliveryEditor value={customer.deliveryDetails} center={config.data.checkout?.delivery.latitude != null && config.data.checkout.delivery.longitude != null ? { latitude: config.data.checkout.delivery.latitude, longitude: config.data.checkout.delivery.longitude } : undefined} change={deliveryDetails => setCustomer(c => ({ ...c, deliveryDetails }))} />
        {!config.data.checkout?.delivery.enabled && <Text style={styles.muted}>Map delivery availability is not configured. Manual addresses use the restaurant’s existing delivery fee.</Text>}
        <Button title="Choose pickup instead" secondary onPress={() => setType('pickup')} />
        <Text style={styles.muted}>Delivery minimum: {money(config.data.minimumDeliveryOrder)}</Text>
      </>}
      <Field label="Kitchen notes (optional, 500 characters)" multiline maxLength={500} value={notes} onChangeText={setNotes} />
      <Field label="Coupon code (optional)" value={coupon} onChangeText={setCoupon} autoCapitalize="characters" maxLength={80} />
      <View style={styles.card}><Text style={styles.heading}>Order time · Asia/Riyadh</Text>
        <Chip label="As soon as possible" selected={!scheduleLater} onPress={() => app.setCheckoutDraft(d => ({ ...d, scheduleLater: false }))} />
        <Chip label="Schedule for later" selected={scheduleLater} disabled={!config.data.checkout?.scheduling.enabled} onPress={() => { app.setCheckoutDraft(d => ({ ...d, scheduleLater: true })); void slots.refresh(); }} />
        {!config.data.checkout?.scheduling.enabled && <Text style={styles.muted}>Scheduling is not configured.</Text>}
        {scheduleLater && <><Notice message={slots.error} retry={() => void slots.refresh()} />{slots.loading && <Loading />}{slots.data && <SchedulePicker slots={slots.data.slots} value={scheduledAt} change={scheduledAt => app.setCheckoutDraft(d => ({ ...d, scheduledAt }))} />}<Button title="Refresh times" secondary onPress={() => void slots.refresh()} /></>}
      </View>
      <View style={styles.card}><Text style={styles.heading}>Use loyalty points</Text>
        {!app.session ? <Text style={styles.muted}>Sign in to redeem points. Guest checkout is available.</Text> : !config.data.checkout?.points.enabled ? <Text style={styles.muted}>Points redemption is not configured.</Text> : <>
          <Notice message={points.error} retry={() => void points.refresh()} />
          {points.data && <Text style={styles.text}>Available points: {points.data.pointsBalance}</Text>}
          <Text style={styles.muted}>Points per SAR: {config.data.checkout.points.pointsPerSAR} · Minimum points: {config.data.checkout.points.minimumPoints} · Maximum discount: {money(config.data.checkout.points.maximumDiscountSAR || 0)}</Text>
          {!config.data.checkout.points.stackWithCoupons && <Text style={styles.muted}>Points cannot be combined with coupons.</Text>}
          <Field label="Points to redeem (0 for none)" keyboardType="number-pad" value={pointsToRedeem} onChangeText={pointsToRedeem => app.setCheckoutDraft(d => ({ ...d, pointsToRedeem }))} maxLength={10} />
        </>}
      </View>
      <View style={styles.card}>{app.cart.map(c => <View key={c.key} style={styles.between}><Text style={styles.text}>{c.quantity} × {catalogText(c.product)}</Text><Text style={styles.text}>{money(c.unitPrice * c.quantity)}</Text></View>)}</View>
      <OrderSummary sub={review?.subtotal ?? subtotal(app.cart)} fee={review?.fee ?? fee} discount={review?.discount} pointsDiscount={review?.pointsDiscount} reviewed={!!review} />
      <PaymentCard type={type} /><Text style={styles.muted}>Payment remains pending until cash is collected. The restaurant confirms the final total.</Text>
      {review ? <>{review.payload.scheduledAt && <Text style={styles.text}>Scheduled for: {formatDate(review.payload.scheduledAt)}</Text>}<Text style={styles.text}>Deliver to: {review.payload.customer.name} · {review.payload.customer.phone}{type === 'delivery' ? `\n${review.payload.customer.address}` : '\nPickup at the restaurant'}</Text>
        <Button title={working ? 'Sending saved request…' : `Place cash order · ${money(review.total)}`} disabled={working} onPress={() => void submit()} />
        <Button title="Edit details" secondary disabled={working} onPress={() => setReview(null)} /></>
        : <Button title={working ? 'Checking menu & coupon…' : 'Review order'} disabled={working || !app.cart.length || !config.data.websiteOrderingEnabled} onPress={() => void prepare()} />}
    </>}
  </Screen>;
}
