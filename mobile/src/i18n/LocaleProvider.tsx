import { useEffect, useState, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocaleProvider as RouterLocaleProvider } from 'expo-router';
import { View } from 'react-native';
import { changeLanguage, getLanguage, subscribeLanguage, type Language } from './core';
export const LANGUAGE_KEY = 'dg.language.v1';
export function useLanguage() { return useSyncExternalStore(subscribeLanguage, getLanguage, () => 'en' as Language); }
export async function setLanguage(value: Language) { await AsyncStorage.setItem(LANGUAGE_KEY, value); changeLanguage(value); }
export function LanguageProvider({ children }: React.PropsWithChildren) {
  "use no memo"; // Locale formatting reads the selected application language.

  const language = useLanguage(); const [ready, setReady] = useState(false);
  useEffect(() => { void AsyncStorage.getItem(LANGUAGE_KEY).then(value => { if (value === 'ar' || value === 'en') changeLanguage(value); }).catch(() => {}).finally(() => setReady(true)); }, []);
  return <RouterLocaleProvider direction={language === 'ar' ? 'rtl' : 'ltr'}><View style={{ flex: 1, direction: language === 'ar' ? 'rtl' : 'ltr' }}>{ready ? children : null}</View></RouterLocaleProvider>;
}
