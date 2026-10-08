import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from './AppText';

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<BannerTone, { background: string; text: string; mark: string }> = {
  info: { background: colors.info100, text: colors.info600, mark: 'i' },
  success: { background: colors.success100, text: colors.success600, mark: '✓' },
  warning: { background: colors.warning100, text: colors.warning600, mark: '!' },
  danger: { background: colors.danger100, text: colors.danger600, mark: '!' },
};

/**
 * A message box. The tone is never colour alone: each has its own mark, and warnings and errors are
 * announced to a screen reader as they appear.
 */
export function Banner({
  tone = 'info',
  children,
  action,
  testID,
}: {
  tone?: BannerTone;
  children: ReactNode;
  action?: ReactNode;
  testID?: string;
}) {
  const look = TONES[tone];
  const urgent = tone === 'danger' || tone === 'warning';
  return (
    <View
      accessibilityRole={urgent ? 'alert' : undefined}
      accessibilityLiveRegion={urgent ? 'polite' : 'none'}
      testID={testID}
      style={[styles.box, { backgroundColor: look.background }]}
    >
      <View style={styles.row}>
        <View style={[styles.mark, { borderColor: look.text }]}>
          <AppText variant="caption" color={look.text} style={styles.markText}>
            {look.mark}
          </AppText>
        </View>
        <AppText variant="label" color={look.text} style={styles.message}>
          {children}
        </AppText>
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  mark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  markText: { fontWeight: '800', lineHeight: 16 },
  message: { flex: 1, fontWeight: '500', lineHeight: 21 },
  action: { alignItems: 'flex-start' },
});
