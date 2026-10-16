import { forwardRef, type ComponentProps } from 'react';
import type { LucideIcon } from 'lucide-react-native';
import Left from 'lucide-react-native/icons/arrow-left';
import Right from 'lucide-react-native/icons/arrow-right';
import Chevron from 'lucide-react-native/icons/chevron-right';
import { useLanguage } from '../i18n/LocaleProvider';
function directional(Icon: LucideIcon): LucideIcon {
  return forwardRef<unknown, ComponentProps<LucideIcon>>(function DirectionalIcon(props, _ref) { const language = useLanguage(); return <Icon {...props} style={[props.style, language === 'ar' && { transform: [{ scaleX: -1 }] }]} />; });
}
export const ArrowLeft = directional(Left);
export const ArrowRight = directional(Right);
export const ChevronRight = directional(Chevron);
