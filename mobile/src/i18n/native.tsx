// Localized presentation primitives keep user-entered values and stored payloads
// intact. Locale changes only rerender; they never remount application state.
import React from 'react';
import * as Native from 'react-native';
import { useLanguage } from './LocaleProvider';
import { formatNumber, normalizeDigits, t } from './core';
const translateChildren = (value: React.ReactNode): React.ReactNode => typeof value === 'string' ? t(value) : typeof value === 'number' ? formatNumber(value) : Array.isArray(value) ? value.map(translateChildren) : value;
export function Text({ children, style, translate = true, ...props }: Native.TextProps & { translate?: boolean }) {
  "use no memo"; // Locale formatting reads the selected application language.

  const language = useLanguage();
  const identifier = typeof children === 'string' && (/^[+\d][\d\s()-]+$/.test(children) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(children) || /^DG-\d+-\d+$/.test(children));
  return <Native.Text {...props} accessibilityLabel={props.accessibilityLabel && t(props.accessibilityLabel)} style={[{ textAlign: language === 'ar' ? 'right' : 'left', writingDirection: language === 'ar' ? 'rtl' : 'ltr' }, style, identifier && { writingDirection: 'ltr' }]}>{translate ? translateChildren(children) : children}</Native.Text>;
}
export function Pressable(props: Native.PressableProps & React.RefAttributes<Native.View>) {
  "use no memo"; // Locale formatting reads the selected application language.

  useLanguage(); return <Native.Pressable {...props} accessibilityLabel={props.accessibilityLabel && t(props.accessibilityLabel)} />;
}
export function View(props: Native.ViewProps & React.RefAttributes<Native.View>) {
  "use no memo"; // Locale formatting reads the selected application language.
 useLanguage(); return <Native.View {...props} accessibilityLabel={props.accessibilityLabel && t(props.accessibilityLabel)} />; }
export function Image(props: Native.ImageProps) {
  "use no memo"; // Locale formatting reads the selected application language.
 useLanguage(); return <Native.Image {...props} accessibilityLabel={props.accessibilityLabel && t(props.accessibilityLabel)} />; }
export function TextInput({ style, ...props }: Native.TextInputProps) {
  "use no memo"; // Locale formatting reads the selected application language.

  const language = useLanguage();
  const ltr = ['phone-pad', 'email-address', 'number-pad', 'decimal-pad', 'numbers-and-punctuation'].includes(props.keyboardType || '');
  return <Native.TextInput {...props} onChangeText={props.onChangeText ? value => props.onChangeText?.(ltr && props.keyboardType !== 'email-address' ? normalizeDigits(value) : value) : undefined} placeholder={props.placeholder && t(props.placeholder)} accessibilityLabel={props.accessibilityLabel && t(props.accessibilityLabel)} style={[style, { textAlign: ltr ? 'left' : language === 'ar' ? 'right' : 'left', writingDirection: ltr ? 'ltr' : language === 'ar' ? 'rtl' : 'ltr' }]} />;
}
export function ActivityIndicator(props: Native.ActivityIndicatorProps) {
  "use no memo"; // Locale formatting reads the selected application language.
 useLanguage(); return <Native.ActivityIndicator {...props} accessibilityLabel={props.accessibilityLabel && t(props.accessibilityLabel)} />; }
export function Switch(props: Native.SwitchProps) {
  "use no memo"; // Locale formatting reads the selected application language.
 useLanguage(); return <Native.Switch {...props} accessibilityLabel={props.accessibilityLabel && t(props.accessibilityLabel)} />; }
