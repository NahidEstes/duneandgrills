import { t } from '../i18n/core';
import { useLanguage } from '../i18n/LocaleProvider';
import { View } from 'react-native';
import { Text } from '../i18n/native';
import { router } from 'expo-router';
import { useApp } from '../state/AppProvider';
import { useDeliveryAddress } from '../hooks/useDeliveryAddress';
import { Button, Chip, Field, Loading, Notice, Screen, styles } from '../components/ui';
import type { Customer } from '../domain/types';
export default function AddressSelector() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const app = useApp(); const { addresses, customer } = useDeliveryAddress();
  const setCustomer = (update: (customer: Customer) => Customer) => app.setCheckoutDraft(d => ({ ...d, customer: update(d.customer || customer) }));
  const done = () => router.canGoBack() ? router.back() : router.replace('/(tabs)/home');
  if (app.pending) return <Screen><Notice message="Resolve your saved order before changing its delivery details." /><Button title="Resolve saved order" onPress={() => router.replace('/checkout')} /></Screen>;
  return <Screen><Text style={styles.title}>Where shall we deliver?</Text><Text style={styles.muted}>Select a saved address or enter the address for this order.</Text><Notice message={addresses.error} retry={() => void addresses.refresh()} />
    {addresses.loading && !addresses.data && <Loading />}
    {!!addresses.data?.length && <View style={{ gap: 12 }}><Text style={styles.heading}>Saved addresses</Text>{addresses.data.map(address => <View key={address._id} style={styles.card}><Chip translate={false} label={`${address.label}${address.isDefault ? ' · ' + t('Default') : ''}`} selected={customer.address === address.fullAddress} onPress={() => setCustomer(c => ({ ...c, address: address.fullAddress, deliveryDetails: address.deliveryDetails, phone: address.phone || c.phone }))} /><Text style={styles.text}>{address.fullAddress}</Text></View>)}</View>}
    <Field label="Delivery address" placeholder="Building, street, area and delivery instructions" multiline maxLength={500} value={customer.address} onChangeText={address => setCustomer(c => ({ ...c, address }))} />
    <Field label="Phone" keyboardType="phone-pad" maxLength={30} value={customer.phone} onChangeText={phone => setCustomer(c => ({ ...c, phone }))} />
    <Button title="Use this address" disabled={!customer.address.trim()} onPress={done} />
    {app.session && <Button title="Add saved address" secondary onPress={() => router.push({ pathname: '/address/[id]', params: { id: 'new', returnTo: 'selector' } })} />}
  </Screen>;
}
