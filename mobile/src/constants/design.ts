import { Platform } from 'react-native';
export const palette = { background: '#101010', surface: '#202020', border: '#343434', orange: '#FF7A18', text: '#FAFAF8', muted: '#B5B5B5', onOrange: '#17100B', danger: '#FF9B91' };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, section: 24, roomy: 32 };
export const radius = { input: 16, card: 20, hero: 24, pill: 999 };
export const typography = { family: Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui' }), title: 32, heading: 21, body: 16, caption: 14 };
