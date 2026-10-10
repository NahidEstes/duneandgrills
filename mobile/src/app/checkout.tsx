import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../state/AppProvider';
import { api, loadCatalog } from '../services/api';
import { useResource } from '../hooks/useResource';
import { checkoutError, money, orderItems, revalidateCart, subtotal } from '../domain/cart';
import type { Address, Customer, OrderConfig, OrderPayload, OrderResult } from '../domain/types';
import { Button, Chip, Field, Loading, Notice, Screen, messageOf, styles } from '../components/ui';
type Review = { fingerprint?: string; payload: OrderPayload; subtotal: number; fee: number; discount: number; total: number };
type Coupon = { originalSubtotal: number; discountedSubtotal: number; discountAmount: number; code: string };
export default function Checkout() { const app = useApp(); return <CheckoutForm key={app.session?.user._id || 'guest'} />; }
function CheckoutForm() {
  const app = useApp(); const actor = app.session?.user._id || 'guest';
  const config = useResource(async signal => (await api<{ data: OrderConfig }>('/orders/config', { signal })).data, 'checkout-config');
  const addresses = useResource(async signal => app.session ? (await app.request<{ data: Address[] }>('/profile/addresses', { signal })).data : [], actor);
  const [customerDraft, setCustomerDraft] = useState<Customer | null>(null);
  const defaultAddress = addresses.data?.find(a => a.isDefault);
  const customer = customerDraft || { name: app.session?.user.name || '', phone: defaultAddress?.phone || app.session?.user.phone || '', email: app.session?.user.email || '', address: defaultAddress?.fullAddress || '' };
  const setCustomer = (update: (c: Customer) => Customer) => setCustomerDraft(c => update(c || customer));
  const [type, setType] = useState<'delivery' | 'pickup'>('delivery'); const [notes, setNotes] = useState(''); const [coupon, setCoupon] = useState('');
  const [error, setError] = useState(''); const [working, setWorking] = useState(false); const [savedReview, setSavedReview] = useState<Review | null>(null); const gate = useRef(false);
  const fingerprint = JSON.stringify([customer, type, notes, coupon, app.cart, actor]);
  const review = savedReview?.fingerprint === fingerprint ? savedReview : null;
  const setReview = (value: Review | null) => setSavedReview(value ? { ...value, fingerprint } : null);
  const showResult = (result: OrderResult) => {
    if (result.data) router.replace({ pathname: '/order/[id]', params: { id: result.data.orderNumber, guest: '1', confirmed: '1' } });
    else if (result.cancelled) setError('The server confirmed this request is cancelled. Your cart is preserved; review it to create a new order.');
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
      if (checked.changes.length) { await app.setCart(checked.lines); throw new Error(`Prices updated:\n${checked.changes.join('\n')}\nReview the new summary before continuing.`); }
      const cleaned = { name: customer.name.trim(), phone: customer.phone.trim(), email: customer.email.trim(), address: type === 'delivery' ? customer.address.trim() : '' };
      const validation = checkoutError(checked.lines, cleaned, type, configResult.data, notes);
      if (validation) throw new Error(validation);
      let sub = subtotal(checked.lines); let discount = 0;
      if (coupon.trim()) {
        const result = await app.request<{ data: Coupon }>('/offers/validate-coupon', { method: 'POST', body: { code: coupon.trim(), items: orderItems(checked.lines) } });
        sub = result.data.originalSubtotal; discount = result.data.discountAmount;
        if (sub !== subtotal(checked.lines)) throw new Error('The restaurant updated prices. Refresh and review your cart again.');
      }
      const fee = configResult.data.orderTypes.find(o => o.value === type)!.deliveryFee;
      setReview({ payload: { fulfillmentType: type, paymentOption: 'cod', customer: cleaned, kitchenNotes: notes.trim(), couponCode: coupon.trim(), items: orderItems(checked.lines) }, subtotal: sub, fee, discount, total: Number((sub - discount + fee).toFixed(2)) });
    } catch (e) { setError(messageOf(e)); } finally { gate.current = false; setWorking(false); }
  };
  const submit = async () => {
    if (!review || gate.current) return; gate.current = true; setWorking(true); setError('');
    try { showResult(await app.submit(review.payload)); } catch (e) { setError(`${messageOf(e)}\nKeep the saved request. Retry it or reconcile before starting another order.`); }
    finally { gate.current = false; setWorking(false); }
  };
  if (app.pending) return <Screen><Text style={styles.title}>Resolve your saved order</Text>
    <Text style={styles.text}>A response was not confirmed. This does not mean the order failed. Retry sends the exact saved request. Reconcile recovers an existing order or safely cancels this creation attempt.</Text>
    <Text style={styles.muted}>Saved {new Date(app.pending.createdAt).toLocaleString()} · {app.pending.payload.fulfillmentType}</Text>
    <Text style={styles.text}>{app.pending.payload.items.length} item selection(s) · {app.pending.payload.customer.name}</Text>
    <Notice message={error || app.error} />
    {app.pending.actor !== 'guest' && !app.session && <Button title="Sign in to the original account" onPress={() => router.push('/auth')} />}
    <Button title={working ? 'Checking…' : 'Retry original order'} disabled={working || app.busy} onPress={() => void recovery(false)} />
    <Button title="Reconcile or cancel this attempt" secondary disabled={working || app.busy} onPress={() => void recovery(true)} />
  </Screen>;
  const fee = config.data?.orderTypes.find(o => o.value === type)?.deliveryFee || 0;
  return <Screen><Text style={styles.title}>Almost at your table</Text>
    <Notice message={error || config.error} retry={config.error ? () => void config.refresh() : undefined} />
    {config.loading && !config.data && <Loading />}
    {config.data && <>
      {!config.data.websiteOrderingEnabled && <Notice message="Restaurant ordering is currently unavailable." />}
      <View style={styles.row}>{(['delivery', 'pickup'] as const).filter(t => config.data!.orderTypes.some(o => o.value === t)).map(t => <Chip key={t} label={t === 'delivery' ? 'Delivery' : 'Pickup'} selected={type === t} onPress={() => setType(t)} />)}</View>
      <Field label="Customer name" maxLength={100} value={customer.name} onChangeText={name => setCustomer(c => ({ ...c, name }))} autoComplete="name" />
      <Field label="Phone" maxLength={30} value={customer.phone} onChangeText={phone => setCustomer(c => ({ ...c, phone }))} keyboardType="phone-pad" />
      <Field label="Email (optional)" maxLength={160} value={customer.email} onChangeText={email => setCustomer(c => ({ ...c, email }))} keyboardType="email-address" autoCapitalize="none" />
      {type === 'delivery' && <>
        <Notice message={addresses.error} retry={() => void addresses.refresh()} />
        {!!addresses.data?.length && <><Text style={styles.heading}>Saved addresses</Text>{addresses.data.map(a => <Chip key={a._id} label={`${a.label}${a.isDefault ? ' · Default' : ''}`} selected={a.fullAddress === customer.address} onPress={() => setCustomer(c => ({ ...c, address: a.fullAddress, phone: a.phone || c.phone }))} />)}</>}
        <Field label="Delivery address" multiline maxLength={500} value={customer.address} onChangeText={address => setCustomer(c => ({ ...c, address }))} placeholder="Building, street, area and delivery instructions" />
        <Text style={styles.muted}>Delivery minimum: {money(config.data.minimumDeliveryOrder)}</Text>
      </>}
      <Field label="Kitchen notes (optional, 500 characters)" multiline maxLength={500} value={notes} onChangeText={setNotes} />
      <Field label="Coupon code (optional)" value={coupon} onChangeText={setCoupon} autoCapitalize="characters" maxLength={80} />
      <View style={styles.card}><Text style={styles.heading}>Order summary</Text>{app.cart.map(c => <Text key={c.key} style={styles.text}>{c.quantity} × {c.product.name} · {money(c.unitPrice * c.quantity)}</Text>)}
        <Text style={styles.text}>Subtotal · {money(review?.subtotal ?? subtotal(app.cart))}</Text>
        {!!review?.discount && <Text style={styles.text}>Coupon discount · −{money(review.discount)}</Text>}
        <Text style={styles.text}>Delivery · {money(review?.fee ?? fee)}</Text>
        <Text style={styles.heading}>{review ? 'Reviewed total' : 'Estimated total'} · {money(review?.total ?? subtotal(app.cart) + fee)}</Text>
        <Text style={styles.muted}>Cash on {type === 'delivery' ? 'delivery' : 'pickup'}. Payment remains pending until cash is collected. The restaurant confirms the final total.</Text>
      </View>
      {review ? <><Text style={styles.text}>Deliver to: {review.payload.customer.name} · {review.payload.customer.phone}{type === 'delivery' ? `\n${review.payload.customer.address}` : '\nPickup at the restaurant'}</Text>
        <Button title={working ? 'Sending saved request…' : `Place cash order · ${money(review.total)}`} disabled={working} onPress={() => void submit()} />
        <Button title="Edit details" secondary disabled={working} onPress={() => setReview(null)} /></>
        : <Button title={working ? 'Checking menu & coupon…' : 'Review order'} disabled={working || !app.cart.length || !config.data.websiteOrderingEnabled} onPress={() => void prepare()} />}
    </>}
  </Screen>;
}
