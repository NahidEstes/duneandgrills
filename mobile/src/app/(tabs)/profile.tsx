import { useState } from 'react';
import { View } from 'react-native';
import { Image, Pressable, Text } from '../../i18n/native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useApp } from '../../state/AppProvider';
import { useResource } from '../../hooks/useResource';
import { useAccountAction } from '../../hooks/useAccountAction';
import { useMyPoints } from '../../hooks/useMyPoints';
import { PointsEntry } from '../../components/points';
import { initials, restaurantContact } from '../../domain/profile';
import { imageUrl, loadRestaurant } from '../../services/api';
import { Button, Chip, Notice, Screen, colors, styles } from '../../components/ui';
import { Heart, LogOut, MapPin, Pencil, Phone, ReceiptText, ShieldCheck, UserRound } from '../../components/icons';
import { ProfileBrand, ProfileRow, ProfileTile, profileStyles as ps } from '../../components/profile-ui';

import { setLanguage, useLanguage } from '../../i18n/LocaleProvider';
import { t } from '../../i18n/core';
export default function Profile() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage(); const app = useApp(); return <ProfileSummary key={app.session?.user._id || 'guest'} />; }
function ProfileSummary() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const language = useLanguage(); const [languageError, setLanguageError] = useState('');
  const selectLanguage = async (value: 'en' | 'ar') => { try { await setLanguage(value); setLanguageError(''); } catch { setLanguageError('Language could not be saved. Please retry.'); } };
  const app = useApp(); const action = useAccountAction(); const points = useMyPoints();
  const restaurant = useResource(loadRestaurant, 'restaurant-profile'); const user = app.session?.user;
  const avatar = imageUrl(user?.avatar || ''); const [failedAvatar, setFailedAvatar] = useState<string>();
  const contact = restaurantContact(restaurant.data?.location, restaurant.data?.receipt);
  const edit = () => router.push('/profile-edit'); const addresses = () => router.push('/addresses');
  const openContact = () => void action.run(async () => {
    if (!contact) return;
    try { await Linking.openURL(contact.url); }
    catch { throw new Error(`Unable to open the contact app. Restaurant contact: ${contact.label}`); }
  });
  return <Screen top refreshing={restaurant.loading || points.loading} onRefresh={() => { void restaurant.refresh(); void points.refresh(); if (user) void app.validateSession(); }}>
    <View style={styles.card}><Text style={styles.heading}>Language</Text><View style={styles.row}><Chip label="العربية" selected={language === 'ar'} onPress={() => void selectLanguage('ar')} /><Chip label="English" selected={language === 'en'} onPress={() => void selectLanguage('en')} /></View><Notice message={t(languageError)} /></View>
    <ProfileBrand /><Text accessibilityRole="header" style={styles.title}>My profile</Text><Notice message={action.error || app.error} />
    {user ? <>
      <View style={ps.identity}><View style={ps.avatar}>{avatar && failedAvatar !== avatar ? <Image source={{ uri: avatar }} style={{ width: '100%', height: '100%' }} onError={() => setFailedAvatar(avatar)} accessibilityLabel="Your profile photo" /> : <Text style={ps.initials}>{initials(user.name)}</Text>}</View>
        <View style={{ flex: 1, minWidth: 0 }}><Text translate={false} style={styles.heading}>{user.name}</Text><Text style={styles.muted}>{user.phone || 'Add phone number'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={edit} style={ps.edit}><Pencil size={20} color={colors.accent} accessible={false} /><Text style={[styles.text, { color: colors.accent, fontWeight: '600', flexShrink: 1 }]}>Edit profile</Text></Pressable></View>
      </View>
      {!app.sessionValidated && <Button title="Validate saved session" secondary onPress={() => void app.validateSession()} />}
      <View style={[styles.row, { flexWrap: 'wrap', alignItems: 'stretch' }]}><ProfileTile icon={ReceiptText} title="My orders" onPress={() => router.push('/(tabs)/orders')} /><ProfileTile icon={MapPin} title="Saved addresses" onPress={addresses} /></View>
      <Text style={ps.section}>Account</Text><View style={ps.group}><ProfileRow icon={UserRound} title="Personal information" onPress={edit} /><View style={ps.divider} /><ProfileRow icon={MapPin} title="Saved addresses" onPress={addresses} /><View style={ps.divider} /><ProfileRow icon={Heart} title="Favourite foods" onPress={() => router.push('/favorites')} /></View>
      <PointsEntry points={points} />
    </> : <>
      <View style={styles.card}><Text style={styles.heading}>Welcome to Dune & Grills</Text><Text style={styles.muted}>Sign in to edit your profile and manage saved addresses.</Text><Button title="Sign in" onPress={() => router.push('/auth')} /><Button title="Create customer account" secondary onPress={() => router.push({ pathname: '/auth', params: { mode: 'register' } })} /></View>
      <ProfileTile icon={ReceiptText} title="My orders" onPress={() => router.push('/(tabs)/orders')} /><Text style={styles.muted}>Track orders saved on this device without signing in.</Text>
      <PointsEntry points={points} />
      {(!!app.cart.length || app.actor !== 'guest') && <Button title="Clear cart and continue as guest" secondary disabled={action.busy || !!app.pending || app.busy} onPress={() => void action.run(async () => app.logout())} />}
    </>}
    <Text style={ps.section}>Help</Text><Notice message={restaurant.error} retry={() => void restaurant.refresh()} />
    <View style={ps.group}><ProfileRow icon={Phone} title="Contact restaurant" detail={restaurant.loading && !restaurant.data ? 'Loading contact details…' : contact?.label || 'Contact details are not available yet.'} onPress={contact ? openContact : undefined} disabled={action.busy} /><View style={ps.divider} /><ProfileRow icon={ShieldCheck} title="Privacy & terms" detail="Policy content is not available yet." /></View>
    {!!app.pending && <View style={styles.card}><Text style={styles.muted}>Resolve your saved order before logging out or clearing the cart.</Text><Button title="Resolve saved order" secondary onPress={() => router.push('/checkout')} /></View>}
    {user && <Pressable accessibilityRole="button" accessibilityLabel="Log out" accessibilityState={{ disabled: action.busy || !!app.pending || app.busy }} disabled={action.busy || !!app.pending || app.busy} onPress={() => void action.run(async () => app.logout())} style={({ pressed }) => [ps.logout, (pressed || action.busy || !!app.pending || app.busy) && { opacity: 0.5 }]}><LogOut size={24} color={colors.accent} accessible={false} /><Text style={[styles.text, { color: colors.accent, fontWeight: '600' }]}>{action.busy ? 'Please wait…' : 'Log out'}</Text></Pressable>}
    <Text style={[styles.muted, { textAlign: 'center' }]}>App version {Constants.expoConfig?.version || 'unavailable'}</Text>
  </Screen>;
}
