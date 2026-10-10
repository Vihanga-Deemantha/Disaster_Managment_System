import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/shared/i18n/I18nProvider';
import { colors, MIN_TOUCH, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { Banner } from '@/shared/ui/Banner';
import { TextField } from '@/shared/ui/TextField';
import type { LocationReading } from '../adapters/ExpoLocationProvider';

type Detecting = 'idle' | 'detecting' | 'denied' | 'unavailable';

/** The big "Use my current location" button. Once a location is set it shows the coordinates. */
function LocateButton({
  state,
  coordinates,
  onPress,
}: {
  state: 'idle' | 'detecting' | 'set';
  coordinates: string;
  onPress: () => void;
}) {
  const t = useT();
  const label = {
    idle: t('auth.register.locationUse'),
    detecting: t('location.detecting'),
    set: t('auth.register.locationSet'),
  }[state];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={state === 'set' ? `${label}: ${coordinates}` : label}
      accessibilityState={{ busy: state === 'detecting' }}
      disabled={state === 'detecting'}
      onPress={onPress}
      style={[styles.locate, state === 'set' && styles.locateSet]}
    >
      <AppText variant="label">{label}</AppText>
      <AppText variant="caption">
        {state === 'set' ? coordinates : t('auth.register.locationOr')}
      </AppText>
    </Pressable>
  );
}

/** Why the device could not say where it is, in a line the person can act on. */
function LocationNotice({ detecting }: { detecting: Detecting }) {
  const t = useT();
  if (detecting === 'denied') return <Banner tone="warning">{t('location.denied')}</Banner>;
  if (detecting === 'unavailable')
    return <Banner tone="warning">{t('location.unsupported')}</Banner>;
  return null;
}

/** The fallback for a phone that cannot say where it is: type the coordinates by hand. */
function ManualCoordinates({
  lat,
  lng,
  onChange,
}: {
  lat: string;
  lng: string;
  onChange: (lat: string, lng: string) => void;
}) {
  const t = useT();
  return (
    <View style={styles.manual}>
      <TextField
        label={t('auth.register.locationLat')}
        value={lat}
        onChangeText={(text) => onChange(text, lng)}
        keyboardType="numbers-and-punctuation"
      />
      <TextField
        label={t('auth.register.locationLng')}
        value={lng}
        onChangeText={(text) => onChange(lat, text)}
        keyboardType="numbers-and-punctuation"
        hint={t('auth.register.locationHint')}
      />
    </View>
  );
}

/** Asks the device for its position once, on request; keeps track of what happened. */
function useLocate(
  readLocation: () => Promise<LocationReading>,
  onChange: (lat: string, lng: string) => void,
) {
  const [detecting, setDetecting] = useState<Detecting>('idle');
  async function locate(): Promise<void> {
    setDetecting('detecting');
    const reading = await readLocation();
    if (reading.status === 'ok') onChange(reading.lat, reading.lng);
    setDetecting(reading.status === 'ok' ? 'idle' : reading.status);
  }
  return { detecting, locate };
}

interface LocationPickerProps {
  lat: string;
  lng: string;
  /** The error shown for the location, if any. */
  error: string | undefined;
  onChange: (lat: string, lng: string) => void;
  readLocation: () => Promise<LocationReading>;
}

/** What the picker shows: the button's state, and whether the coordinate boxes are open. */
function describePicker(
  { lat, lng, error }: Pick<LocationPickerProps, 'lat' | 'lng' | 'error'>,
  detecting: Detecting,
  manualOpen: boolean,
): { buttonState: 'idle' | 'detecting' | 'set'; showManual: boolean } {
  const failed = detecting === 'denied' || detecting === 'unavailable';
  const isSet = lat !== '' && lng !== '' && !error;
  const resting = isSet ? 'set' : 'idle';
  return {
    buttonState: detecting === 'detecting' ? 'detecting' : resting,
    // Typing by hand is offered when asked for, when the device could not say, and when there is a problem.
    showManual: manualOpen || failed || Boolean(error),
  };
}

/** Where the citizen lives: the device's location in one tap, or the coordinates typed by hand. */
export function LocationPicker(props: LocationPickerProps) {
  const { lat, lng, error, onChange, readLocation } = props;
  const t = useT();
  const { detecting, locate } = useLocate(readLocation, onChange);
  const [manualOpen, setManualOpen] = useState(false);
  const { buttonState, showManual } = describePicker(props, detecting, manualOpen);

  return (
    <View style={styles.wrapper}>
      <AppText variant="label">{t('auth.register.location')}</AppText>
      <LocateButton
        state={buttonState}
        coordinates={`${lat}, ${lng}`}
        onPress={() => void locate()}
      />
      <LocationNotice detecting={detecting} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('auth.register.locationManual')}
        accessibilityState={{ expanded: showManual }}
        onPress={() => setManualOpen((open) => !open)}
        style={styles.manualToggle}
      >
        <AppText variant="label" color={colors.accent600}>
          {t('auth.register.locationManual')}
        </AppText>
      </Pressable>
      {showManual ? <ManualCoordinates lat={lat} lng={lng} onChange={onChange} /> : null}
      {error ? (
        <AppText
          variant="caption"
          color={colors.danger600}
          accessibilityRole="alert"
          style={styles.error}
        >
          {`! ${error}`}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  locate: {
    minHeight: MIN_TOUCH + 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    gap: 2,
  },
  locateSet: {
    borderColor: colors.success600,
    borderWidth: 1.5,
    backgroundColor: colors.success100,
  },
  manualToggle: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  manual: { gap: spacing.md },
  error: { fontWeight: '600' },
});
