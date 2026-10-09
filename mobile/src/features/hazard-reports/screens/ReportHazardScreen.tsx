import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/shared/i18n/I18nProvider';
import { useSession } from '@/shared/session/SessionProvider';
import { colors, radius, spacing } from '@/shared/theme/tokens';
import { AppText } from '@/shared/ui/AppText';
import { Banner } from '@/shared/ui/Banner';
import { Button } from '@/shared/ui/Button';
import { Screen } from '@/shared/ui/Screen';
import { TextField } from '@/shared/ui/TextField';
import { HazardTiles } from '../components/HazardTiles';
import { LocationField } from '../components/LocationField';
import { PhotoField } from '../components/PhotoField';
import { SubmissionFeedback } from '../components/SubmissionFeedback';
import { OfflineBanner } from '../components/OfflineBanner';
import { reportDependencies, type ReportDependencies } from '../composition';
import { DESCRIPTION_MAX_CHARS } from '../domain/reportRules';
import type { ReportDraft } from '../domain/types';
import { validateReportDraft, type DraftValidation } from '../domain/validateReportDraft';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { useReportSubmission, type SubmissionOutcome } from '../hooks/useReportSubmission';

function isDelivered(outcome?: SubmissionOutcome): boolean {
  return outcome?.kind === 'DELIVERED' || outcome?.kind === 'ALREADY_SENT';
}

interface Props {
  ownerId: string;
  deps: ReportDependencies;
  onSessionExpired?: () => Promise<void>;
}
function invalidLocations(checked: DraftValidation) {
  return checked.ok
    ? []
    : checked.problems.filter(
        (problem) => problem === 'LOCATION_INVALID' || problem === 'LOCATION_OUTSIDE_SRI_LANKA',
      );
}
function DescriptionField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const t = useT();
  const count = [...value.trim()].length;
  return (
    <View style={styles.group}>
      <TextField
        label={t('reports.description')}
        hint={t('reports.descriptionHint')}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        error={count > DESCRIPTION_MAX_CHARS ? t('reports.DESCRIPTION_TOO_LONG') : undefined}
      />
      <AppText variant="caption">{`${count} / ${DESCRIPTION_MAX_CHARS}`}</AppText>
    </View>
  );
}

function SentConfirmation({ onAnother }: { onAnother: () => void }) {
  const t = useT();
  return (
    <Screen edges={['right', 'bottom', 'left']}>
      <Banner tone="success">{t('reports.sent')}</Banner>
      <AppText>{t('reports.sentHint')}</AppText>
      <AppText>{t('reports.mine.savedHint')}</AppText>
      <Button title={t('reports.another')} onPress={onAnother} />
    </Screen>
  );
}
function SavedActions({
  outcome,
  onAnother,
}: {
  outcome?: SubmissionOutcome;
  onAnother: () => void;
}) {
  const t = useT();
  if (outcome?.kind !== 'SAVED_OFFLINE') return null;
  return (
    <>
      <AppText>{t('reports.mine.savedHint')}</AppText>
      <Button title={t('reports.another')} variant="secondary" onPress={onAnother} />
    </>
  );
}
/** Every submission is journaled before sending; the sync engine owns delivery and retries. */
export function ReportHazardForm({ ownerId, deps, onSessionExpired }: Props) {
  const t = useT();
  const [fields, setFields] = useState<ReportDraft>({ description: '' });
  const [photoBusy, setPhotoBusy] = useState(false);
  const location = useCurrentLocation(deps.location);
  const submission = useReportSubmission(ownerId, deps);
  const draft = {
    ...fields,
    location: location.state.status === 'LOCATING' ? undefined : location.state.location,
  };
  const checked = validateReportDraft(draft);
  const disabled = submission.busy || photoBusy;
  function change(patch: Partial<ReportDraft>): void {
    setFields((previous) => ({ ...previous, ...patch }));
    submission.reset();
  }
  function another(): void {
    setFields({ description: '' });
    submission.reset();
  }
  useEffect(() => {
    if (submission.outcome?.kind === 'AUTH_REQUIRED')
      void onSessionExpired?.().catch(() => undefined);
  }, [submission.outcome, onSessionExpired]);
  if (isDelivered(submission.outcome)) return <SentConfirmation onAnother={another} />;
  const locationErrors = invalidLocations(checked);
  return (
    <Screen edges={['right', 'bottom', 'left']}>
      <AppText variant="title" accessibilityRole="header">
        {t('reports.title')}
      </AppText>
      <AppText color={colors.inkSoft}>{t('reports.intro')}</AppText>
      <OfflineBanner connectivity={deps.connectivity} />
      <View style={styles.card}>
        <HazardTiles
          value={fields.hazardType}
          onChange={(hazardType) => change({ hazardType })}
          disabled={disabled}
        />
        <LocationField state={location.state} retry={location.retry} disabled={disabled} />
        {locationErrors.map((problem) => (
          <Banner key={problem} tone="warning">
            {t(`reports.${problem}`)}
          </Banner>
        ))}
        <PhotoField
          photo={fields.photo}
          picker={deps.photos}
          onChange={(photo) => change({ photo })}
          disabled={submission.busy}
          onBusyChange={setPhotoBusy}
        />
        <DescriptionField
          value={fields.description}
          onChange={(description) => change({ description })}
          disabled={disabled}
        />
      </View>
      <SubmissionFeedback
        outcome={submission.outcome}
        busy={disabled}
        onChoice={(choice) => void submission.submit(draft, choice)}
        onEnableNotifications={deps.enableNotifications}
      />
      <SavedActions outcome={submission.outcome} onAnother={another} />
      {submission.problems.map((problem) => (
        <Banner key={problem} tone="warning">
          {t(`reports.${problem}`)}
        </Banner>
      ))}
      <Button
        title={t('reports.submit')}
        loadingTitle={t('reports.submitting')}
        loading={submission.busy}
        disabled={!checked.ok || photoBusy || submission.outcome?.kind === 'DUPLICATE_SUSPECTED'}
        onPress={() => void submission.submit(draft)}
      />
    </Screen>
  );
}

export function ReportHazardScreen() {
  const { state, expire } = useSession();
  if (state.status !== 'signedIn') return null;
  return (
    <ReportHazardForm
      key={state.user.userId}
      ownerId={state.user.userId}
      deps={reportDependencies}
      onSessionExpired={expire}
    />
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xl,
  },
  group: { gap: spacing.sm },
});
