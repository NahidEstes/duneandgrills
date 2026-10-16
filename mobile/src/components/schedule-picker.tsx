import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '../i18n/native';
import { useLanguage } from '../i18n/LocaleProvider';
import { formatDate, locale } from '../i18n/core';
import { Button, Chip, styles } from './ui';
const dayKey = (date: string) => new Date(Date.parse(date) + 10800000).toISOString().slice(0, 10);
export function SchedulePicker({ slots, value, change }: { slots: string[]; value: string; change: (date: string) => void }) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage();
  const days = [...new Set(slots.map(dayKey))];
  const [chosenDay, setDay] = useState(''); const [count, setCount] = useState(48);
  const day = days.includes(chosenDay) ? chosenDay : value && days.includes(dayKey(value)) ? dayKey(value) : days[0];
  const times = slots.filter(date => dayKey(date) === day);
  return <><ScrollView horizontal contentContainerStyle={{ gap: 8 }}>{days.map(date => <Chip key={date} label={new Intl.DateTimeFormat(locale(), { timeZone: 'Asia/Riyadh', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(date + 'T12:00:00+03:00'))} selected={date === day} onPress={() => { setDay(date); setCount(48); }} />)}</ScrollView>
    <View style={styles.row}>{times.slice(0, count).map(date => <Chip key={date} label={formatDate(date)} selected={date === value} onPress={() => change(date)} />)}</View>
    {times.length > count && <Button title="Load more" secondary onPress={() => setCount(n => n + 48)} />}
    {!times.length && <Text style={styles.muted}>No available time slots. Choose as soon as possible or try again later.</Text>}
  </>;
}
