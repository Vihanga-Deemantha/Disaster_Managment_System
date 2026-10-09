import { StyleSheet, Text, type TextProps } from 'react-native';
import { colors, fontSize } from '@/shared/theme/tokens';

export type TextVariant = 'title' | 'heading' | 'body' | 'label' | 'caption';

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
}

/** Text in the app's sizes. Every size grows with the phone's font setting, which many people rely on. */
export function AppText({ variant = 'body', color, style, ...props }: AppTextProps) {
  return <Text {...props} style={[styles[variant], color ? { color } : null, style]} />;
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, lineHeight: 34, fontWeight: '800', color: colors.navy900 },
  heading: { fontSize: fontSize.heading, lineHeight: 26, fontWeight: '700', color: colors.navy900 },
  body: { fontSize: fontSize.body, lineHeight: 24, color: colors.ink },
  label: { fontSize: fontSize.label, lineHeight: 20, fontWeight: '600', color: colors.navy900 },
  caption: { fontSize: fontSize.caption, lineHeight: 18, color: colors.inkSoft },
});
