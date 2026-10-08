import { Image, StyleSheet, View } from 'react-native';
import { colors, spacing } from '@/shared/theme/tokens';
import brandMark from '../../../assets/images/brand-mark.png';
import { AppText } from './AppText';

/** The logo and the two-tone "Safe Zone" wordmark, as on the web. `onDark` is for the navy header. */
export function BrandMark({ onDark = false, size = 40 }: { onDark?: boolean; size?: number }) {
  return (
    <View style={styles.row} accessibilityRole="header">
      <Image
        source={brandMark}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size }}
      />
      <AppText variant="heading" color={onDark ? colors.white : colors.navy900} style={styles.name}>
        Safe{' '}
        <AppText variant="heading" color={onDark ? colors.accent400 : colors.accent600}>
          Zone
        </AppText>
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { fontWeight: '800', letterSpacing: -0.3 },
});
