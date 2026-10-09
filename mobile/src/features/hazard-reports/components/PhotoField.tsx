import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useT } from '@/shared/i18n/I18nProvider';
import type { MessageKey } from '@/shared/i18n/messages.en';
import { radius, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import type { PhotoPicker } from '../adapters/ExpoPhotoPicker';
import type { PickedPhoto } from '../domain/types';
import { validatePickedPhoto } from '../domain/validatePickedPhoto';

interface Props {
  photo?: PickedPhoto;
  picker: PhotoPicker;
  onChange: (photo?: PickedPhoto) => void;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}
export function PhotoField({ photo, picker, onChange, disabled, onBusyChange }: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<MessageKey>();
  async function pick(source: 'CAMERA' | 'GALLERY'): Promise<void> {
    setBusy(true);
    onBusyChange(true);
    setProblem(undefined);
    try {
      const result = await picker.pick(source);
      if (result.kind === 'PICKED') {
        const checked = validatePickedPhoto(result.photo);
        if (checked.ok) onChange(result.photo);
        else setProblem(`reports.${checked.problem}`);
      } else if (result.kind === 'DENIED') setProblem('reports.photo.denied');
      else if (result.kind === 'UNAVAILABLE') setProblem('reports.photo.unavailable');
    } catch {
      setProblem('reports.photo.unavailable');
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <View style={styles.group}>
      <AppText variant="heading">{t('reports.photo.title')}</AppText>
      <AppText variant="caption">{t('reports.photo.hint')}</AppText>
      {photo ? (
        <>
          <Image
            accessible
            accessibilityLabel={t('reports.photo.preview')}
            source={{ uri: photo.uri }}
            style={styles.preview}
            resizeMode="cover"
          />
          <Button
            title={t('reports.photo.remove')}
            variant="ghost"
            disabled={disabled || busy}
            onPress={() => {
              onChange(undefined);
              setProblem(undefined);
            }}
          />
        </>
      ) : null}
      {problem ? (
        <>
          <Banner tone="warning">{t(problem)}</Banner>
          <Button
            title={t('reports.photo.retake')}
            variant="secondary"
            disabled={disabled || busy}
            onPress={() => void pick('CAMERA')}
          />
          <Button
            title={t('reports.photo.continueWithout')}
            variant="ghost"
            disabled={disabled || busy}
            onPress={() => {
              onChange(undefined);
              setProblem(undefined);
            }}
          />
        </>
      ) : null}
      <Button
        title={t('reports.photo.camera')}
        variant="secondary"
        disabled={disabled || busy}
        onPress={() => void pick('CAMERA')}
      />
      <Button
        title={t('reports.photo.gallery')}
        variant="secondary"
        disabled={disabled || busy}
        onPress={() => void pick('GALLERY')}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  preview: { width: '100%', height: 180, borderRadius: radius.md },
});
