import { useLanguage } from '../i18n/LocaleProvider';
import { View } from 'react-native';
import { Pressable, Text } from '../i18n/native';
import { router } from 'expo-router';
import { ChevronRight, Star } from './icons';
import { colors, styles } from './ui';
import { pointsNumber } from '../domain/points';
import type { useMyPoints } from '../hooks/useMyPoints';
export function PointsEntry({ points }: { points: ReturnType<typeof useMyPoints> }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const detail = !points.authenticated ? 'Sign in to view points' : points.data ? `${pointsNumber(points.data.pointsBalance)} available points${points.error ? ' · May be outdated' : ''}` : points.loading ? 'Loading points…' : 'Balance unavailable · Open to retry';
  return <Pressable accessibilityRole="button" accessibilityLabel={`My points, ${detail}`} onPress={() => router.push('/points')} style={({ pressed }) => [styles.card, { flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.65 : 1 }]}>
    <Star size={28} color={colors.accent} accessible={false} /><View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={styles.heading}>My points</Text><Text style={styles.muted}>{detail}</Text></View><ChevronRight size={23} color={colors.muted} accessible={false} />
  </Pressable>;
}
