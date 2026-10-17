import { useLanguage } from '../i18n/LocaleProvider';
import { View } from 'react-native';
import { Pressable, Text } from '../i18n/native';
import { router } from 'expo-router';
import { ChevronRight, Star } from './icons';
import { colors, styles } from './ui';
import { palette } from '../constants/design';
import { pointsNumber } from '../domain/points';
import type { useMyPoints } from '../hooks/useMyPoints';
export function PointsEntry({ points }: { points: ReturnType<typeof useMyPoints> }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const detail = !points.authenticated ? 'Sign in to view points' : points.data ? `${pointsNumber(points.data.pointsBalance)} available points${points.error ? ' · May be outdated' : ''}` : points.loading ? 'Loading points…' : 'Balance unavailable · Open to retry';
  return <Pressable accessibilityRole="button" accessibilityLabel={`My points, ${detail}`} onPress={() => router.push('/points')} style={({ pressed }) => [styles.card, { flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.65 : 1 }]}>
    <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: palette.orangeTint, alignItems: 'center', justifyContent: 'center' }}><Star size={25} color={colors.accent} accessible={false} /></View><View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={[styles.text, { fontSize: 15, fontWeight: '700' }]}>Dune Rewards</Text><View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}><Text style={[styles.heading, { fontSize: points.data ? 30 : 16, lineHeight: points.data ? 38 : 24 }]}>{points.data ? pointsNumber(points.data.pointsBalance) : 'My points'}</Text>{!!points.data && <Text style={styles.muted}>points</Text>}</View>{(!points.data || !!points.error) && <Text style={styles.muted}>{detail}</Text>}<Text style={[styles.muted, { color: palette.orange, fontWeight: '600' }]}>View rewards</Text></View><ChevronRight size={23} color={colors.muted} accessible={false} />
  </Pressable>;
}
