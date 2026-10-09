import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useT } from '@/shared/i18n/I18nProvider';
import { spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import type { LocationState, Point } from '../hooks/useCurrentLocation';
import { MapPin } from './MapPin';

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
  onPin,
}: {
  state: LocationState;
  retry: () => void;
  disabled: boolean;
  onPin: (point: Point) => void;
}) {
  const t = useT();
  const [adjusting, setAdjusting] = useState(false);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const editable = !disabled && (state.status === 'MANUAL' || adjusting);
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="heading">{t('reports.location.title')}</AppText>
      <LocationMap state={state} editable={editable} onPin={onPin} />
      {editable ? <AppText variant="caption">{t('reports.location.tapMap')}</AppText> : null}
      {state.status === 'READY' && !adjusting ? (
        <Button
          title={t('reports.location.adjust')}
          variant="secondary"
          disabled={disabled}
          onPress={() => setAdjusting(true)}
        />
      ) : null}
      <LocationRecovery
        state={state}
        disabled={disabled}
        onPin={onPin}
        onSettings={() => {
          setSettingsFailed(false);
          void Linking.openSettings().catch(() => setSettingsFailed(true));
        }}
      />
      {settingsFailed ? (
        <Banner tone="warning">{t('reports.location.settingsFailed')}</Banner>
      ) : null}
      <Button
        title={t('reports.location.retry')}
        variant="ghost"
        disabled={disabled || state.status === 'LOCATING'}
        onPress={() => {
          setAdjusting(false);
          setSettingsFailed(false);
          retry();
        }}
      />
    </View>
  );
}

function LocationMap({
  state,
  editable,
  onPin,
}: {
  state: LocationState;
  editable: boolean;
  onPin: (point: Point) => void;
}) {
  const t = useT();
  if (state.status === 'LOCATING')
    return <AppText accessibilityLiveRegion="polite">{t('reports.location.locating')}</AppText>;
  const centre = state.status === 'READY' ? state.location : state.center;
  return (
    <>
      <MapPin centre={centre} pin={state.location} editable={editable} onPin={onPin} />
      {state.status === 'READY' ? (
        <AppText variant="caption">{t('reports.location.gps')}</AppText>
      ) : (
        <Banner tone="warning">{t(messages[state.reason])}</Banner>
      )}
    </>
  );
}

function LocationRecovery({
  state,
  disabled,
  onPin,
  onSettings,
}: {
  state: LocationState;
  disabled: boolean;
  onPin: (point: Point) => void;
  onSettings: () => void;
}) {
  const t = useT();
  if (state.status !== 'MANUAL') return null;
  const lastKnown = state.lastKnown;
  return (
    <>
      {state.reason === 'DENIED' ? (
        <Button
          title={t('reports.location.settings')}
          variant="secondary"
          disabled={disabled}
          onPress={onSettings}
        />
      ) : null}
      {lastKnown ? (
        <>
          <AppText variant="caption">{t('reports.location.lastKnownHint')}</AppText>
          <AppText>{`${lastKnown.lat.toFixed(5)}, ${lastKnown.lng.toFixed(5)}`}</AppText>
          <Button
            title={t('reports.location.useLastKnown')}
            variant="secondary"
            disabled={disabled}
            onPress={() => onPin(lastKnown)}
          />
        </>
      ) : null}
    </>
  );
}
