import { View } from 'react-native';
import { useT } from '@/shared/i18n/I18nProvider';
import { spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import type { LocationState } from '../hooks/useCurrentLocation';

const messages = {
  DENIED: 'reports.location.denied',
  TIMEOUT: 'reports.location.timeout',
  UNAVAILABLE: 'reports.location.unavailable',
  ADJUSTED: 'reports.location.manual',
} as const;
export function LocationField({
  state,
  retry,
  disabled,
}: {
  state: LocationState;
  retry: () => void;
  disabled: boolean;
}) {
  const t = useT();
  const location = state.status === 'LOCATING' ? undefined : state.location;
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="heading">{t('reports.location.title')}</AppText>
      {location ? (
        <AppText>{`${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`}</AppText>
      ) : null}
      {state.status === 'LOCATING' ? (
        <AppText accessibilityLiveRegion="polite">{t('reports.location.locating')}</AppText>
      ) : null}
      {state.status === 'READY' ? (
        <AppText variant="caption">{t('reports.location.gps')}</AppText>
      ) : null}
      {state.status === 'MANUAL' ? (
        <Banner tone="warning">{t(messages[state.reason])}</Banner>
      ) : null}
      <Button
        title={t('reports.location.retry')}
        variant="ghost"
        disabled={disabled || state.status === 'LOCATING'}
        onPress={retry}
      />
    </View>
  );
}
