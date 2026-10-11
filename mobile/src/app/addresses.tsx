import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../state/AppProvider';
import { useSavedAddresses } from '../hooks/useSavedAddresses';
import { useAccountAction } from '../hooks/useAccountAction';
import type { Address } from '../domain/types';
import { DeleteAddressDialog } from '../components/profile-ui';
import { Button, Loading, Notice, Screen, colors, styles } from '../components/ui';

export default function Addresses() { const app = useApp(); return <AddressManager key={app.session?.user._id || 'guest'} />; }
function AddressManager() {
  const app = useApp(); const addresses = useSavedAddresses(); const action = useAccountAction();
  const [deleting, setDeleting] = useState<Address | null>(null); const [notice, setNotice] = useState('');
  const mutate = (address: Address, remove: boolean) => {
    setNotice(''); void action.run(async active => {
      await app.request(`/profile/addresses/${address._id}${remove ? '' : '/default'}`, { method: remove ? 'DELETE' : 'PATCH', ...(remove ? {} : { body: {} }) });
      if (!active()) return;
      setDeleting(null); await addresses.refresh(); if (!active()) return;
      await app.validateSession(); if (active()) setNotice(remove ? 'Address deleted.' : 'Default address updated.');
    });
  };
  if (!app.session) return <Screen><Text style={styles.text}>Sign in to manage saved addresses.</Text><Button title="Sign in" onPress={() => router.push('/auth')} /></Screen>;
  return <Screen refreshing={addresses.loading} onRefresh={() => void addresses.refresh()}><Text accessibilityRole="header" style={styles.title}>Saved addresses</Text><Text style={styles.muted}>Use these addresses for delivery at checkout.</Text><Notice message={action.error || app.error} /><Notice message={addresses.error} retry={() => void addresses.refresh()} />
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text>}{addresses.loading && !addresses.data && <Loading />}
    {addresses.data?.map(address => <View key={address._id} style={styles.card}><View style={styles.between}><Text style={[styles.heading, { flexShrink: 1 }]}>{address.label}</Text>{address.isDefault && <Text style={[styles.muted, { color: colors.accent, fontWeight: '700' }]}>Default</Text>}</View><Text style={styles.text}>{address.fullAddress}</Text>{!!address.phone && <Text style={styles.muted}>{address.phone}</Text>}
      <Button title="Edit address" label={`Edit ${address.label} address`} secondary disabled={action.busy} onPress={() => router.push({ pathname: '/address/[id]', params: { id: address._id, returnTo: 'addresses' } })} />
      {!address.isDefault && <Button title="Set as default" label={`Set ${address.label} as default`} secondary disabled={action.busy} onPress={() => mutate(address, false)} />}
      <Button title="Delete address" label={`Delete ${address.label} address`} secondary disabled={action.busy} onPress={() => setDeleting(address)} />
    </View>)}
    {addresses.data && !addresses.data.length && <Text style={styles.muted}>No saved addresses yet. Add your first delivery address.</Text>}
    <Button title="Add address" disabled={action.busy} onPress={() => router.push({ pathname: '/address/[id]', params: { id: 'new', returnTo: 'addresses' } })} />
    <DeleteAddressDialog label={deleting?.label ?? null} busy={action.busy} error={action.error} onCancel={() => setDeleting(null)} onDelete={() => { if (deleting) mutate(deleting, true); }} />
  </Screen>;
}
