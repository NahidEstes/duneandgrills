import { useLanguage } from '../i18n/LocaleProvider';
import { useState } from 'react';
import { View } from 'react-native';
import { Pressable, Text } from '../i18n/native';
import { router } from 'expo-router';
import { useApp } from '../state/AppProvider';
import { useMyPoints } from '../hooks/useMyPoints';
import { activityTitle, earningRules, morePointsActivity, POINTS_HISTORY_LIMIT, pointsDate, pointsNumber, signedPoints } from '../domain/points';
import { ArrowLeft, ChevronRight, RefreshCw, Star } from '../components/icons';
import { Button, IconButton, Loading, Notice, Screen, colors, styles } from '../components/ui';
export default function Points() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage(); const app = useApp(); return <PointsContents key={`${app.actor}:${app.session?.token || ''}`} />; }
function PointsContents() {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const points = useMyPoints(); const [count, setCount] = useState(10); const data = points.data;
  return <Screen refreshing={points.loading} onRefresh={() => void points.refresh()}>
    <View style={styles.row}><IconButton icon={ArrowLeft} label="Back to Profile" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} /><Text accessibilityRole="header" style={[styles.title, { flexShrink: 1 }]}>My points</Text>{points.authenticated && <IconButton icon={RefreshCw} label="Refresh points" disabled={points.loading} onPress={() => void points.refresh()} />}</View>
    {!points.authenticated ? <><Text style={styles.text}>Sign in to view your points and recent activity.</Text><Button title="Sign in" onPress={() => router.push('/auth')} /></> : <>
      {points.loading && !data && <Loading />}<Notice message={points.error} retry={() => void points.refresh()} />
      {!!points.error && data && <Text accessibilityLiveRegion="polite" style={styles.muted}>Points may be outdated. Your last known balance is shown. Pull to refresh or retry.</Text>}
      {data && <>
        <View style={[styles.card, { borderColor: colors.accent }]}><View style={styles.row}><Star size={30} color={colors.accent} accessible={false} /><Text style={styles.text}>Available points</Text></View><Text accessibilityLabel={`${pointsNumber(data.pointsBalance)} available points`} style={[styles.title, { color: colors.accent, fontSize: 44 }]}>{pointsNumber(data.pointsBalance)}</Text><Text style={styles.muted}>Points available in your account.</Text></View>
        {data.pointsDebt > 0 && <View style={styles.card}><Text style={styles.heading}>Points adjustment</Text><Text style={styles.text}>Some points were adjusted after a refund. Future earned points will first cover this adjustment.</Text></View>}
        <Text accessibilityRole="header" style={styles.heading}>How points work</Text><View style={styles.card}>{earningRules(data).map(rule => <Text key={rule} style={styles.text}>{rule}</Text>)}</View>
        <View style={styles.between}><Text accessibilityRole="header" style={styles.heading}>Recent activity</Text><Text style={styles.muted}>{Math.min(count, data.history.length)} shown</Text></View>
        <Text style={styles.muted}>Up to the {POINTS_HISTORY_LIMIT} most recent records are supplied by the restaurant. This is not complete lifetime history.</Text>
        {!data.history.length && <View style={styles.card}><Text style={styles.text}>No points activity yet.</Text></View>}
        {data.history.slice(0, count).map(activity => {
          const content = <><View style={styles.between}><Text style={[styles.text, { fontWeight: '700', flexShrink: 1 }]}>{activityTitle(activity)}</Text><Text style={[styles.heading, { color: activity.points > 0 ? colors.accent : colors.ink }]}>{signedPoints(activity.points)}</Text></View><Text style={styles.muted}>{pointsDate(activity.createdAt)}</Text>{!!(activity.orderNumber || activity.orderId) && <View style={styles.between}><Text style={styles.muted}>{activity.orderNumber ? `Order ${activity.orderNumber}` : 'View order'}</Text>{!!activity.orderId && <ChevronRight size={20} color={colors.accent} accessible={false} />}</View>}</>;
          return activity.orderId ? <Pressable key={activity.key} accessibilityRole="button" accessibilityLabel={`View order ${activity.orderNumber || 'details'}, ${activityTitle(activity)}, ${signedPoints(activity.points)}`} onPress={() => router.push({ pathname: '/order/[id]', params: { id: activity.orderId! } })} style={({ pressed }) => [styles.card, pressed && { opacity: 0.65 }]}>{content}</Pressable> : <View key={activity.key} style={styles.card}>{content}</View>;
        })}
        {count < data.history.length && <Button title="Load more" secondary onPress={() => setCount(value => morePointsActivity(value, data.history.length))} />}
      </>}
    </>}
  </Screen>;
}
